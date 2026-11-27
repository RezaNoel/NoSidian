// Keeps the media shelf and the notes in the book and film folders in step:
// - every note in those folders (and their subfolders) shows on the shelf,
//   read from its frontmatter, as soon as the vault opens;
// - every change on the shelf is written back to the entry's note frontmatter.
import { createEffect, createRoot, on } from "solid-js";
import { t } from "../i18n";
import { askConfirm } from "./ui";
import { buildFrontmatter, parseFrontmatter } from "../core/markdown";
import type { BookEntry, BookReadStatus, CinemaEntry, CinemaWatchStatus } from "../core/types";
import { backend } from "../backend";
import { media } from "./media";
import { pref } from "./prefs";
import { contents, ensureLoaded, markdownPaths, onTrashed, setContent, tree, vault } from "./vault";

export type MediaKind = "book" | "movie";

const clean = (f: string) => f.trim().replace(/^\/+|\/+$/g, "");
export const mediaFolder = (kind: MediaKind) => clean(kind === "book" ? pref("mediaBooksFolder") : pref("mediaMoviesFolder")) || (kind === "book" ? "Books" : "Movies");
const inFolder = (path: string, folder: string) => path.toLowerCase().startsWith(`${folder.toLowerCase()}/`);

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? "")).trim();
const num = (v: string | string[] | undefined, d = 0) => { const n = parseFloat(str(v)); return Number.isFinite(n) ? n : d; };
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : str(v).split(",")).map((x) => x.trim()).filter(Boolean);
const titleOf = (path: string, body: string) => body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.split("/").pop()!.replace(/\.md$/i, "");
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const opt = (v: string) => v || undefined;
/** "[[People/Ana]]" or "Ana" -> "People/Ana.md" (what the shelf stores). */
const notePathOf = (v: string) => { const x = v.replace(/^["']|["']$/g, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim(); return x ? (/\.md$/i.test(x) ? x : `${x}.md`) : undefined; };

const BOOK_STATUS: BookReadStatus[] = ["to-read", "reading", "finished"];
const MOVIE_STATUS: CinemaWatchStatus[] = ["watchlist", "watching", "watched"];

function bookFromNote(path: string, text: string): BookEntry {
  const { props, body } = parseFrontmatter(text);
  const progress = str(props.progress).match(/(\d+)\s*\/\s*(\d+)/);
  const status = str(props.status) as BookReadStatus;
  const now = Date.now();
  return {
    id: uid(), title: str(props.title) || titleOf(path, body), author: str(props.author).replace(/^Unknown$/, ""),
    status: BOOK_STATUS.includes(status) ? status : "to-read",
    currentPage: num(props.page, progress ? Number(progress[1]) : 0), totalPages: num(props.pages, progress ? Number(progress[2]) : 0),
    genre: str(props.genre), rating: Math.max(0, Math.min(5, Math.round(num(props.rating)))), score: num(props.score) || undefined,
    format: (["paper", "ebook", "audio"] as const).find((f) => f === str(props.format)),
    cover: opt(str(props.cover)), startedDate: opt(str(props.started)), finishedDate: opt(str(props.finished)),
    recommendedBy: notePathOf(str(props.recommended_by)), link: opt(str(props.link)), tags: list(props.tags).filter((x) => x !== "books" && x !== "reading"),
    highlights: parseQuotes(readSection(body, QUOTE_HEADS.book) ?? "").map((q, i) => ({ id: `${uid()}${i}`, ...q })),
    notes: readSection(body, NOTE_HEADS.book) ?? "", linkedNotePath: path, createdAt: now, updatedAt: now,
  };
}

function movieFromNote(path: string, text: string): CinemaEntry {
  const { props, body } = parseFrontmatter(text);
  const status = str(props.status) as CinemaWatchStatus;
  const now = Date.now();
  return {
    id: uid(), title: str(props.title) || titleOf(path, body), mediaType: str(props.type) === "series" ? "series" : "movie",
    status: MOVIE_STATUS.includes(status) ? status : "watchlist",
    director: str(props.director).replace(/^Unknown$/, ""), year: str(props.year), genre: str(props.genre),
    runtimeMin: num(props.runtime_min), episodesWatched: num(props.episodes), episodesTotal: num(props.episodes_total),
    rating: Math.max(0, Math.min(5, Math.round(num(props.rating)))), score: num(props.score) || undefined,
    cover: opt(str(props.cover)), watchedDate: opt(str(props.watched)), platform: opt(str(props.platform)),
    recommendedBy: notePathOf(str(props.recommended_by)), link: opt(str(props.link)), tags: list(props.tags).filter((x) => x !== "cinema" && x !== "movie" && x !== "series"),
    favoriteQuotes: parseQuotes(readSection(body, QUOTE_HEADS.movie) ?? "").map((q) => q.quote),
    notes: readSection(body, NOTE_HEADS.movie) ?? "", linkedNotePath: path, createdAt: now, updatedAt: now,
  };
}

/** The frontmatter fields the shelf owns for one entry ("" removes a field). */
function fieldsOf(kind: MediaKind, e: BookEntry | CinemaEntry): Record<string, string | string[]> {
  const common = {
    title: e.title, genre: e.genre, rating: String(e.rating), score: e.score ? String(e.score) : "",
    cover: e.cover ?? "", recommended_by: e.recommendedBy ? `"[[${e.recommendedBy.replace(/\.md$/i, "")}]]"` : "", link: e.link ?? "",
  };
  if (kind === "book") {
    const b = e as BookEntry;
    return { type: "book", ...common, author: b.author, status: b.status, page: String(b.currentPage), pages: String(b.totalPages),
      started: b.startedDate ?? "", finished: b.finishedDate ?? "", format: b.format ?? "", tags: ["books", ...(b.tags ?? [])] };
  }
  const m = e as CinemaEntry;
  return { type: m.mediaType, ...common, director: m.director, year: m.year, status: m.status, runtime_min: m.runtimeMin ? String(m.runtimeMin) : "",
    episodes: m.mediaType === "series" ? String(m.episodesWatched) : "", episodes_total: m.mediaType === "series" ? String(m.episodesTotal) : "",
    watched: m.watchedDate ?? "", platform: m.platform ?? "", tags: ["cinema", m.mediaType, ...(m.tags ?? [])] };
}


// The notes and quotes live in the note body, under these headings. The first
// name is the one written for new sections; the rest are also read.
const NOTE_HEADS = { book: ["Core Synthesis & Summary", "Summary", "Notes"], movie: ["Takeaways & Review", "Review", "Notes"] };
const QUOTE_HEADS = { book: ["Highlights & Quotes", "Highlights", "Quotes"], movie: ["Favorite Quotes & Scenes", "Favourite quotes", "Quotes"] };
// Placeholder text from a fresh note counts as empty.
const PLACEHOLDERS = [
  "Summarize the central thesis, actionable ideas, and chapter takeaways.",
  "Write your spoiler-free reflections, cinematography notes, and key themes here.",
  "> Capture your favorite passages and vocabulary highlights here.",
  '> "Add memorable dialogue or scene quote here..."',
];

/** Line range [from, to) of the body under the first matching "## " heading. */
function sectionRange(lines: string[], heads: string[]): [number, number] | null {
  const want = heads.map((h) => h.toLowerCase());
  const at = lines.findIndex((l) => /^##\s+/.test(l) && want.includes(l.replace(/^##\s+/, "").trim().toLowerCase()));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) end++;
  return [at + 1, end];
}
function readSection(body: string, heads: string[]): string | null {
  const lines = body.split("\n");
  const r = sectionRange(lines, heads);
  if (!r) return null;
  const text = lines.slice(r[0], r[1]).join("\n").trim();
  return PLACEHOLDERS.includes(text) ? "" : text;
}
function writeSection(body: string, heads: string[], text: string): string {
  const lines = body.split("\n");
  const r = sectionRange(lines, heads);
  const block = text ? ["", text, ""] : [""];
  if (r) { lines.splice(r[0], r[1] - r[0], ...block); return lines.join("\n"); }
  if (!text) return body;
  return `${body.replace(/\s*$/, "")}\n\n## ${heads[0]}\n\n${text}\n`;
}

function quotesText(kind: MediaKind, e: BookEntry | CinemaEntry): string {
  if (kind === "movie") return (e as CinemaEntry).favoriteQuotes.map((q) => `> ${q}`).join("\n\n");
  return (e as BookEntry).highlights.map((h) => `> ${h.quote.replace(/\n/g, "\n> ")}${h.page ? `\n> — *p. ${h.page}*` : ""}${h.note ? `\n\n- Note: ${h.note}` : ""}`).join("\n\n");
}
/** Quote blocks: "> " lines, an optional "> — *p. N*" line and "- Note:" lines after. */
function parseQuotes(text: string): { quote: string; page?: number; note?: string }[] {
  type Cur = { lines: string[]; page?: number; note?: string; gap?: boolean };
  const out: { quote: string; page?: number; note?: string }[] = [];
  let cur: Cur | null = null;
  const flush = () => { if (cur && cur.lines.length) out.push({ quote: cur.lines.join("\n").trim(), page: cur.page, note: cur.note }); cur = null; };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (l.startsWith(">")) {
      const v = l.replace(/^>\s?/, "");
      const pg = v.match(/^[—-]\s*\*?p\.\s*(\d+)\*?$/);
      if (cur && pg && !cur.gap) { cur.page = Number(pg[1]); continue; }
      if (cur && (cur.gap || cur.note !== undefined)) flush();
      const c: Cur = cur ?? { lines: [] };
      c.lines.push(v.replace(/^"(.*)"$/, "$1"));
      cur = c;
    } else if (/^-\s*Note:\s*/i.test(l) && cur) {
      (cur as Cur).note = l.replace(/^-\s*Note:\s*/i, "");
    } else if (l === "") {
      if (cur) (cur as Cur).gap = true;
    } else {
      flush();
    }
  }
  flush();
  return out.filter((q) => q.quote);
}

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/** Write the shelf's fields into the entry's note (keeps everything else in the note). */
export function syncEntryToNote(kind: MediaKind, entry: BookEntry | CinemaEntry): void {
  const path = entry.linkedNotePath;
  if (!path || !markdownPaths().includes(path)) return;
  clearTimeout(pendingWrites.get(path));
  pendingWrites.set(path, setTimeout(async () => {
    pendingWrites.delete(path);
    await ensureLoaded(path);
    const text = contents[path] ?? "";
    const { props, body } = parseFrontmatter(text);
    const next: Record<string, string | string[]> = { ...props };
    for (const [k, v] of Object.entries(fieldsOf(kind, entry))) {
      if (v === "" || (Array.isArray(v) && !v.length)) delete next[k];
      else next[k] = v;
    }
    let nextBody = writeSection(body, NOTE_HEADS[kind], entry.notes.trim());
    nextBody = writeSection(nextBody, QUOTE_HEADS[kind], quotesText(kind, entry));
    const out = buildFrontmatter(next, nextBody.startsWith("\n") ? nextBody : `\n${nextBody}`);
    if (out !== text) setContent(path, out);
  }, 500));
}

// Entries just updated from their note: their next change must not be written back.
const fromNote = new Set<string>();

/** Read a linked note and copy what changed in it onto its shelf entry. */
function pullFromNote(path: string): void {
  const text = contents[path];
  if (text === undefined) return;
  media.update((m) => {
    const b = m.books.find((x) => x.linkedNotePath === path);
    const mv = b ? undefined : m.movies.find((x) => x.linkedNotePath === path);
    const e = b ?? mv;
    if (!e) return;
    const kind: MediaKind = b ? "book" : "movie";
    const before = JSON.stringify([fieldsOf(kind, e), e.notes, quotesText(kind, e)]);
    const body = parseFrontmatter(text).body;
    const notesSec = readSection(body, NOTE_HEADS[kind]);
    const quotesSec = readSection(body, QUOTE_HEADS[kind]);
    if (b) {
      const n = bookFromNote(path, text);
      Object.assign(b, { title: n.title, author: n.author, status: n.status, currentPage: n.currentPage, totalPages: n.totalPages, genre: n.genre,
        rating: n.rating, score: n.score, format: n.format, cover: n.cover, startedDate: n.startedDate, finishedDate: n.finishedDate,
        recommendedBy: n.recommendedBy, link: n.link, tags: n.tags });
      if (notesSec !== null) b.notes = notesSec;
      if (quotesSec !== null) {
        const old = b.highlights;
        b.highlights = parseQuotes(quotesSec).map((q, i) => ({ id: old.find((h) => h.quote === q.quote)?.id ?? `${uid()}${i}`, ...q }));
      }
    } else if (mv) {
      const n = movieFromNote(path, text);
      Object.assign(mv, { title: n.title, mediaType: n.mediaType, status: n.status, director: n.director, year: n.year, genre: n.genre,
        runtimeMin: n.runtimeMin, episodesWatched: n.episodesWatched, episodesTotal: n.episodesTotal, rating: n.rating, score: n.score,
        cover: n.cover, watchedDate: n.watchedDate, platform: n.platform, recommendedBy: n.recommendedBy, link: n.link, tags: n.tags });
      if (notesSec !== null) mv.notes = notesSec;
      if (quotesSec !== null) mv.favoriteQuotes = parseQuotes(quotesSec).map((q) => q.quote);
    }
    if (JSON.stringify([fieldsOf(kind, e), e.notes, quotesText(kind, e)]) !== before) {
      e.updatedAt = Date.now();
      fromNote.add(`${kind}:${e.id}`);
    }
  });
}

let scanning = false;
/** Add every note in the book and film folders that is not on the shelf yet. */
export async function scanMediaFolders(): Promise<void> {
  if (scanning || !vault() || !media.ready()) return;
  scanning = true;
  try {
    const linked = new Set([...media.state.books, ...media.state.movies].map((e) => e.linkedNotePath).filter(Boolean) as string[]);
    const books = mediaFolder("book"), movies = mediaFolder("movie");
    const fresh = markdownPaths().filter((p) => !linked.has(p) && (inFolder(p, books) || inFolder(p, movies)));
    if (!fresh.length) return;
    const newBooks: BookEntry[] = [], newMovies: CinemaEntry[] = [];
    for (const p of fresh) {
      const text = contents[p] ?? (await backend.read(p).catch(() => ""));
      const type = str(parseFrontmatter(text).props.type);
      const asMovie = inFolder(p, movies) && !(type === "book");
      if (asMovie || type === "movie" || type === "series") newMovies.push(movieFromNote(p, text));
      else newBooks.push(bookFromNote(p, text));
    }
    media.update((m) => {
      const have = new Set([...m.books, ...m.movies].map((e) => e.linkedNotePath));
      m.books.push(...newBooks.filter((e) => !have.has(e.linkedNotePath)));
      m.movies.push(...newMovies.filter((e) => !have.has(e.linkedNotePath)));
    });
  } finally {
    scanning = false;
  }
}

/** Follow notes that were renamed or moved, so entries keep their note. */
function dropMissingLinks(): void {
  const paths = new Set(markdownPaths());
  if (!paths.size) return;
  const stale = [...media.state.books, ...media.state.movies].some((e) => e.linkedNotePath && !paths.has(e.linkedNotePath));
  if (!stale) return;
  media.update((m) => {
    for (const e of [...m.books, ...m.movies]) if (e.linkedNotePath && !paths.has(e.linkedNotePath)) e.linkedNotePath = undefined;
  });
}

createRoot(() => {
  // Write any changed entry back to its note, whatever changed it (shelf, cover, best list...).
  let seen = new Map<string, string>();
  createEffect(on(() => (media.ready() ? JSON.stringify([media.state.books, media.state.movies]) : ""), (json, prevJson) => {
    if (!json) { seen = new Map(); return; }
    const books = media.state.books, movies = media.state.movies;
    const next = new Map<string, string>();
    const visit = (kind: MediaKind, e: BookEntry | CinemaEntry) => {
      const key = `${kind}:${e.id}`;
      const sig = JSON.stringify([fieldsOf(kind, e), e.notes, quotesText(kind, e)]);
      next.set(key, sig);
      const changed = prevJson && seen.has(key) && seen.get(key) !== sig;
      if (fromNote.delete(key)) return;
      if (changed) syncEntryToNote(kind, e);
    };
    books.forEach((e) => visit("book", e));
    movies.forEach((e) => visit("movie", e));
    seen = next;
  }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on(
    () => [vault()?.root, tree.notes.length, media.ready(), pref("mediaBooksFolder"), pref("mediaMoviesFolder")],
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (media.ready() && tree.notes.length) { dropMissingLinks(); void scanMediaFolders(); } }, 300);
    },
  ));

  // A linked note changed (typed in the editor or edited outside the app): copy it to the shelf.
  const pullTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastText = new Map<string, string>();
  createEffect(() => {
    if (!media.ready()) return;
    const paths = [...media.state.books, ...media.state.movies].map((e) => e.linkedNotePath).filter(Boolean) as string[];
    const now = new Map<string, string>();
    for (const p of paths) {
      const text = contents[p];
      if (text === undefined) continue;
      now.set(p, text);
      const prev = lastText.get(p);
      if (prev !== undefined && prev !== text && !pendingWrites.has(p)) {
        clearTimeout(pullTimers.get(p));
        pullTimers.set(p, setTimeout(() => { pullTimers.delete(p); pullFromNote(p); }, 600));
      }
    }
    lastText = now;
  });
});

// A book or film note went to the trash: offer to take it off the shelf too.
onTrashed(async (gone) => {
  if (!media.ready()) return;
  const hit = [...media.state.books, ...media.state.movies].filter((e) => e.linkedNotePath && gone(e.linkedNotePath));
  if (!hit.length) return;
  const names = hit.map((e) => e.title).join("، ");
  const yes = await askConfirm(t("media-delete-also-title"), t("media-delete-also-body", { name: names }), t("action-delete"));
  const ids = new Set(hit.map((e) => e.id));
  media.update((m) => {
    if (yes) { m.books = m.books.filter((e) => !ids.has(e.id)); m.movies = m.movies.filter((e) => !ids.has(e.id)); return; }
    for (const e of [...m.books, ...m.movies]) if (ids.has(e.id)) e.linkedNotePath = undefined;
  });
});

export const __test = { parseQuotes, readSection, writeSection, quotesText };
