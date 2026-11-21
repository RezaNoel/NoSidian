// Media shelf: movies, series and books with progress, ratings and quotes,
// stored per vault; each entry can open or create a linked note.
import { vaultDoc } from "./persist";
import { normalizeMediaLibrary, buildMediaNotePath, generateBookNoteMarkdown, generateMovieNoteMarkdown } from "../core/mediaLibrary";
import type { BookEntry, CinemaEntry, MediaLibraryState } from "../core/types";
import { createNote, markdownPaths, openNote } from "./vault";

export const media = vaultDoc<MediaLibraryState>("media", () => ({ movies: [], books: [] }));
export const normalizeMedia = (raw: Partial<MediaLibraryState> | null) => normalizeMediaLibrary(raw);

export async function openMediaNote(kind: "movie" | "book", entry: CinemaEntry | BookEntry): Promise<void> {
  const path = entry.linkedNotePath && markdownPaths().includes(entry.linkedNotePath) ? entry.linkedNotePath : buildMediaNotePath(kind, entry.title);
  if (!markdownPaths().includes(path)) {
    const body = kind === "movie" ? generateMovieNoteMarkdown(entry as CinemaEntry) : generateBookNoteMarkdown(entry as BookEntry);
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined;
    const created = await createNote(path.split("/").pop()!.replace(/\.md$/i, ""), folder, body);
    if (!created) return;
    media.update((m) => {
      const list = (kind === "movie" ? m.movies : m.books) as (CinemaEntry | BookEntry)[];
      const e = list.find((x) => x.id === entry.id);
      if (e) e.linkedNotePath = created;
    });
    openNote(created);
    return;
  }
  openNote(path);
}
