// Extra behavior for the reading view: link cards, YouTube players and
// cards, resizable images and table editing. Everything edits the note's
// Markdown, so the file stays the source of truth.
import { t } from "../i18n";
import { noteTitle, resolveLink } from "../lib/markdown";
import { editTable, findTables, type MdTable } from "../lib/tables";
import { backend } from "../backend";
import { pref } from "../state/prefs";
import { attachFromComputer } from "../state/dropFiles";
import { contents, ensureLoaded, markdownPaths } from "../state/vault";
import { openMenu, type MenuItem } from "./ContextMenu";

type Ctx = { path: string; editable: boolean; get: () => string; set: (text: string) => void };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const plain = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/```[\s\S]*?```/g, " ").replace(/!\[\[[^\]]*\]\]/g, " ")
  .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a: string, b: string) => b || a.split("/").pop()!).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/^#+\s.*$/m, "").replace(/[#>*_`~=|-]/g, " ").replace(/\s+/g, " ").trim();

/** A paragraph that holds only this one element (a "bare" link). */
function alone(el: Element): HTMLElement | null {
  const p = el.parentElement;
  if (!p || p.tagName !== "P" || p.closest("li, td, th, .callout-title")) return null;
  for (const n of p.childNodes) if (n !== el && !(n.nodeType === 3 && !n.textContent!.trim()) && (n as Element).tagName !== "BR") return null;
  return p;
}

// ---------- Link cards ----------

export function linkCards(root: HTMLElement): void {
  if (pref("linkStyle") !== "card") return;
  for (const a of [...root.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-target]:not(.note-embed-title):not(.pdf-link)")]) {
    const p = alone(a);
    if (!p) continue;
    const path = resolveLink((a.dataset.target ?? "").split("#")[0], markdownPaths());
    if (!path) continue;
    const card = document.createElement("a");
    card.className = "wikilink link-card";
    card.href = "#";
    card.dataset.target = a.dataset.target!;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    card.innerHTML = `<span class="link-card-title" dir="auto">${esc(a.textContent || noteTitle(path))}</span>${folder ? `<span class="link-card-folder" dir="auto">${esc(folder)}</span>` : ""}<span class="link-card-text" dir="auto"></span>`;
    p.replaceWith(card);
    void ensureLoaded(path).then(() => {
      const s = plain(contents[path] ?? "");
      card.querySelector(".link-card-text")!.textContent = s.length > 180 ? `${s.slice(0, 180)}…` : s;
    });
  }
}

// ---------- YouTube ----------

const YT = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i;
const ytInfo = new Map<string, Promise<{ title: string; author: string } | null>>();
const PLAY = `<svg viewBox="0 0 68 48" aria-hidden="true"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#f00"/><path d="M45 24 27 14v20z" fill="#fff"/></svg>`;

export function youtubeEmbeds(root: HTMLElement): void {
  for (const a of [...root.querySelectorAll<HTMLAnchorElement>("a[href]")]) {
    const href = a.getAttribute("href") ?? "";
    const m = YT.exec(href);
    if (!m) continue;
    const p = alone(a);
    // Only bare links (the URL itself as the text) become players; [text](url) stays a link.
    if (!p || a.textContent!.trim().replace(/\/$/, "") !== href.replace(/\/$/, "")) continue;
    const id = m[1];
    const start = /[?&]t=(\d+)/.exec(href)?.[1];
    const card = pref("youtubeStyle") === "card";
    const box = document.createElement("div");
    box.className = `yt-embed${card ? " yt-card" : ""}`;
    box.innerHTML = `<button class="yt-thumb" type="button" aria-label="${esc(t(card ? "yt-open" : "yt-play"))}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" draggable="false"><span class="yt-play">${PLAY}</span></button>`
      + `<div class="yt-meta"><span class="yt-title" dir="auto">YouTube</span><span class="yt-channel" dir="auto"></span><a class="yt-link" href="${esc(href)}">${esc(t("yt-open"))}</a></div>`;
    const thumb = box.querySelector<HTMLButtonElement>(".yt-thumb")!;
    thumb.addEventListener("click", (e) => {
      e.preventDefault();
      if (card) { void backend.openUrl(href); return; }
      const frame = document.createElement("iframe");
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`;
      frame.title = box.querySelector(".yt-title")!.textContent ?? "YouTube";
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.className = "yt-frame";
      thumb.replaceWith(frame);
    });
    if (!ytInfo.has(id)) ytInfo.set(id, backend.youtubeInfo(id));
    void ytInfo.get(id)!.then((info) => {
      if (!info) return;
      box.querySelector(".yt-title")!.textContent = info.title;
      box.querySelector(".yt-channel")!.textContent = info.author;
      thumb.setAttribute("aria-label", `${t(card ? "yt-open" : "yt-play")}: ${info.title}`);
    });
    p.replaceWith(box);
  }
}

// ---------- Resizable images ----------

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wrap an embedded image so it can be resized by dragging its corner; the width is saved as `![[img|300]]`. */
export function makeResizable(img: HTMLImageElement, target: string, ctx: Ctx): HTMLElement {
  if (!ctx.editable) return img;
  const wrap = document.createElement("span");
  wrap.className = "img-resize";
  const handle = document.createElement("span");
  handle.className = "img-handle";
  handle.setAttribute("role", "slider");
  handle.setAttribute("aria-label", t("img-resize"));
  handle.tabIndex = 0;
  wrap.append(img, handle);
  const commit = (w: number) => {
    const width = Math.max(40, Math.round(w));
    const rx = new RegExp(`!\\[\\[${escRe(target)}(?:\\|[^\\]]*)?\\]\\]`);
    const text = ctx.get();
    if (rx.test(text)) ctx.set(text.replace(rx, `![[${target}|${width}]]`));
  };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startW = img.getBoundingClientRect().width;
    const rtl = getComputedStyle(wrap).direction === "rtl";
    const max = (wrap.closest(".reader") as HTMLElement | null)?.clientWidth ?? 2000;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { img.style.width = `${Math.min(max, Math.max(40, startW + (rtl ? startX - ev.clientX : ev.clientX - startX)))}px`; };
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); commit(img.getBoundingClientRect().width); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const w = img.getBoundingClientRect().width + (e.key === "ArrowRight" ? 20 : -20);
    img.style.width = `${w}px`;
    commit(w);
  });
  handle.addEventListener("click", (e) => e.stopPropagation());
  return wrap;
}

// ---------- Tables ----------

const clone = (x: MdTable): MdTable => ({ ...x, header: [...x.header], align: [...x.align], rows: x.rows.map((r) => [...r]) });

export function tableTools(root: HTMLElement, ctx: Ctx): void {
  if (!ctx.editable) return;
  const tables = [...root.querySelectorAll<HTMLTableElement>("table")].filter((x) => !x.closest(".note-embed, blockquote, .callout, li"));
  if (tables.length !== findTables(ctx.get()).length) return; // can't map safely
  tables.forEach((table, ti) => {
    const host = document.createElement("div");
    host.className = "table-host";
    table.replaceWith(host);
    host.append(table);
    const edit = (fn: (x: MdTable) => MdTable | null) => ctx.set(editTable(ctx.get(), ti, (x) => fn(clone(x))));
    const cols = () => findTables(ctx.get())[ti]?.header.length ?? 1;
    const bar = document.createElement("div");
    bar.className = "table-tools";
    const btn = (label: string, run: () => void) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn sm"; b.textContent = label; b.addEventListener("click", (e) => { e.preventDefault(); run(); }); bar.append(b); };
    btn(`+ ${t("table-row")}`, () => edit((x) => { x.rows.push(Array(cols()).fill("")); return x; }));
    btn(`+ ${t("table-column")}`, () => edit((x) => { x.header.push(t("table-column")); x.align.push(""); x.rows.forEach((r) => r.push("")); return x; }));
    host.prepend(bar);

    const cellAt = (el: HTMLElement) => {
      const td = el.closest<HTMLTableCellElement>("td, th");
      if (!td || !table.contains(td)) return null;
      const tr = td.parentElement as HTMLTableRowElement;
      const inHead = !!td.closest("thead");
      const r = inHead ? -1 : [...(table.tBodies[0]?.rows ?? [])].indexOf(tr);
      return { td, r, c: td.cellIndex };
    };
    const rawOf = (r: number, c: number) => { const x = findTables(ctx.get())[ti]; return x ? (r < 0 ? x.header[c] : x.rows[r]?.[c]) ?? "" : ""; };
    const setCell = (r: number, c: number, v: string) => edit((x) => { const row = r < 0 ? x.header : x.rows[r]; if (row) { while (row.length <= c) row.push(""); row[c] = v; } return x; });
    const editCell = (td: HTMLTableCellElement, r: number, c: number) => {
      if (td.querySelector(".cell-edit")) return;
      const before = td.innerHTML;
      const input = document.createElement("input");
      input.className = "input cell-edit";
      input.dir = "auto";
      input.value = rawOf(r, c);
      td.innerHTML = "";
      td.append(input);
      input.focus();
      let done = false;
      const finish = (save: boolean) => { if (done) return; done = true; if (save && input.value !== rawOf(r, c)) setCell(r, c, input.value); else td.innerHTML = before; };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") { e.preventDefault(); finish(false); } e.stopPropagation(); });
      input.addEventListener("blur", () => finish(true));
    };
    table.addEventListener("dblclick", (e) => {
      const at = cellAt(e.target as HTMLElement);
      if (!at || (e.target as HTMLElement).closest("a, input")) return;
      e.preventDefault();
      editCell(at.td, at.r, at.c);
    });
    table.addEventListener("contextmenu", (e) => {
      const at = cellAt(e.target as HTMLElement);
      if (!at) return;
      const { r, c } = at;
      const sort = (dir: 1 | -1) => edit((x) => { x.rows.sort((a, b) => dir * (a[c] ?? "").localeCompare(b[c] ?? "", undefined, { numeric: true, sensitivity: "base" })); return x; });
      const items: MenuItem[] = [
        { label: t("table-edit-cell"), run: () => editCell(at.td, r, c) },
        { label: t("table-insert-file"), run: async () => { const md = (await attachFromComputer()).replace(/\n/g, " "); if (md) setCell(r, c, `${rawOf(r, c)} ${md}`.trim()); } },
        { label: t("table-row-above"), sep: true, disabled: r < 0, run: () => edit((x) => { x.rows.splice(r, 0, Array(cols()).fill("")); return x; }) },
        { label: t("table-row-below"), run: () => edit((x) => { x.rows.splice(r + 1, 0, Array(cols()).fill("")); return x; }) },
        { label: t("table-row-delete"), danger: true, disabled: r < 0, run: () => edit((x) => { x.rows.splice(r, 1); return x; }) },
        { label: t("table-col-left"), sep: true, run: () => edit((x) => { x.header.splice(c, 0, ""); x.align.splice(c, 0, ""); x.rows.forEach((row) => row.splice(c, 0, "")); return x; }) },
        { label: t("table-col-right"), run: () => edit((x) => { x.header.splice(c + 1, 0, ""); x.align.splice(c + 1, 0, ""); x.rows.forEach((row) => row.splice(c + 1, 0, "")); return x; }) },
        { label: t("table-col-delete"), danger: true, disabled: cols() < 2, run: () => edit((x) => { x.header.splice(c, 1); x.align.splice(c, 1); x.rows.forEach((row) => row.splice(c, 1)); return x; }) },
        { label: t("table-align-left"), sep: true, run: () => edit((x) => { x.align[c] = "left"; return x; }) },
        { label: t("table-align-center"), run: () => edit((x) => { x.align[c] = "center"; return x; }) },
        { label: t("table-align-right"), run: () => edit((x) => { x.align[c] = "right"; return x; }) },
        { label: t("table-sort-asc"), sep: true, run: () => sort(1) },
        { label: t("table-sort-desc"), run: () => sort(-1) },
        { label: t("table-delete"), danger: true, sep: true, run: () => edit(() => null) },
      ];
      openMenu(e, items);
    });
  });
}
