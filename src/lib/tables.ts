// GFM tables in note text: find them, read their cells and write them back,
// so tables can be edited from the reading view.

export interface MdTable {
  /** First and last line (0-based, inclusive) of the table in the note. */
  start: number;
  end: number;
  header: string[];
  align: ("left" | "center" | "right" | "")[];
  rows: string[][];
}

/** Split `| a | b \| c |` into cells, keeping escaped pipes. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "`") code = !code;
    if (c === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; continue; }
    if (c === "|" && !code) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Every top-level table (outside code blocks, quotes and lists), in order. */
export function findTables(text: string): MdTable[] {
  const lines = text.split("\n");
  const out: MdTable[] = [];
  let fence: string | null = null;
  // Skip front matter.
  let i = 0;
  if (lines[0]?.trim() === "---") { i = 1; while (i < lines.length && lines[i].trim() !== "---") i++; i++; }
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = /^\s*(```|~~~)/.exec(l);
    if (f) { fence = fence === null ? f[1] : fence === f[1] ? null : fence; continue; }
    if (fence) continue;
    if (!l.includes("|") || /^\s*([>*+-]|\d+\.)\s/.test(l)) continue;
    const next = lines[i + 1];
    if (next === undefined || !SEP.test(next) || !next.includes("-")) continue;
    const header = splitRow(l);
    const align = splitRow(next).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "")) as MdTable["align"];
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") { rows.push(splitRow(lines[j])); j++; }
    out.push({ start: i, end: j - 1, header, align, rows });
    i = j - 1;
  }
  return out;
}

const cell = (s: string) => s.replace(/\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();

/** The table as Markdown lines, columns padded to the same count. */
export function tableToLines(t: MdTable): string[] {
  const n = Math.max(t.header.length, ...t.rows.map((r) => r.length), 1);
  const pad = (r: string[]) => Array.from({ length: n }, (_, k) => cell(r[k] ?? ""));
  const sep = Array.from({ length: n }, (_, k) => { const a = t.align[k] ?? ""; return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---"; });
  return [`| ${pad(t.header).join(" | ")} |`, `| ${sep.join(" | ")} |`, ...t.rows.map((r) => `| ${pad(r).join(" | ")} |`)];
}

/** Replace table number `index` in `text` with the result of `edit`. */
export function editTable(text: string, index: number, edit: (t: MdTable) => MdTable | null): string {
  const tables = findTables(text);
  const t = tables[index];
  if (!t) return text;
  const copy: MdTable = { ...t, header: [...t.header], align: [...t.align], rows: t.rows.map((r) => [...r]) };
  const next = edit(copy);
  const lines = text.split("\n");
  lines.splice(t.start, t.end - t.start + 1, ...(next ? tableToLines(next) : []));
  return lines.join("\n");
}
