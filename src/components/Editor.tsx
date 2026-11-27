// CodeMirror 6 Markdown editor. One instance per open note; mixed RTL/LTR
// lines get their own direction, and the theme follows the app tokens.
import { createEffect, createRoot, onCleanup, onMount } from "solid-js";
import { peoplePaths } from "../state/people";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { autocompletion, closeBrackets, closeBracketsKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags as tg } from "@lezer/highlight";
import { t } from "../i18n";
import { noteTitle } from "../lib/markdown";
import { contents, markdownPaths, setContent, indexRev } from "../state/vault";
import { backend } from "../backend";
import { formatDailyName } from "../lib/dates";
import { createResource } from "solid-js";
import { pref } from "../state/prefs";
import { embedDroppedFiles, hasOsFiles } from "../state/dropFiles";

const highlight = HighlightStyle.define([
  { tag: tg.heading1, fontSize: "1.4em", fontWeight: "700", color: "var(--text-primary)" },
  { tag: tg.heading2, fontSize: "1.22em", fontWeight: "700", color: "var(--text-primary)" },
  { tag: tg.heading3, fontSize: "1.08em", fontWeight: "650", color: "var(--text-primary)" },
  { tag: [tg.heading4, tg.heading5, tg.heading6], fontWeight: "650" },
  { tag: tg.strong, fontWeight: "700" },
  { tag: tg.emphasis, fontStyle: "italic" },
  { tag: tg.strikethrough, textDecoration: "line-through" },
  { tag: [tg.link, tg.url], color: "var(--accent)" },
  { tag: tg.monospace, fontFamily: "var(--font-mono)", color: "var(--code-fg)" },
  { tag: [tg.processingInstruction, tg.meta, tg.punctuation, tg.contentSeparator], color: "var(--text-muted)" },
  { tag: tg.quote, color: "var(--text-secondary)", fontStyle: "italic" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--text-primary)", fontSize: "var(--editor-font-size)" },
  ".cm-scroller": { fontFamily: "var(--font-editor)", lineHeight: "var(--editor-line-height)", overflow: "auto" },
  ".cm-content": { maxWidth: "var(--editor-max-width)", margin: "0 auto", padding: "28px 28px 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderInlineStartColor: "var(--accent)", borderInlineStartWidth: "2px" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-searchMatch": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent-border)" },
  ".cm-panels": { backgroundColor: "var(--bg-modal)", color: "var(--text-primary)", borderColor: "var(--border)" },
  ".cm-placeholder": { color: "var(--text-muted)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--text-muted)", paddingBlockStart: "28px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-secondary)" },
});

/** Extensions driven by the editor preferences; reconfigured live. */
function prefExtensions(): Extension[] {
  const size = pref("tabSize");
  return [
    pref("lineNumbers") ? [lineNumbers(), highlightActiveLineGutter()] : [],
    pref("autopair") ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
    EditorState.tabSize.of(size),
    indentUnit.of(" ".repeat(size)),
    EditorView.contentAttributes.of({ spellcheck: String(pref("spellcheck")) }),
    pref("foldHeadings") ? [foldGutter(), keymap.of(foldKeymap)] : [],
    pref("autopairMarkdown") ? markdownPairs : [],
  ];
}

/** Wrap `**`, `==`, `~~` and `` ` `` around the selection when typed with text selected. */
const markdownPairs = EditorView.inputHandler.of((view, from, to, text) => {
  if (from === to || !["*", "=", "~", "`", "_"].includes(text)) return false;
  const mark = text === "*" || text === "=" || text === "~" ? text.repeat(2) : text;
  view.dispatch(view.state.changeByRange((r) => ({
    changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }],
    range: { anchor: r.from + mark.length, head: r.to + mark.length } as never,
  })));
  return true;
});

// ---------- Autocomplete: [[links]], #tags and /commands ----------
const tagStore = createRoot(() => createResource(() => indexRev() + 1, () => backend.tags().catch(() => []), { initialValue: [] })[0]);

function linkSource(ctx: CompletionContext) {
  const m = ctx.matchBefore(/\[\[[^\]\n]*$/);
  if (!m) return null;
  const options: Completion[] = markdownPaths().map((p) => ({ label: noteTitle(p), detail: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : undefined, apply: `${noteTitle(p)}]]`, type: "text" }));
  return { from: m.from + 2, options, validFor: /^[^\]\n]*$/ };
}
/** "@Name" suggests people from the people network and inserts a link to their note. */
function peopleSource(ctx: CompletionContext) {
  const m = ctx.matchBefore(/(?:^|\s)@[\p{L}\p{N}_ .-]*$/u);
  if (!m) return null;
  const people = peoplePaths();
  if (!people.length) return null;
  const from = m.from + m.text.indexOf("@");
  return {
    from,
    options: people.map((p) => { const name = p.split("/").pop()!.replace(/\.md$/i, ""); return { label: `@${name}`, detail: t("view-people"), apply: `[[${p.replace(/\.md$/i, "")}|${name}]]`, type: "variable" }; }),
    validFor: /^@[\p{L}\p{N}_ .-]*$/u,
  };
}
function tagSource(ctx: CompletionContext) {
  const m = ctx.matchBefore(/(?:^|\s)#[\p{L}\p{N}_/-]*$/u);
  if (!m) return null;
  const from = m.from + m.text.indexOf("#") + 1;
  return { from, options: tagStore().map((x) => ({ label: x.tag, detail: String(x.count), type: "keyword" })), validFor: /^[\p{L}\p{N}_/-]*$/u };
}
const SLASH: [string, string][] = [
  ["h1", "# "], ["h2", "## "], ["h3", "### "], ["list", "- "], ["numbered", "1. "], ["task", "- [ ] "], ["quote", "> "],
  ["callout", "> [!note] "], ["code", "```\n\n```"], ["math", "$$\n\n$$"], ["mermaid", "```mermaid\ngraph TD\n  A --> B\n```"],
  ["table", "| A | B |\n| --- | --- |\n|  |  |"], ["divider", "---\n"], ["card", " :: "], ["cloze", "==text=="],
];
function slashSource(ctx: CompletionContext) {
  const m = ctx.matchBefore(/(?:^|\s)\/[\w-]*$/);
  if (!m) return null;
  const from = m.from + m.text.indexOf("/");
  const options: Completion[] = [
    ...SLASH.map(([id, text]) => ({ label: `/${id}`, detail: t(`slash-${id}` as "slash-h1"), apply: text, type: "function" })),
    { label: "/date", detail: t("slash-date"), apply: () => formatDailyName(new Date(), "YYYY-MM-DD"), type: "function" },
  ].map((o) => typeof o.apply === "function" ? { ...o, apply: (o.apply as () => string)() } : o);
  return { from, options, validFor: /^\/[\w-]*$/ };
}

// ---------- Formatting commands (toolbar, palette) ----------
export type FormatKind = "bold" | "italic" | "strike" | "highlight" | "code" | "link" | "wikilink" | "h1" | "h2" | "h3" | "list" | "numbered" | "task" | "quote" | "codeblock" | "math" | "table" | "callout" | "divider";
const WRAP: Partial<Record<FormatKind, [string, string]>> = {
  bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], highlight: ["==", "=="], code: ["`", "`"], link: ["[", "](url)"], wikilink: ["[[", "]]"],
};
const PREFIX: Partial<Record<FormatKind, string>> = { h1: "# ", h2: "## ", h3: "### ", list: "- ", numbered: "1. ", task: "- [ ] ", quote: "> ", callout: "> [!note] " };
const BLOCK: Partial<Record<FormatKind, string>> = { codeblock: "```\n$\n```", math: "$$\n$\n$$", table: "| A | B |\n| --- | --- |\n| $ |  |", divider: "\n---\n$" };

export function applyFormat(kind: FormatKind): boolean {
  const view = activeView;
  if (!view) return false;
  const wrap = WRAP[kind], prefix = PREFIX[kind], block = BLOCK[kind];
  if (wrap) {
    view.dispatch(view.state.changeByRange((r) => {
      const sel = view.state.sliceDoc(r.from, r.to);
      const on = sel.startsWith(wrap[0]) && sel.endsWith(wrap[1]) && sel.length >= wrap[0].length + wrap[1].length;
      const insert = on ? sel.slice(wrap[0].length, sel.length - wrap[1].length) : wrap[0] + sel + wrap[1];
      return { changes: { from: r.from, to: r.to, insert }, range: { anchor: on ? r.from : r.from + wrap[0].length, head: on ? r.from + insert.length : r.from + wrap[0].length + sel.length } as never };
    }));
  } else if (prefix) {
    const lines = new Set<number>();
    for (const r of view.state.selection.ranges) for (let l = view.state.doc.lineAt(r.from).number; l <= view.state.doc.lineAt(r.to).number; l++) lines.add(l);
    const changes = [...lines].map((n) => {
      const line = view.state.doc.line(n);
      const cur = /^(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+\. |> \[![\w-]+\] |> )/.exec(line.text)?.[0] ?? "";
      return { from: line.from, to: line.from + cur.length, insert: cur === prefix ? "" : prefix };
    });
    view.dispatch({ changes });
  } else if (block) {
    const r = view.state.selection.main;
    const sel = view.state.sliceDoc(r.from, r.to);
    const [a, b] = block.split("$");
    view.dispatch({ changes: { from: r.from, to: r.to, insert: a + sel + b }, selection: { anchor: r.from + a.length, head: r.from + a.length + sel.length } });
  }
  view.focus();
  return true;
}

/** Turn the selected lines into a callout of `type` (or change the type of the callout already there). */
export function applyCallout(type: string): boolean {
  const view = activeView;
  if (!view) return false;
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) for (let l = view.state.doc.lineAt(r.from).number; l <= view.state.doc.lineAt(r.to).number; l++) lines.add(l);
  const nums = [...lines].sort((a, b) => a - b);
  const first = view.state.doc.line(nums[0]);
  const head = /^> \[!([\w-]+)\][+-]?/.exec(first.text);
  if (head) {
    view.dispatch({ changes: { from: first.from + 4, to: first.from + 4 + head[1].length, insert: type } });
  } else {
    const changes = nums.map((n, i) => {
      const line = view.state.doc.line(n);
      const cur = /^> /.exec(line.text)?.[0] ?? "";
      return { from: line.from, to: line.from + cur.length, insert: i === 0 ? `> [!${type}] ` : "> " };
    });
    view.dispatch({ changes });
  }
  view.focus();
  return true;
}

/** Insert text at the cursor on its own line (attachments, embeds). */
export function insertBlockAtCursor(md: string): boolean {
  const view = activeView;
  if (!view || !md) return false;
  const at = view.state.selection.main.head;
  const line = view.state.doc.lineAt(at);
  const insert = `${at > line.from ? "\n" : ""}${md}${at < line.to ? "\n" : ""}`;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } });
  view.focus();
  return true;
}

/** Imperative handle used by the outline panel. */
let activeView: EditorView | null = null;
export function editorGotoLine(line: number): boolean {
  const view = activeView;
  if (!view) return false;
  const pos = view.state.doc.line(Math.min(view.state.doc.lines, line + 1)).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 24 }) });
  view.focus();
  return true;
}

/** Line to reveal once the editor for `path` has its text (search results). */
let pending: { path: string; line: number } | null = null;
export function revealLine(path: string, line: number): void {
  pending = { path, line };
  if (activeView && activeViewPath === path && activeView.state.doc.length > 0) {
    pending = null;
    editorGotoLine(line);
  }
}
let activeViewPath: string | null = null;

export function Editor(props: { path: string }) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;
  const prefsSlot = new Compartment();
  let syncing = false;

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: contents[props.path] ?? "",
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          EditorView.perLineTextDirection.of(true),
          // Setext headings off: YAML front matter's closing --- would turn the last key into a heading.
          markdown({ base: markdownLanguage, extensions: { remove: ["SetextHeading"] } }),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          placeholder(t("editor-label")),
          autocompletion({ override: [linkSource, peopleSource, tagSource, slashSource], icons: false }),
          EditorView.contentAttributes.of({ "aria-label": `${t("editor-label")}: ${noteTitle(props.path)}`, "aria-multiline": "true", dir: "auto" }),
          theme,
          prefsSlot.of(prefExtensions()),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !syncing) setContent(props.path, u.state.doc.toString());
            if (u.focusChanged && u.view.hasFocus) { activeView = u.view; activeViewPath = props.path; }
          }),
          EditorView.domEventHandlers({
            scroll: (_e, v) => { syncReaderScroll(v); },
            // Files from the system: save them under attachments/ and embed them where they land.
            dragover: (e) => {
              if (!hasOsFiles(e)) return false;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
              return true;
            },
            drop: (e, v) => {
              if (!e.dataTransfer?.files.length) return false;
              e.preventDefault();
              const at = v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.head;
              void insertFiles(v, e.dataTransfer.files, at);
              return true;
            },
            paste: (e, v) => {
              const files = e.clipboardData?.files;
              if (!files?.length) return false;
              e.preventDefault();
              void insertFiles(v, files, v.state.selection.main.head);
              return true;
            },
          }),
        ],
      }),
    });
    activeView = view;
    activeViewPath = props.path;
    takePending();
  });

  const takePending = () => {
    if (!view || !pending || pending.path !== props.path || view.state.doc.length === 0) return;
    const line = pending.line;
    pending = null;
    activeView = view;
    activeViewPath = props.path;
    requestAnimationFrame(() => editorGotoLine(line));
  };

  createEffect(() => {
    const ext = prefExtensions();
    view?.dispatch({ effects: prefsSlot.reconfigure(ext) });
  });

  // Content changed outside the editor (e.g. file reloaded): sync it in.
  createEffect(() => {
    const text = contents[props.path] ?? "";
    if (view && text !== view.state.doc.toString()) {
      // Text loaded or changed elsewhere: don't write it back to disk.
      syncing = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      syncing = false;
    }
    takePending();
  });

  onCleanup(() => {
    if (activeView === view) { activeView = null; activeViewPath = null; }
    view?.destroy();
  });

  return <div ref={host} class="editor-host" />;
}

async function insertFiles(v: EditorView, files: FileList, at: number) {
  const md = await embedDroppedFiles(Array.from(files));
  if (!md) return;
  const line = v.state.doc.lineAt(Math.min(at, v.state.doc.length));
  // Put embeds on their own line so they render as a block.
  const before = at > line.from ? "\n" : "";
  const after = at < line.to ? "\n" : "";
  const insert = `${before}${md}${after}`;
  v.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } });
  v.focus();
}

/** Split view: keep the reader roughly aligned with the editor's top line. */
function syncReaderScroll(view: EditorView) {
  if (!pref("scrollSync")) return;
  const reader = view.dom.closest(".panes")?.querySelector<HTMLElement>("[data-sync=reader]");
  if (!reader) return;
  const sc = view.scrollDOM;
  const max = sc.scrollHeight - sc.clientHeight;
  const frac = max > 0 ? sc.scrollTop / max : 0;
  reader.scrollTop = frac * (reader.scrollHeight - reader.clientHeight);
}
