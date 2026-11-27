// Keeps the media shelf and the notes in the book and film folders in step:
// - every note in those folders (and their subfolders) shows on the shelf,
//   read from its frontmatter, as soon as the vault opens;
// - every change on the shelf is written back to the entry's note frontmatter.
import { createEffect, createRoot, on } from "solid-js";
import { buildFrontmatter, parseFrontmatter } from "../core/markdown";
import type { BookEntry, BookReadStatus, CinemaEntry, CinemaWatchStatus } from "../core/types";
import { backend } from "../backend";
import { media } from "./media";
import { pref } from "./prefs";
import { contents, ensureLoaded, markdownPaths, setContent, tree, vault } from "./vault";

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
    highlights: [], notes: "", linkedNotePath: path, createdAt: now, updatedAt: now,
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
    favoriteQuotes: [], notes: "", linkedNotePath: path, createdAt: now, updatedAt: now,
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
    const out = buildFrontmatter(next, body.startsWith("\n") ? body : `\n${body}`);
    if (out !== text) setContent(path, out);
  }, 500));
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
      const sig = JSON.stringify(fieldsOf(kind, e));
      next.set(key, sig);
      if (prevJson && seen.has(key) && seen.get(key) !== sig) syncEntryToNote(kind, e);
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
});
