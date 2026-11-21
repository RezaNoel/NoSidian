// Small context menu (right-click or long-press). Arrow keys move, Escape closes.
import { For, Show, createRoot, createSignal, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { rovingKeydown } from "../a11y/roving";

export interface MenuItem { label: string; icon?: JSX.Element; danger?: boolean; run: () => void }

const menu = createRoot(() => {
  const [state, setState] = createSignal<{ x: number; y: number; items: MenuItem[]; opener: HTMLElement | null } | null>(null);
  return { state, setState };
});

export function openMenu(e: MouseEvent | { clientX: number; clientY: number }, items: MenuItem[]): void {
  if ("preventDefault" in e) e.preventDefault();
  menu.setState({ x: e.clientX, y: e.clientY, items, opener: document.activeElement as HTMLElement | null });
}

function close(refocus = true) {
  const s = menu.state();
  menu.setState(null);
  if (refocus) s?.opener?.focus?.();
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
          el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
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
                rovingKeydown("[role=menuitem]", "vertical")(e);
              }}
            >
              <For each={s.items}>
                {(item, i) => (
                  <button
                    role="menuitem"
                    tabIndex={i() === 0 ? 0 : -1}
                    class={item.danger ? "danger" : ""}
                    onClick={() => { close(false); item.run(); }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                )}
              </For>
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
