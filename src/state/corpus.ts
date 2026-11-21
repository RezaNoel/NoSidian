// The whole vault as `Note[]` for vault-wide features (flashcards, graph,
// dashboard, projects, MCP). Loads every Markdown note into memory once.
import { createMemo, createRoot } from "solid-js";
import type { Note } from "../core/types";
import { contents, ensureLoaded, markdownPaths, tree } from "./vault";
import { profile } from "./workspace";

let loading: Promise<void> | null = null;
let loadedFor = "";

/** Make sure every Markdown note's text is in memory. */
export function loadAllNotes(): Promise<void> {
  const key = markdownPaths().join("\n");
  if (loading && key === loadedFor) return loading;
  loadedFor = key;
  loading = Promise.all(markdownPaths().map(ensureLoaded)).then(() => undefined);
  return loading;
}

const c = createRoot(() =>
  createMemo<Note[]>(() => {
    const starred = new Set(profile.starred);
    return tree.notes
      .filter((n) => n.kind === "markdown")
      .map((n) => ({ path: n.path, content: contents[n.path] ?? "", starred: starred.has(n.path), createdAt: n.created, updatedAt: n.modified, snapshots: [] }));
  }),
);

/** Reactive list of every Markdown note with its loaded text. */
export const corpus = c;
