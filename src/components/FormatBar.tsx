// Formatting toolbar above the editor. Buttons act on the focused editor.
import { For } from "solid-js";
import { Bold, Code, Heading1, Heading2, Heading3, Highlighter, Italic, Link, List, ListChecks, ListOrdered, Minus, MessageSquareQuote, Quote, Sigma, SquareCode, Strikethrough, Table, Brackets } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { applyFormat, type FormatKind } from "./Editor";

const ITEMS: [FormatKind, typeof Bold][] = [
  ["bold", Bold], ["italic", Italic], ["strike", Strikethrough], ["highlight", Highlighter], ["code", Code],
  ["h1", Heading1], ["h2", Heading2], ["h3", Heading3],
  ["list", List], ["numbered", ListOrdered], ["task", ListChecks], ["quote", Quote], ["callout", MessageSquareQuote],
  ["link", Link], ["wikilink", Brackets], ["codeblock", SquareCode], ["math", Sigma], ["table", Table], ["divider", Minus],
];

export function FormatBar() {
  return (
    <div class="format-bar" role="toolbar" aria-label={t("fmt-label")} onKeyDown={rovingKeydown("button", "horizontal")}>
      <For each={ITEMS}>
        {([kind, Icon], i) => (
          <button class="icon-btn sm" tabIndex={i() === 0 ? 0 : -1} title={t(`fmt-${kind}`)} aria-label={t(`fmt-${kind}`)} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat(kind)}>
            <Icon />
          </button>
        )}
      </For>
    </div>
  );
}
