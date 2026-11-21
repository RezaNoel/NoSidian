// PDF viewer: lazy page rendering with a selectable text layer, zoom and fit
// width, page jump, thumbnails and outline, search, reading tints, and tools
// that turn a selection into a quote note or a flashcard.
import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { BookmarkPlus, Brain, ChevronLeft, ChevronRight, Link2, MoveHorizontal, PanelLeft, Quote, Search, ZoomIn, ZoomOut } from "lucide-solid";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { t } from "../i18n";
import { backend } from "../backend";
import { announce } from "../a11y/announcer";
import { appendToNote } from "../state/vault";
import { pdfPages, setPdfPage } from "../state/pdf";
import { toast } from "../state/ui";
import { appendCard, cardsPath } from "../state/srs";

type Tint = "none" | "dark" | "sepia";
interface OutlineItem { title: string; page: number; depth: number }

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsReady ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsReady;
}

const notesPathFor = (path: string) => `${path.replace(/\.pdf$/i, "")} ${t("pdf-notes-suffix")}.md`;

export function PdfView(props: { path: string }) {
  let scroller!: HTMLDivElement;
  const [doc, setDoc] = createSignal<PDFDocumentProxy | null>(null);
  const [error, setError] = createSignal(false);
  const [pageCount, setPageCount] = createSignal(0);
  const [page, setPage] = createSignal(pdfPages[props.path] ?? 1);
  const [scale, setScale] = createSignal(1.2);
  const [tint, setTint] = createSignal<Tint>("none");
  const [side, setSide] = createSignal<"none" | "thumbs" | "outline">("none");
  const [outline, setOutline] = createSignal<OutlineItem[]>([]);
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<number[]>([]);
  const [hitIndex, setHitIndex] = createSignal(0);
  const sizes: { w: number; h: number }[] = [];
  const rendered = new Map<number, number>(); // page -> scale it was drawn at
  const texts = new Map<number, string>();
  let observer: IntersectionObserver | undefined;
  let disposed = false;
  let task: { destroy(): Promise<void> } | undefined;

  onMount(async () => {
    try {
      const lib = await loadPdfjs();
      const bytes = await backend.fileRead(props.path);
      const loading = lib.getDocument({ data: bytes.slice() });
      task = loading;
      const pdf = await loading.promise;
      if (disposed) return void task.destroy();
      for (let i = 1; i <= pdf.numPages; i++) {
        const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
      setDoc(pdf);
      setPageCount(pdf.numPages);
      void loadOutline(pdf);
      requestAnimationFrame(() => goTo(Math.min(page(), pdf.numPages), false));
    } catch {
      setError(true);
    }
  });
  onCleanup(() => { disposed = true; observer?.disconnect(); void task?.destroy(); });

  async function loadOutline(pdf: PDFDocumentProxy) {
    const items: OutlineItem[] = [];
    const walk = async (nodes: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, depth: number) => {
      for (const n of nodes ?? []) {
        let target = 1;
        try {
          const dest = typeof n.dest === "string" ? await pdf.getDestination(n.dest) : n.dest;
          if (dest?.[0]) target = (await pdf.getPageIndex(dest[0] as never)) + 1;
        } catch { /* unresolvable entries point at page 1 */ }
        items.push({ title: n.title, page: target, depth });
        await walk(n.items, depth + 1);
      }
    };
    await walk(await pdf.getOutline(), 0);
    setOutline(items);
  }

  async function renderPage(n: number) {
    const pdf = doc();
    const host = scroller?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!pdf || !host || rendered.get(n) === scale()) return;
    const s = scale();
    rendered.set(n, s);
    const p: PDFPageProxy = await pdf.getPage(n);
    const vp = p.getViewport({ scale: s });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * ratio);
    canvas.height = Math.floor(vp.height * ratio);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    canvas.setAttribute("aria-hidden", "true");
    await p.render({ canvas, viewport: p.getViewport({ scale: s * ratio }) }).promise.catch(() => undefined);
    if (rendered.get(n) !== s) return;
    const layer = document.createElement("div");
    layer.className = "textLayer";
    host.style.setProperty("--total-scale-factor", String(s));
    host.replaceChildren(canvas, layer);
    const lib = await loadPdfjs();
    await new lib.TextLayer({ textContentSource: p.streamTextContent(), container: layer, viewport: vp }).render().catch(() => undefined);
    markHits(n);
  }

  // Lazy rendering: draw pages as they scroll near the viewport, track the current page.
  createEffect(on([doc, scale], () => {
    if (!doc()) return;
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) void renderPage(Number((e.target as HTMLElement).dataset.page));
    }, { root: scroller, rootMargin: "600px 0px" });
    queueMicrotask(() => scroller?.querySelectorAll("[data-page]").forEach((el) => observer!.observe(el)));
  }));

  const onScroll = () => {
    const mid = scroller.scrollTop + scroller.clientHeight / 3;
    for (const el of scroller.querySelectorAll<HTMLElement>("[data-page]")) {
      if (el.offsetTop + el.offsetHeight > mid) {
        const n = Number(el.dataset.page);
        if (n !== page()) { setPage(n); setPdfPage(props.path, n); }
        break;
      }
    }
  };

  function goTo(n: number, smooth = true) {
    const target = Math.max(1, Math.min(pageCount() || 1, n));
    setPage(target);
    setPdfPage(props.path, target);
    scroller?.querySelector<HTMLElement>(`[data-page="${target}"]`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }

  // Opening `file.pdf#page=N` while this tab is open jumps to that page.
  createEffect(on(() => pdfPages[props.path], (p) => { if (p && p !== page() && doc()) goTo(p); }, { defer: true }));

  const zoom = (f: number) => setScale((s) => Math.round(Math.max(0.4, Math.min(4, s * f)) * 100) / 100);
  const fitWidth = () => { const w = sizes[page() - 1]?.w; if (w) setScale(Math.round(((scroller.clientWidth - 48) / w) * 100) / 100); };

  async function pageText(n: number): Promise<string> {
    if (!texts.has(n)) {
      const c = await (await doc()!.getPage(n)).getTextContent();
      texts.set(n, c.items.map((i) => ("str" in i ? i.str : "")).join(" "));
    }
    return texts.get(n)!;
  }

  async function search() {
    const q = query().trim().toLowerCase();
    if (!q || !doc()) { setHits([]); return; }
    const found: number[] = [];
    for (let i = 1; i <= pageCount(); i++) if ((await pageText(i)).toLowerCase().includes(q)) found.push(i);
    setHits(found);
    setHitIndex(0);
    announce(found.length ? t("pdf-matches", { count: found.length }) : t("pdf-no-matches"));
    scroller.querySelectorAll("[data-page]").forEach((el) => markHits(Number((el as HTMLElement).dataset.page)));
    if (found.length) goTo(found[0]);
  }
  function markHits(n: number) {
    const q = query().trim().toLowerCase();
    scroller?.querySelectorAll<HTMLElement>(`[data-page="${n}"] .textLayer span`).forEach((s) => {
      s.classList.toggle("pdf-hit", !!q && (s.textContent ?? "").toLowerCase().includes(q));
    });
  }
  const nextHit = (d: number) => {
    const list = hits();
    if (!list.length) return;
    const i = (hitIndex() + d + list.length) % list.length;
    setHitIndex(i);
    goTo(list[i]);
  };

  const selection = () => {
    const sel = window.getSelection();
    const text = sel && scroller.contains(sel.anchorNode) ? sel.toString().replace(/\s+/g, " ").trim() : "";
    if (!text) toast(t("pdf-select-first"));
    return text;
  };
  const link = () => `[[${props.path}#page=${page()}]]`;

  async function extract() {
    const text = selection();
    if (!text) return;
    await appendToNote(notesPathFor(props.path), `> ${text}\n> — ${link()}`);
    toast(t("pdf-extracted", { name: notesPathFor(props.path).split("/").pop()! }));
  }
  async function toCard() {
    const text = selection();
    if (!text) return;
    await appendCard(`${t("pdf-card-question", { page: page() })} ${link()}`, text);
    toast(t("pdf-card-added", { name: cardsPath() }));
  }

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input")) return;
    if (e.key === "PageDown" || (e.key === "ArrowRight" && !e.ctrlKey)) { e.preventDefault(); goTo(page() + 1); }
    if (e.key === "PageUp" || (e.key === "ArrowLeft" && !e.ctrlKey)) { e.preventDefault(); goTo(page() - 1); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom(1.15); }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoom(1 / 1.15); }
  };

  return (
    <div class="pdf-view" data-tint={tint()} onKeyDown={onKey}>
      <div class="pdf-toolbar" role="toolbar" aria-label={t("pdf-label", { name: props.path.split("/").pop()! })}>
        <button class="icon-btn" aria-pressed={side() !== "none"} title={t("pdf-sidebar")} aria-label={t("pdf-sidebar")} onClick={() => setSide((s) => (s === "none" ? "thumbs" : "none"))}><PanelLeft class="flip-rtl" /></button>
        <button class="icon-btn" title={t("pdf-prev")} aria-label={t("pdf-prev")} disabled={page() <= 1} onClick={() => goTo(page() - 1)}><ChevronLeft class="flip-rtl" /></button>
        <label class="pdf-page">
          <span class="sr-only">{t("pdf-page")}</span>
          <input type="number" min="1" max={pageCount()} value={page()} onChange={(e) => goTo(Number(e.currentTarget.value))} />
          <span aria-hidden="true">/ {pageCount()}</span>
        </label>
        <button class="icon-btn" title={t("pdf-next")} aria-label={t("pdf-next")} disabled={page() >= pageCount()} onClick={() => goTo(page() + 1)}><ChevronRight class="flip-rtl" /></button>
        <span class="tb-sep" />
        <button class="icon-btn" title={t("pdf-zoom-out")} aria-label={t("pdf-zoom-out")} onClick={() => zoom(1 / 1.15)}><ZoomOut /></button>
        <span class="pdf-zoom" aria-live="polite">{Math.round(scale() * 100)}%</span>
        <button class="icon-btn" title={t("pdf-zoom-in")} aria-label={t("pdf-zoom-in")} onClick={() => zoom(1.15)}><ZoomIn /></button>
        <button class="icon-btn" title={t("pdf-fit-width")} aria-label={t("pdf-fit-width")} onClick={fitWidth}><MoveHorizontal /></button>
        <span class="tb-sep" />
        <form class="pdf-search" role="search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <Search aria-hidden="true" />
          <input type="search" placeholder={t("pdf-search")} aria-label={t("pdf-search")} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && hits().length && e.shiftKey) { e.preventDefault(); nextHit(-1); } }} />
          <Show when={hits().length}>
            <span class="count">{hitIndex() + 1}/{hits().length}</span>
            <button type="button" class="icon-btn sm" aria-label={t("pdf-prev")} onClick={() => nextHit(-1)}><ChevronLeft class="flip-rtl" /></button>
            <button type="button" class="icon-btn sm" aria-label={t("pdf-next")} onClick={() => nextHit(1)}><ChevronRight class="flip-rtl" /></button>
          </Show>
        </form>
        <span class="tb-fill" />
        <select class="select sm" aria-label={t("pdf-tint")} value={tint()} onChange={(e) => setTint(e.currentTarget.value as Tint)}>
          <option value="none">{t("pdf-tint-none")}</option>
          <option value="dark">{t("pdf-tint-dark")}</option>
          <option value="sepia">{t("pdf-tint-sepia")}</option>
        </select>
        <button class="icon-btn" title={t("pdf-extract")} aria-label={t("pdf-extract")} onClick={() => void extract()}><Quote /></button>
        <button class="icon-btn" title={t("pdf-to-card")} aria-label={t("pdf-to-card")} onClick={() => void toCard()}><Brain /></button>
        <button class="icon-btn" title={t("pdf-copy-link")} aria-label={t("pdf-copy-link")} onClick={() => void navigator.clipboard?.writeText(link()).then(() => toast(t("copied")))}><Link2 /></button>
      </div>
      <div class="pdf-body">
        <Show when={side() !== "none"}>
          <aside class="pdf-side" aria-label={t("pdf-sidebar")}>
            <div class="segmented compact" role="tablist">
              <button role="tab" aria-selected={side() === "thumbs"} onClick={() => setSide("thumbs")}>{t("pdf-thumbs")}</button>
              <button role="tab" aria-selected={side() === "outline"} onClick={() => setSide("outline")}>{t("pdf-outline")}</button>
            </div>
            <Show when={side() === "thumbs"}>
              <ol class="pdf-thumbs">
                <For each={Array.from({ length: pageCount() }, (_, i) => i + 1)}>
                  {(n) => <li><button class="pdf-thumb" aria-current={n === page() ? "page" : undefined} onClick={() => goTo(n)}><BookmarkPlus aria-hidden="true" />{t("pdf-page-of", { page: n, total: pageCount() })}</button></li>}
                </For>
              </ol>
            </Show>
            <Show when={side() === "outline"}>
              <Show when={outline().length} fallback={<p class="empty sm">{t("pdf-outline-empty")}</p>}>
                <ul class="pdf-outline">
                  <For each={outline()}>{(o) => <li style={{ "padding-inline-start": `${o.depth * 12}px` }}><button class="list-row" onClick={() => goTo(o.page)}><span class="list-title" dir="auto">{o.title}</span><span class="count">{o.page}</span></button></li>}</For>
                </ul>
              </Show>
            </Show>
          </aside>
        </Show>
        <div ref={scroller} class="pdf-pages" tabIndex={0} aria-label={t("pdf-label", { name: props.path.split("/").pop()! })} onScroll={onScroll}>
          <Show when={!error()} fallback={<p class="empty">{t("pdf-error")}</p>}>
            <Show when={doc()} fallback={<p class="empty">{t("pdf-loading")}</p>}>
              <For each={sizes}>
                {(sz, i) => (
                  <div class="pdf-page-box" data-page={i() + 1} role="region" aria-label={t("pdf-page-of", { page: i() + 1, total: pageCount() })} style={{ width: `${sz.w * scale()}px`, height: `${sz.h * scale()}px` }} />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
