// CodeMirror 6 Markdown editor. One instance per open note; mixed RTL/LTR
// lines get their own direction, and the theme follows the app tokens.
import { createEffect, onCleanup, onMount } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags as tg } from "@lezer/highlight";
import { t } from "../i18n";
import { noteTitle } from "../lib/markdown";
import { contents, setContent } from "../state/vault";

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
  ".cm-scroller": { fontFamily: "var(--font-ui)", lineHeight: "var(--editor-line-height)", overflow: "auto" },
  ".cm-content": { maxWidth: "var(--editor-max-width)", margin: "0 auto", padding: "28px 28px 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderInlineStartColor: "var(--accent)", borderInlineStartWidth: "2px" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-searchMatch": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent-border)" },
  ".cm-panels": { backgroundColor: "var(--bg-modal)", color: "var(--text-primary)", borderColor: "var(--border)" },
  ".cm-placeholder": { color: "var(--text-muted)" },
});

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

export function Editor(props: { path: string }) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;

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
          EditorView.contentAttributes.of({ "aria-label": `${t("editor-label")}: ${noteTitle(props.path)}`, "aria-multiline": "true", dir: "auto" }),
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setContent(props.path, u.state.doc.toString());
            if (u.focusChanged && u.view.hasFocus) activeView = u.view;
          }),
        ],
      }),
    });
    activeView = view;
  });

  // Content changed outside the editor (e.g. file reloaded): sync it in.
  createEffect(() => {
    const text = contents[props.path] ?? "";
    if (view && text !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  });

  onCleanup(() => {
    if (activeView === view) activeView = null;
    view?.destroy();
  });

  return <div ref={host} class="editor-host" />;
}
