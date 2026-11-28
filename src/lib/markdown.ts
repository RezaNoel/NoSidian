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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// KaTeX and highlight.js are loaded once and used synchronously by the renderer.
import katex from "katex";
import hljs from "highlight.js/lib/common";

function mathHtml(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

/** Known callout types and the icon class used for each. */
export const CALLOUTS = ["note", "abstract", "info", "todo", "tip", "important", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"] as const;
const CALLOUT_ALIAS: Record<string, string> = {
  summary: "abstract", tldr: "abstract", hint: "tip", check: "success", done: "success",
  help: "question", faq: "question", caution: "warning", attention: "warning", fail: "failure", missing: "failure",
  error: "danger", cite: "quote",
};

let taskCounter = 0;

/** Display name for a link target: last path part, no .md, "Note > Heading" for fragments. */
export function linkName(target: string): string {
  const [name, frag] = target.trim().split("#");
  const base = name.split("/").pop()!.replace(/\.md$/i, "") || name;
  return frag ? `${base} › ${frag.replace(/^\^/, "")}` : base;
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start: (src: string) => src.match(/^\$\$/m)?.index,
      tokenizer(src: string) {
        const m = /^\$\$([\s\S]+?)\$\$[^\n]*(?:\n|$)/.exec(src);
        if (m) return { type: "blockMath", raw: m[0], text: m[1].trim() };
        return undefined;
      },
      renderer(tok: unknown) {
        return `<div class="math-block" dir="ltr">${mathHtml((tok as unknown as { text: string }).text, true)}</div>\n`;
      },
    },
    {
      name: "inlineMath",
      level: "inline",
      start: (src: string) => src.indexOf("$"),
      tokenizer(src: string) {
        const m = /^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
        return undefined;
      },
      renderer(tok: unknown) {
        return `<span class="math-inline" dir="ltr">${mathHtml((tok as unknown as { text: string }).text, false)}</span>`;
      },
    },
    {
      name: "embed",
      level: "inline",
      start: (src: string) => src.indexOf("![["),
      tokenizer(src: string) {
        const m = /^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
        if (m) return { type: "embed", raw: m[0], target: m[1].trim(), size: (m[2] ?? "").trim() };
        return undefined;
      },
      renderer(tok: unknown) {
        const t = tok as unknown as { target: string; size: string };
        return `<span class="embed" data-embed="${escapeHtml(t.target)}" data-size="${escapeHtml(t.size)}"></span>`;
      },
    },
    {
      name: "wikilink",
      level: "inline",
      start: (src: string) => src.indexOf("[["),
      tokenizer(src: string) {
        const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(src);
        // Without an alias, show the note's name, not its folder path: [[Books/Dune]] reads "Dune".
        if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), label: (m[2] ?? linkName(m[1])).trim() };
        return undefined;
      },
      renderer(tok: unknown) {
        const t = tok as unknown as { target: string; label: string };
        return `<a class="wikilink" href="#" data-target="${escapeHtml(t.target)}">${escapeHtml(t.label)}</a>`;
      },
    },
    {
      name: "mark",
      level: "inline",
      start: (src: string) => src.indexOf("=="),
      tokenizer(this: { lexer: { inlineTokens(s: string): unknown[] } }, src: string) {
        const m = /^==(?!\s)([^=\n]+?)==/.exec(src);
        if (m) return { type: "mark", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
        return undefined;
      },
      renderer(this: { parser: { parseInline(t: unknown[]): string } }, tok: unknown) {
        return `<mark>${this.parser.parseInline((tok as unknown as { tokens: unknown[] }).tokens)}</mark>`;
      },
    },
    {
      name: "underline",
      level: "inline",
      start: (src: string) => src.indexOf("++"),
      tokenizer(this: { lexer: { inlineTokens(s: string): unknown[] } }, src: string) {
        const m = /^\+\+(?!\s)([^+\n]+?)\+\+/.exec(src);
        if (m) return { type: "underline", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
        return undefined;
      },
      renderer(this: { parser: { parseInline(t: unknown[]): string } }, tok: unknown) {
        return `<u>${this.parser.parseInline((tok as unknown as { tokens: unknown[] }).tokens)}</u>`;
      },
    },
    {
      name: "hashtag",
      level: "inline",
      start: (src: string) => { const m = /(^|\s)#[\p{L}\p{N}_]/u.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src: string) {
        const m = /^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/u.exec(src);
        if (m && !/^\d+$/.test(m[1])) return { type: "hashtag", raw: m[0], tag: m[1] };
        return undefined;
      },
      renderer(tok: unknown) {
        const tag = (tok as unknown as { tag: string }).tag;
        return `<a class="tag" href="#" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</a>`;
      },
    },
  ] as never,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, "");
      return `<h${depth} id="h-${slugify(plain)}" dir="auto">${text}</h${depth}>\n`;
    },
    paragraph({ tokens }) {
      return `<p dir="auto">${this.parser.parseInline(tokens)}</p>\n`;
    },
    code({ text, lang }) {
      const language = (lang ?? "").trim().split(/\s+/)[0].toLowerCase();
      if (language === "mermaid") return `<div class="mermaid-block" data-mermaid="${encodeURIComponent(text)}"></div>\n`;
      let body: string;
      try {
        body = language && hljs.getLanguage(language) ? hljs.highlight(text, { language, ignoreIllegals: true }).value : escapeHtml(text);
      } catch {
        body = escapeHtml(text);
      }
      return `<div class="code-block" dir="ltr"><div class="code-head"><span class="code-lang">${escapeHtml(language)}</span><button type="button" class="code-copy" data-copy></button></div><pre><code class="hljs">${body}</code></pre></div>\n`;
    },
    checkbox({ checked }) {
      return `<input type="checkbox" class="task-box" data-task="${taskCounter++}"${checked ? " checked" : ""}> `;
    },
    image({ href, title, text }) {
      const local = !/^(https?:|data:|blob:)/i.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      return local
        ? `<span class="embed" data-embed="${escapeHtml(decodeURI(href))}" data-alt="${escapeHtml(text)}"></span>`
        : `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t} loading="lazy">`;
    },
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      const m = /^<p dir="auto">\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*)(?:<br>\n?|\n|(?=<\/p>))/.exec(inner);
      if (!m) return `<blockquote dir="auto">${inner}</blockquote>\n`;
      const raw = m[1].toLowerCase();
      const type = (CALLOUTS as readonly string[]).includes(raw) ? raw : CALLOUT_ALIAS[raw] ?? "note";
      const title = m[3].trim() || raw.charAt(0).toUpperCase() + raw.slice(1);
      let rest = inner.slice(m[0].length);
      rest = rest.startsWith("</p>") ? rest.slice(4) : `<p dir="auto">${rest}`;
      const body = rest.trim() ? `<div class="callout-body">${rest}</div>` : "";
      if (m[2]) {
        return `<details class="callout callout-${type}" data-callout="${type}"${m[2] === "+" ? " open" : ""}><summary class="callout-title" dir="auto">${title}</summary>${body}</details>\n`;
      }
      return `<div class="callout callout-${type}" data-callout="${type}"><div class="callout-title" dir="auto">${title}</div>${body}</div>\n`;
    },
  },
});

/** Render Markdown to sanitized HTML (math, callouts, code, tasks, embeds). */
export function renderMarkdown(src: string, opts: { breaks?: boolean } = {}): string {
  const [, body] = splitFrontMatter(src);
  taskCounter = 0;
  const html = marked.parse(body, { async: false, breaks: opts.breaks ?? false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-target", "dir", "target"], ADD_TAGS: ["details", "summary"] });
}

/** Line numbers (0-based) of task list items, in document order. */
export function taskLines(src: string): number[] {
  const out: number[] = [];
  const lines = src.split("\n");
  const [, , start] = splitFrontMatter(src);
  let fence = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^(?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(lines[i])) out.push(i);
  }
  return out;
}

/** Toggle the n-th task checkbox in the source. */
export function toggleTask(src: string, n: number, checked: boolean): string {
  const line = taskLines(src)[n];
  if (line === undefined) return src;
  const lines = src.split("\n");
  lines[line] = lines[line].replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
  return lines.join("\n");
}

/** Split a note into slides on lines containing only `---` (outside code and front matter). */
export function splitSlides(src: string): string[] {
  const [, body] = splitFrontMatter(src);
  const slides: string[] = [];
  let cur: string[] = [];
  let fence = false;
  for (const l of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^\s*---\s*$/.test(l)) {
      slides.push(cur.join("\n"));
      cur = [];
    } else cur.push(l);
  }
  slides.push(cur.join("\n"));
  return slides.filter((s) => s.trim());
}
