// JavaScript version of the Rust vault index, used only by the browser
// memory backend (dev server, tests, screenshots). Same query language:
// `#tag`, `tag:`, `title:`, `path:`, "quoted phrases" and `-exclusions`.
import { headings, noteTitle, splitFrontMatter, stats, tagsOf } from "../lib/markdown";
import { backlinks, outgoing, unlinkedMentions } from "../lib/links";
import type { NoteLinks, NoteSummary, SearchHit, SearchSort, TagCount } from "../state/types";

export interface Doc { content: string; modified: number }

interface Query { terms: string[]; excluded: string[]; tags: string[]; title: string[]; path: string[] }

export function parseQuery(q: string): Query {
  const out: Query = { terms: [], excluded: [], tags: [], title: [], path: [] };
  for (const m of q.toLowerCase().matchAll(/(\S*?)"([^"]*)"|(\S+)/g)) {
    const tok = m[3] ?? (m[1] ?? "") + (m[2] ?? "");
    if (!tok) continue;
    if (tok.startsWith("tag:") || tok.startsWith("#")) { const t = tok.replace(/^tag:/, "").replace(/^#/, ""); if (t) out.tags.push(t); }
    else if (tok.startsWith("title:")) { if (tok.length > 6) out.title.push(tok.slice(6)); }
    else if (tok.startsWith("path:")) { if (tok.length > 5) out.path.push(tok.slice(5)); }
    else if (tok.startsWith("-")) { if (tok.length > 1) out.excluded.push(tok.slice(1)); }
    else out.terms.push(tok);
  }
  return out;
}

export function memorySearch(docs: Record<string, Doc>, query: string, sort: SearchSort = "relevance", limit = 100): SearchHit[] {
  const q = parseQuery(query);
  if (!q.terms.length && !q.tags.length && !q.title.length && !q.path.length && !q.excluded.length) return [];
  const hits: (SearchHit & { modified: number })[] = [];
  for (const [path, doc] of Object.entries(docs)) {
    if (!path.endsWith(".md")) continue;
    const title = noteTitle(path);
    const tl = title.toLowerCase();
    const [, body, start] = splitFrontMatter(doc.content);
    const bl = body.toLowerCase();
    const tags = tagsOf(doc.content).map((t) => t.toLowerCase());
    if (!q.tags.every((t) => tags.some((x) => x === t || x.startsWith(t + "/")))) continue;
    if (!q.title.every((t) => tl.includes(t)) || !q.path.every((t) => path.toLowerCase().includes(t))) continue;
    if (q.excluded.some((t) => tl.includes(t) || bl.includes(t))) continue;
    let score = 1;
    let ok = true;
    for (const term of q.terms) {
      const inTitle = tl.includes(term);
      const count = bl.split(term).length - 1;
      if (!inTitle && !count) { ok = false; break; }
      if (inTitle) score += 20 + (tl === term ? 30 : 0);
      score += Math.min(10, count);
    }
    if (!ok) continue;
    const matches = q.terms.length
      ? body.split("\n").map((text, i) => ({ line: i + start, text: text.trim().slice(0, 160) }))
          .filter((l) => q.terms.some((t) => l.text.toLowerCase().includes(t))).slice(0, 3)
      : [];
    hits.push({ path, title, score, matches, modified: doc.modified });
  }
  if (sort === "title") hits.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "modified") hits.sort((a, b) => b.modified - a.modified);
  else hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit).map(({ modified: _m, ...h }) => h);
}

export function memoryTags(docs: Record<string, Doc>): TagCount[] {
  const m = new Map<string, string[]>();
  for (const [p, d] of Object.entries(docs)) if (p.endsWith(".md")) for (const t of tagsOf(d.content)) m.set(t, [...(m.get(t) ?? []), p]);
  return [...m.entries()].map(([tag, paths]) => ({ tag, count: paths.length, paths })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const texts = (docs: Record<string, Doc>) => Object.fromEntries(Object.entries(docs).map(([p, d]) => [p, d.content]));
const mdPaths = (docs: Record<string, Doc>) => Object.keys(docs).filter((p) => p.endsWith(".md"));

export function memoryLinks(docs: Record<string, Doc>, path: string): NoteLinks {
  const c = texts(docs), paths = mdPaths(docs);
  const line = (p: string, snippet: string) => (c[p] ?? "").split("\n").findIndex((l) => l.includes(snippet.slice(0, 40)));
  return {
    backlinks: backlinks(path, c, paths).map((m) => ({ ...m, line: Math.max(0, line(m.path, m.snippet)) })),
    outgoing: outgoing(path, c, paths),
    unlinked: unlinkedMentions(path, c, paths).map((m) => ({ ...m, line: Math.max(0, line(m.path, m.snippet)) })),
  };
}

export function memorySummaries(docs: Record<string, Doc>): NoteSummary[] {
  const c = texts(docs), paths = mdPaths(docs);
  return paths.map((p) => ({
    path: p,
    words: stats(c[p]).words,
    backlinks: backlinks(p, c, paths).length,
    tags: tagsOf(c[p]),
    headings: headings(c[p]).map((h) => ({ level: h.level, text: h.text, line: h.line })),
  }));
}
