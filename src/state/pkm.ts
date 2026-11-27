// Helpers for two note-taking methods:
// - PARA: four top folders (Projects, Areas, Resources, Archive) and moving
//   notes between them;
// - Zettelkasten: one idea per note, named by a time-based id, linked to
//   other notes; plus finding notes that are not linked to anything yet.
import { backend } from "../backend";
import { wikilinks } from "../lib/markdown";
import { pref } from "./prefs";
import { contents, createNote, markdownPaths, moveEntry, refresh, tree } from "./vault";

export const PARA = ["1 Projects", "2 Areas", "3 Resources", "4 Archive"] as const;
export type ParaFolder = (typeof PARA)[number];

/** The PARA folder a path lives in, if any. */
export const paraOf = (path: string): ParaFolder | null => PARA.find((f) => path.toLowerCase().startsWith(`${f.toLowerCase()}/`)) ?? null;

export const paraReady = () => PARA.every((f) => tree.folders.includes(f));

/** Create the four PARA folders that are missing. */
export async function setupPara(): Promise<void> {
  for (const f of PARA) if (!tree.folders.includes(f)) await backend.createFolder(f).catch(() => undefined);
  await refresh();
}

export const notesIn = (folder: string) => markdownPaths().filter((p) => p.toLowerCase().startsWith(`${folder.toLowerCase()}/`));

export async function moveToPara(path: string, folder: ParaFolder): Promise<void> {
  if (!tree.folders.includes(folder)) await backend.createFolder(folder).catch(() => undefined);
  await moveEntry(path, folder);
}

export const zettelFolder = () => pref("zettelFolder").trim().replace(/^\/+|\/+$/g, "") || "Zettelkasten";

/** Time-based id like 202611271430. */
export function zettelId(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Create a new Zettelkasten note; links back to `from` when given. */
export async function newZettel(title: string, from?: string, open = true): Promise<string | null> {
  const id = zettelId();
  const clean = title.trim().replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  const name = clean ? `${id} ${clean}` : id;
  const back = from ? `\n\n## Links\n\n- [[${from.replace(/\.md$/i, "")}]]\n` : "\n\n## Links\n\n";
  const body = `---\nid: "${id}"\ntype: zettel\ntags: [zettel]\n---\n\n# ${clean || id}\n\n${back}`;
  return createNote(name, zettelFolder(), body, open);
}

/** Notes in the Zettelkasten folder with no links in or out. */
export function orphanZettels(): string[] {
  const zs = notesIn(zettelFolder());
  const linked = new Set<string>();
  const names = (p: string) => [p.replace(/\.md$/i, "").toLowerCase(), p.split("/").pop()!.replace(/\.md$/i, "").toLowerCase()];
  for (const p of markdownPaths()) {
    const links = wikilinks(contents[p] ?? "").map((x) => x.toLowerCase());
    if (links.length && zs.includes(p)) linked.add(p);
    for (const z of zs) if (z !== p && names(z).some((n) => links.includes(n))) linked.add(z);
  }
  return zs.filter((z) => !linked.has(z));
}
