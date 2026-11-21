// App context menu (right-click or long-press). Arrow keys move, Escape closes.
// The webview's own menu (reload, save as...) never shows: areas with their
// own menu open it, text fields get cut/copy/paste, everything else gets none.
import { For, Show, createRoot, createSignal, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Check, ClipboardPaste, Copy, Scissors, TextSelect } from "lucide-solid";
import { rovingKeydown } from "../a11y/roving";
import { t } from "../i18n";

export interface MenuItem {
  label: string;
  icon?: JSX.Element;
  danger?: boolean;
  /** Shows a check mark and makes the item a checkbox; the menu stays open after toggling. */
  checked?: boolean;
  /** Shows a check mark for the current choice of a group (radio); the menu closes on pick. */
  mark?: boolean;
  disabled?: boolean;
  /** Draw a divider above this item. */
  sep?: boolean;
  run: () => void;
}

const menu = createRoot(() => {
  const [state, setState] = createSignal<{ x: number; y: number; items: MenuItem[]; opener: HTMLElement | null } | null>(null);
  return { state, setState };
});

export function openMenu(e: MouseEvent | { clientX: number; clientY: number }, items: MenuItem[]): void {
  if ("preventDefault" in e) { e.preventDefault(); e.stopPropagation(); }
  if (!items.length) return;
  menu.setState({ x: e.clientX, y: e.clientY, items, opener: document.activeElement as HTMLElement | null });
}

/** Replace the open menu's items in place (used by checkbox items). */
function refresh(items: MenuItem[]) {
  const s = menu.state();
  if (s) menu.setState({ ...s, items });
}

function close(refocus = true) {
  const s = menu.state();
  menu.setState(null);
  if (refocus) s?.opener?.focus?.();
}

/** Menu for a text field or the note editor. */
function textMenu(target: HTMLElement): MenuItem[] {
  const sel = window.getSelection()?.toString() ?? "";
  const field = target.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const hasSel = field ? field.selectionStart !== field.selectionEnd : !!sel;
  const readonly = !!field?.readOnly || !!(target.closest("[contenteditable]") && !target.closest("[contenteditable='true'], .cm-content"));
  const focus = () => (field ?? target.closest<HTMLElement>(".cm-content, [contenteditable]"))?.focus();
  return [
    { label: t("menu-cut"), icon: <Scissors />, disabled: !hasSel || readonly, run: () => { focus(); document.execCommand("cut"); } },
    { label: t("menu-copy"), icon: <Copy />, disabled: !hasSel, run: () => { focus(); document.execCommand("copy"); } },
    { label: t("menu-paste"), icon: <ClipboardPaste />, disabled: readonly, run: () => {
      focus();
      void navigator.clipboard?.readText?.().then((txt) => document.execCommand("insertText", false, txt)).catch(() => document.execCommand("paste"));
    } },
    { label: t("menu-select-all"), icon: <TextSelect />, sep: true, run: () => { focus(); if (field) field.select(); else document.execCommand("selectAll"); } },
  ];
}

/** Call once at startup. Component menus call openMenu, which stops the event before it gets here. */
export function installContextMenuGuard(): void {
  window.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const el = e.target as HTMLElement | null;
    if (!el) return;
    if (el.closest("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, [contenteditable], .cm-editor")) {
      openMenu(e, textMenu(el));
    } else if (window.getSelection()?.toString()) {
      openMenu(e, [{ label: t("menu-copy"), icon: <Copy />, run: () => document.execCommand("copy") }]);
    }
  });
}

export function ContextMenu() {
  return (
    <Show when={menu.state()} keyed>
      {(s) => {
        let el!: HTMLDivElement;
        onMount(() => {
          // Keep the menu on screen.
          const r = el.getBoundingClientRect();
          el.style.left = `${Math.max(8, Math.min(s.x, window.innerWidth - r.width - 8))}px`;
          el.style.top = `${Math.max(8, Math.min(s.y, window.innerHeight - r.height - 8))}px`;
          el.querySelector<HTMLElement>("[role^=menuitem]:not(:disabled)")?.focus();
        });
        return (
          <Portal>
            <div class="menu-scrim" onClick={() => close()} onContextMenu={(e) => { e.preventDefault(); close(); }} />
            <div
              ref={el}
              class="glass-modal context-menu"
              role="menu"
              style={{ left: `${s.x}px`, top: `${s.y}px` }}
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); return; }
                rovingKeydown("[role^=menuitem]:not(:disabled)", "vertical")(e);
              }}
            >
              <For each={s.items}>
                {(item, i) => (
                  <>
                    <Show when={item.sep && i() > 0}><div class="menu-sep" role="separator" /></Show>
                    <button
                      role={item.checked !== undefined ? "menuitemcheckbox" : item.mark !== undefined ? "menuitemradio" : "menuitem"}
                      aria-checked={item.checked ?? item.mark}
                      tabIndex={i() === 0 ? 0 : -1}
                      disabled={item.disabled}
                      classList={{ danger: !!item.danger, check: item.checked !== undefined }}
                      onClick={() => {
                        if (item.checked !== undefined) {
                          item.run();
                          refresh(s.items.map((x) => (x === item ? { ...x, checked: !x.checked } : x)));
                          return;
                        }
                        close(false);
                        item.run();
                      }}
                    >
                      <Show when={item.checked !== undefined || item.mark !== undefined} fallback={item.icon}>
                        <span class="menu-check">{item.checked || item.mark ? <Check /> : null}</span>
                      </Show>
                      <span>{item.label}</span>
                    </button>
                  </>
                )}
              </For>
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
