// Full settings window: 13 tabs plus a live search across every setting. The
// search matches labels and hints in the current language and in English, so
// "theme" finds the theme picker in any language.
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import {
  Blocks, Bot, CalendarDays, Cloud, Code, FileText, FolderTree, Keyboard, LayoutPanelLeft, Palette,
  PawPrint, Search, Settings2, Vault as VaultIcon, X,
} from "lucide-solid";
import { format, locale, t, type MessageKey } from "../../i18n";
import { rovingKeydown } from "../../a11y/roving";
import { resetSettings } from "../../state/settings";
import { setOverlay } from "../../state/ui";
import { Modal } from "../Modal";
import { ENTRIES, type TabId } from "./entries";

export const SETTINGS_TABS: { id: TabId; icon: typeof Search; soon?: boolean }[] = [
  { id: "general", icon: Settings2 },
  { id: "workspace", icon: LayoutPanelLeft },
  { id: "editor", icon: FileText },
  { id: "files", icon: FolderTree },
  { id: "appearance", icon: Palette },
  { id: "daily", icon: CalendarDays },
  { id: "hotkeys", icon: Keyboard },
  { id: "pet", icon: PawPrint },
  { id: "mcp", icon: Bot },
  { id: "modules", icon: Blocks },
  { id: "developer", icon: Code },
  { id: "vault", icon: VaultIcon },
  { id: "sync", icon: Cloud, soon: true },
];

const [tab, setTab] = createSignal<TabId>("general");
/** Open settings at a given tab (used by the status bar and commands). */
export function openSettings(at?: TabId): void {
  if (at) setTab(at);
  setOverlay("settings");
}

const tabLabel = (id: TabId) => t(`settings-tab-${id}` as MessageKey);

/** Text a setting can be found by: its labels in the UI language and in English. */
function haystack(keys: MessageKey[]): string {
  const parts = keys.flatMap((k) => [t(k as "app-name"), format("en", k as "app-name")]);
  return parts.join(" ").toLocaleLowerCase();
}

export function SettingsWindow() {
  const [query, setQuery] = createSignal("");
  const matches = createMemo(() => {
    void locale();
    const q = query().trim().toLocaleLowerCase();
    if (!q) return null;
    const words = q.split(/\s+/);
    return ENTRIES.filter((e) => {
      const hay = `${haystack(e.keys)} ${tabLabel(e.tab).toLocaleLowerCase()} ${format("en", `settings-tab-${e.tab}` as "app-name").toLocaleLowerCase()}`;
      return words.every((w) => hay.includes(w));
    });
  });
  const groups = createMemo(() => {
    const m = matches();
    if (!m) return [];
    return SETTINGS_TABS.map((x) => ({ id: x.id, items: m.filter((e) => e.tab === x.id) })).filter((g) => g.items.length);
  });
  const current = createMemo(() => ENTRIES.filter((e) => e.tab === tab()));
  const close = () => setOverlay("none");

  return (
    <Modal title={t("footer-settings")} hideTitle onClose={close} class="settings-window">
      <div class="settings-layout">
        <nav class="settings-nav" aria-label={t("settings-tabs-label")}>
          <div class="settings-search">
            <Search aria-hidden="true" />
            <input class="input" type="search" placeholder={t("settings-search")} aria-label={t("settings-search")} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} dir="auto" autofocus />
          </div>
          <div class="settings-tabs" role="tablist" aria-orientation="vertical" aria-label={t("settings-tabs-label")} onKeyDown={rovingKeydown("[role=tab]", "vertical")}>
            <For each={SETTINGS_TABS}>
              {(x) => (
                <button
                  role="tab"
                  id={`stab-${x.id}`}
                  aria-controls="settings-panel"
                  aria-selected={!matches() && tab() === x.id}
                  tabIndex={tab() === x.id ? 0 : -1}
                  class="settings-tab"
                  onClick={() => { setTab(x.id); setQuery(""); }}
                >
                  <x.icon aria-hidden="true" />
                  <span>{tabLabel(x.id)}</span>
                  <Show when={x.soon}><span class="badge">{t("coming-soon")}</span></Show>
                </button>
              )}
            </For>
          </div>
        </nav>
        <section id="settings-panel" class="settings-panel" role="tabpanel" aria-labelledby={matches() ? undefined : `stab-${tab()}`} aria-label={matches() ? t("settings-search") : undefined}>
          <header class="settings-panel-head">
            <h2 class="modal-title">{matches() ? t("footer-settings") : tabLabel(tab())}</h2>
            <button class="icon-btn" title={t("action-close")} aria-label={t("action-close")} onClick={close}><X /></button>
          </header>
          <div class="settings-scroll">
            <Switch>
              <Match when={matches()}>
                <p class="sr-only" role="status">{groups().length ? "" : t("settings-no-match", { query: query().trim() })}</p>
                <Show when={groups().length} fallback={<p class="empty">{t("settings-no-match", { query: query().trim() })}</p>}>
                  <For each={groups()}>
                    {(g) => (
                      <div class="settings-group">
                        <h3 class="section-title">
                          <button class="link-btn" onClick={() => { setTab(g.id); setQuery(""); }}>{tabLabel(g.id)}</button>
                        </h3>
                        <For each={g.items}>{(e) => <div class="setting">{e.render()}</div>}</For>
                      </div>
                    )}
                  </For>
                </Show>
              </Match>
              <Match when={!matches()}>
                <For each={current()}>{(e) => <div class="setting">{e.render()}</div>}</For>
              </Match>
            </Switch>
          </div>
          <footer class="dialog-actions">
            <button class="btn" onClick={() => resetSettings()}>{t("action-reset-defaults")}</button>
            <button class="btn primary" onClick={close}>{t("action-close")}</button>
          </footer>
        </section>
      </div>
    </Modal>
  );
}

