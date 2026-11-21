// A small YAML front matter reader/writer for the Properties panel and for
// features that store fields on notes (project tasks, flashcard decks).
// Supports `key: value`, `key: [a, b]` and block lists; anything else is kept
// verbatim as a string so nothing is lost on save.
import { splitFrontMatter } from "./markdown";

export type PropValue = string | string[];
export interface Prop { key: string; value: PropValue }

const unquote = (s: string) => {
  const t = s.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
};
const needsQuote = (s: string) => s === "" || /^[\s\-?:,[\]{}#&*!|>'"%@`]|: |\s#|\s$/.test(s);
const quote = (s: string) => (needsQuote(s) ? JSON.stringify(s) : s);

export function parseProps(src: string): Prop[] {
  const [fm] = splitFrontMatter(src);
  if (!fm) return [];
  const out: Prop[] = [];
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^\s:#][^:]*):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1].trim();
    const rest = m[2].trim();
    if (rest.startsWith("[") && rest.endsWith("]")) {
      out.push({ key, value: rest.slice(1, -1).split(",").map(unquote).filter(Boolean) });
    } else if (rest === "") {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s*/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s+-\s*/, "")));
      out.push({ key, value: items.length ? items : "" });
    } else out.push({ key, value: unquote(rest) });
  }
  return out;
}

export function serializeProps(props: Prop[]): string {
  return props
    .filter((p) => p.key.trim())
    .map((p) => (Array.isArray(p.value) ? `${p.key}: [${p.value.map(quote).join(", ")}]` : `${p.key}: ${quote(p.value)}`))
    .join("\n");
}

/** Replace the front matter of `src` with `props` (removing it when empty). */
export function withProps(src: string, props: Prop[]): string {
  const [, body] = splitFrontMatter(src);
  const fm = serializeProps(props);
  return fm ? `---\n${fm}\n---\n${body}` : body;
}

export function getProp(src: string, key: string): PropValue | undefined {
  return parseProps(src).find((p) => p.key === key)?.value;
}

export function setProp(src: string, key: string, value: PropValue | undefined): string {
  const props = parseProps(src);
  const i = props.findIndex((p) => p.key === key);
  if (value === undefined || (Array.isArray(value) ? !value.length : value === "")) {
    if (i >= 0) props.splice(i, 1);
  } else if (i >= 0) props[i] = { key, value };
  else props.push({ key, value });
  return withProps(src, props);
}
