// Formatting toolbar above the editor. Buttons act on the focused editor.
import { For } from "solid-js";
import { Paperclip, Bold, Code, Heading1, Heading2, Heading3, Highlighter, Italic, Link, List, ListChecks, ListOrdered, Minus, MessageSquareQuote, Quote, Sigma, SquareCode, Strikethrough, Table, Brackets } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { applyCallout, applyFormat, insertBlockAtCursor, type FormatKind } from "./Editor";
import { CALLOUTS } from "../lib/markdown";
import { attachFromComputer } from "../state/dropFiles";
import { openMenu } from "./ContextMenu";

/** Callout types offered in the picker, with the color each one shows in. */
const CALLOUT_PICK = ["note", "info", "tip", "important", "success", "question", "warning", "danger", "bug", "example", "quote", "abstract", "todo", "failure"] as const satisfies readonly (typeof CALLOUTS)[number][];

function calloutMenu(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  openMenu({ clientX: r.left, clientY: r.bottom + 4 }, CALLOUT_PICK.map((type) => ({
    label: t(`callout-${type}`),
    icon: <span class={`callout-dot callout-${type}`} aria-hidden="true" />,
    run: () => applyCallout(type),
  })));
}

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
          <button class="icon-btn sm" tabIndex={i() === 0 ? 0 : -1} title={t(`fmt-${kind}`)} aria-label={t(`fmt-${kind}`)} onMouseDown={(e) => e.preventDefault()} onClick={(e) => (kind === "callout" ? calloutMenu(e) : applyFormat(kind))} aria-haspopup={kind === "callout" ? "menu" : undefined}>
            <Icon />
          </button>
        )}
      </For>
      <button class="icon-btn sm" tabIndex={-1} title={t("fmt-attach")} aria-label={t("fmt-attach")} onMouseDown={(e) => e.preventDefault()} onClick={async () => insertBlockAtCursor(await attachFromComputer())}>
        <Paperclip />
      </button>
    </div>
  );
}
