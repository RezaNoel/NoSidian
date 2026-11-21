// Link analysis for the context panel: backlinks, outgoing links, unlinked mentions.
import { noteTitle, resolveLink, splitFrontMatter, stripCode, wikilinks } from "./markdown";

export interface Mention { path: string; snippet: string }
export interface Outgoing { target: string; path: string | null }

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end < 0 ? undefined : end).trim().slice(0, 160);
}

export function backlinks(path: string, contents: Record<string, string>, paths: string[]): Mention[] {
  const out: Mention[] = [];
  for (const p of paths) {
    if (p === path) continue;
    const src = contents[p] ?? "";
    for (const m of stripCode(src).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      if (resolveLink(m[1].trim(), paths) === path) {
        out.push({ path: p, snippet: lineAround(src, m.index ?? 0) });
        break;
      }
    }
  }
  return out;
}

export function outgoing(path: string, contents: Record<string, string>, paths: string[]): Outgoing[] {
  return wikilinks(contents[path] ?? "").map((target) => ({ target, path: resolveLink(target, paths) }));
}

/** Notes that mention this note's title as plain text without linking to it. */
export function unlinkedMentions(path: string, contents: Record<string, string>, paths: string[]): Mention[] {
  const title = noteTitle(path);
  if (title.length < 3) return [];
  const linked = new Set(backlinks(path, contents, paths).map((m) => m.path));
  const needle = title.toLocaleLowerCase();
  const out: Mention[] = [];
  for (const p of paths) {
    if (p === path || linked.has(p)) continue;
    const [, body] = splitFrontMatter(contents[p] ?? "");
    const plain = stripCode(body).replace(/\[\[[^\]]*\]\]/g, " ");
    const at = plain.toLocaleLowerCase().indexOf(needle);
    if (at >= 0) out.push({ path: p, snippet: lineAround(plain, at) });
  }
  return out;
}

/** Turn the first plain mention of `title` on `line` of `path` into a wikilink. */
export function linkMention(src: string, line: number, title: string): string | null {
  const lines = src.split("\n");
  const text = lines[line];
  if (text === undefined) return null;
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Skip text already inside [[...]] or `code`.
  const re = new RegExp(`\\[\\[[^\\]]*\\]\\]|\`[^\`]*\`|(?<![\\p{L}\\p{N}])(${esc})(?![\\p{L}\\p{N}])`, "giu");
  let done = false;
  const next = text.replace(re, (whole, hit: string | undefined) => {
    if (done || hit === undefined) return whole;
    done = true;
    return hit === title ? `[[${title}]]` : `[[${title}|${hit}]]`;
  });
  if (!done) return null;
  lines[line] = next;
  return lines.join("\n");
}
