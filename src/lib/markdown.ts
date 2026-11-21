// Markdown helpers shared by the editor, reader, outline and links panels.
import { Marked } from "marked";
import DOMPurify from "dompurify";

export interface Heading { level: number; text: string; line: number; slug: string }

/** Strip YAML front matter, returning [frontMatter, body, bodyStartLine]. */
export function splitFrontMatter(src: string): [string, string, number] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return ["", src, 0];
  return [m[1], src.slice(m[0].length), m[0].split("\n").length - 1];
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
}

/** ATX headings outside fenced code blocks, with 0-based source line numbers. */
export function headings(src: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  const lines = src.split("\n");
  const [, , start] = splitFrontMatter(src);
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) out.push({ level: m[1].length, text: m[2], line: i, slug: slugify(m[2]) });
  }
  return out;
}

/** Blank out fenced code blocks and inline code (keeping line positions). */
export function stripCode(src: string): string {
  return src
    .replace(/^(\s*)(```|~~~)[\s\S]*?^\s*\2.*$/gm, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

/** `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]` targets. */
export function wikilinks(src: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(src).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.add(m[1].trim());
  return [...out];
}

export function noteTitle(path: string): string {
  return path.split("/").pop()!.replace(/\.(md|markdown)$/i, "");
}

/** Resolve a wikilink target to a vault path (exact path, then by title). */
export function resolveLink(target: string, paths: string[]): string | null {
  const t = target.replace(/\.md$/i, "").toLowerCase();
  return (
    paths.find((p) => p.replace(/\.md$/i, "").toLowerCase() === t) ??
    paths.find((p) => noteTitle(p).toLowerCase() === t.split("/").pop()) ??
    null
  );
}

export interface Stats { words: number; chars: number; minutes: number }
export function stats(src: string): Stats {
  const [, body] = splitFrontMatter(src);
  const words = (body.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  return { words, chars: body.length, minutes: Math.max(1, Math.round(words / 220)) };
}

export function tagsOf(src: string): string[] {
  const out = new Set<string>();
  const [fm, body] = splitFrontMatter(src);
  const inline = /tags:\s*\[([^\]]*)\]/.exec(fm);
  if (inline) inline[1].split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean).forEach((s) => out.add(s));
  for (const m of stripCode(body).matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) out.add(m[2]);
  return [...out];
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start: (src: string) => src.indexOf("[["),
      tokenizer(src: string) {
        const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
        if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() };
        return undefined;
      },
      renderer(tok) {
        const t = tok as unknown as { target: string; label: string };
        const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
        return `<a class="wikilink" href="#" data-target="${esc(t.target)}">${esc(t.label)}</a>`;
      },
    },
  ],
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, "");
      return `<h${depth} id="h-${slugify(plain)}" dir="auto">${text}</h${depth}>\n`;
    },
    paragraph({ tokens }) {
      return `<p dir="auto">${this.parser.parseInline(tokens)}</p>\n`;
    },
  },
});

/** Render Markdown to sanitized HTML. Rich blocks (math, Mermaid, callouts) arrive in Phase 3. */
export function renderMarkdown(src: string, opts: { breaks?: boolean } = {}): string {
  const [, body] = splitFrontMatter(src);
  const withMarks = body.replace(/==([^=\n]+)==/g, "<mark>$1</mark>").replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");
  const html = marked.parse(withMarks, { async: false, breaks: opts.breaks ?? false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-target", "dir"] });
}
