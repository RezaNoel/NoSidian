// Rendered Markdown: math, callouts, code with copy, Mermaid, task toggles,
// embeds (images, audio, video, notes, PDFs), zoomable images and tags.
import { createEffect, createMemo, on } from "solid-js";
import { t } from "../i18n";
import { renderMarkdown, resolveLink, toggleTask } from "../lib/markdown";
import { blobUrl, fileKind, resolveAttachment } from "../lib/attachments";
import { pref } from "../state/prefs";
import { settings } from "../state/settings";
import { setZoomImage, toast } from "../state/ui";
import { contents, createNote, ensureLoaded, markdownPaths, openNote, setContent } from "../state/vault";
import { profile } from "../state/workspace";
import { openPdfAt } from "../state/pdf";
import { Properties } from "./Properties";

export function scrollReaderTo(slug: string): boolean {
  const el = document.getElementById(`h-${slug}`);
  if (!el) return false;
  el.scrollIntoView({ block: "start" });
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

const LIGHT = new Set(["paper-daylight", "warm-parchment"]);
let mermaidSeq = 0;

async function renderMermaid(root: HTMLElement) {
  const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-block[data-mermaid]:not([data-done])")];
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: LIGHT.has(settings.appearance.theme) ? "default" : "dark", fontFamily: "inherit" });
  for (const el of blocks) {
    el.dataset.done = "1";
    const src = decodeURIComponent(el.dataset.mermaid ?? "");
    try {
      const { svg } = await mermaid.render(`mmd-${++mermaidSeq}`, src);
      el.innerHTML = svg;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", src.split("\n")[0].slice(0, 120));
    } catch (e) {
      el.innerHTML = "";
      const pre = document.createElement("pre");
      pre.className = "mermaid-error";
      pre.textContent = `${src}\n\n${String((e as Error)?.message ?? e)}`;
      el.append(pre);
    }
  }
}

/** Fill `<span class="embed">` placeholders. Note embeds render one level deep. */
async function renderEmbeds(root: HTMLElement, from: string, depth: number) {
  for (const el of [...root.querySelectorAll<HTMLElement>("span.embed:not([data-done])")]) {
    el.dataset.done = "1";
    const target = el.dataset.embed ?? "";
    const kind = fileKind(target.split("#")[0]);
    if (!kind) {
      const path = resolveLink(target.split("#")[0], markdownPaths());
      if (!path || depth > 0) {
        el.innerHTML = `<a class="wikilink" href="#"></a>`;
        el.firstElementChild!.setAttribute("data-target", target);
        el.firstElementChild!.textContent = target;
        continue;
      }
      await ensureLoaded(path);
      const box = document.createElement("div");
      box.className = "note-embed markdown-body";
      box.innerHTML = renderMarkdown(contents[path] ?? "");
      const head = document.createElement("a");
      head.className = "note-embed-title wikilink";
      head.href = "#";
      head.dataset.target = path;
      head.textContent = path.replace(/\.md$/i, "");
      box.prepend(head);
      el.replaceWith(box);
      await renderEmbeds(box, path, depth + 1);
      await renderMermaid(box);
      continue;
    }
    const path = resolveAttachment(target, from);
    if (!path) {
      el.className = "embed missing";
      el.textContent = t("embed-missing", { name: target });
      continue;
    }
    if (kind === "pdf") {
      const page = /#page=(\d+)/.exec(target)?.[1];
      const a = document.createElement("a");
      a.className = "wikilink pdf-link";
      a.href = "#";
      a.dataset.target = page ? `${path}#page=${page}` : path;
      a.textContent = `${path.split("/").pop()}${page ? ` · ${t("media-page", { page })}` : ""}`;
      el.replaceWith(a);
      continue;
    }
    try {
      const url = await blobUrl(path);
      const size = el.dataset.size ?? "";
      let node: HTMLElement;
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = url;
        img.alt = el.dataset.alt || path.split("/").pop()!;
        img.loading = "lazy";
        img.className = "zoomable";
        img.tabIndex = 0;
        const w = /^(\d+)(?:x(\d+))?$/.exec(size);
        if (w) img.style.width = `${w[1]}px`;
        node = img;
      } else {
        const media = document.createElement(kind);
        media.controls = true;
        media.src = url;
        media.preload = "metadata";
        media.setAttribute("aria-label", path.split("/").pop()!);
        node = media;
      }
      el.replaceWith(node);
    } catch {
      el.className = "embed missing";
      el.textContent = t("embed-missing", { name: target });
    }
  }
}

function enhance(root: HTMLElement, path: string) {
  for (const b of root.querySelectorAll<HTMLButtonElement>(".code-copy")) {
    b.textContent = t("action-copy");
    b.setAttribute("aria-label", t("action-copy"));
  }
  for (const img of root.querySelectorAll<HTMLImageElement>("img:not(.zoomable)")) {
    img.classList.add("zoomable");
    img.tabIndex = 0;
  }
  for (const cb of root.querySelectorAll<HTMLInputElement>("input.task-box")) {
    cb.setAttribute("aria-label", cb.parentElement?.textContent?.trim().slice(0, 80) ?? "");
  }
  void renderEmbeds(root, path, 0).then(() => renderMermaid(root));
}

/** Open a wikilink target: notes, `file.pdf#page=3`, or create a missing note. */
export function followLink(target: string) {
  const [name, frag] = target.split("#");
  if (/\.pdf$/i.test(name)) {
    const path = resolveAttachment(name);
    if (path) openPdfAt(path, Number(/page=(\d+)/.exec(frag ?? "")?.[1] ?? 1));
    return;
  }
  const path = resolveLink(name, markdownPaths());
  if (path) {
    openNote(path);
    if (frag) setTimeout(() => scrollReaderTo(frag.toLowerCase().trim().replace(/\s+/g, "-")), 120);
  } else void createNote(name.split("/").pop()!, name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : undefined);
}

export function Reader(props: { path: string; source?: () => string; readOnly?: boolean }) {
  let el!: HTMLElement;
  const text = () => (props.source ? props.source() : contents[props.path] ?? "");
  const html = createMemo(() => renderMarkdown(text(), { breaks: !pref("strictBreaks") }));
  createEffect(on(html, () => queueMicrotask(() => el && enhance(el, props.path))));
  const dir = () => profile.noteDirs?.[props.path] ?? "auto";

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.matches("img.zoomable")) {
      setZoomImage({ src: (target as HTMLImageElement).src, alt: (target as HTMLImageElement).alt });
      return;
    }
    const copy = target.closest<HTMLButtonElement>(".code-copy");
    if (copy) {
      const code = copy.closest(".code-block")?.querySelector("code")?.textContent ?? "";
      void navigator.clipboard?.writeText(code).then(() => toast(t("copied")));
      return;
    }
    const a = target.closest("a");
    if (!a) return;
    if (a.dataset.tag !== undefined) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("nosidian:search", { detail: `#${a.dataset.tag}` }));
      return;
    }
    if (a.dataset.target !== undefined) {
      e.preventDefault();
      followLink(a.dataset.target);
      return;
    }
    // External links open in the system browser, never inside the app window.
    const href = a.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      e.preventDefault();
      window.open(href, "_blank", "noopener");
    } else if (href.startsWith("#")) {
      e.preventDefault();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && target.matches("img.zoomable")) {
      e.preventDefault();
      setZoomImage({ src: (target as HTMLImageElement).src, alt: (target as HTMLImageElement).alt });
    }
  };
  const onChange = (e: Event) => {
    const cb = e.target as HTMLInputElement;
    if (!cb.matches("input.task-box") || props.readOnly) return;
    setContent(props.path, toggleTask(contents[props.path] ?? "", Number(cb.dataset.task), cb.checked));
  };
  return (
    <div class="reader-wrap">
      {pref("propsInReader") && !props.source && <Properties path={props.path} readOnly />}
      <article ref={el} class="reader markdown-body" dir={dir()} aria-label={t("mode-reader")} innerHTML={html()} onClick={onClick} onKeyDown={onKey} onChange={onChange} tabIndex={0} />
    </div>
  );
}
