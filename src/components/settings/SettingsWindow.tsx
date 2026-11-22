// Settings window: icon tabs and a forgiving search. Search matches labels in
// the UI language and in English plus extra keywords, tolerates typos and
// partial words, and lists related settings from the same section.
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { Bot, Blocks, CalendarDays, ChevronLeft, Code2, FileText, FolderTree, Keyboard, Palette, PawPrint, PersonStanding, Search, User, Vault as VaultIcon, X } from "lucide-solid";
import { format, locale, t, type MessageKey } from "../../i18n";
import { rovingKeydown } from "../../a11y/roving";
import { setOverlay } from "../../state/ui";
import { Modal } from "../Modal";
import { ENTRIES, type Entry, type TabId } from "./entries";

export const SETTINGS_TABS: { id: TabId; icon: typeof Search }[] = [
  { id: "you", icon: User },
  { id: "appearance", icon: Palette },
  { id: "editor", icon: FileText },
  { id: "files", icon: FolderTree },
  { id: "features", icon: Blocks },
  { id: "calendar", icon: CalendarDays },
  { id: "companion", icon: PawPrint },
  { id: "hotkeys", icon: Keyboard },
  { id: "ai", icon: Bot },
  { id: "advanced", icon: Code2 },
  { id: "access", icon: PersonStanding },
  { id: "vault", icon: VaultIcon },
];

/** Older code and commands still ask for the previous tab names. */
const LEGACY: Record<string, TabId> = { general: "you", workspace: "appearance", daily: "files", pet: "companion", mcp: "ai", modules: "features", developer: "advanced", sync: "vault" };

const [tab, setTab] = createSignal<TabId>("you");
/** Phones show the list of sections first; a section opens its own page. */
const [mobileDetail, setMobileDetail] = createSignal(false);
export function openSettings(at?: TabId | string): void {
  setMobileDetail(!!at);
  if (at) setTab((LEGACY[at] ?? at) as TabId);
  setOverlay("settings");
}

const tabLabel = (id: TabId) => t(`stab-${id}` as MessageKey);

// ---------- Fuzzy matching ----------

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/[ً-ٰٟ‌]/g, "").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک");

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one query word matches a list of words (0 = not at all). */
function wordScore(q: string, words: string[], text: string): number {
  if (text.includes(q)) return words.some((w) => w === q) ? 4 : words.some((w) => w.startsWith(q)) ? 3 : 2.5;
  let best = 0;
  for (const w of words) {
    if (q.length >= 4 && w.length >= 3) {
      const d = editDistance(q, w.slice(0, q.length + 1), q.length >= 7 ? 2 : 1);
      if (d <= (q.length >= 7 ? 2 : 1)) best = Math.max(best, 1.6 - d * 0.3);
    }
    // Letters in order (e.g. "drk" → "dark").
    if (q.length >= 3 && w.length >= q.length) {
      let i = 0;
      for (const ch of w) if (ch === q[i]) i++;
      if (i === q.length && w[0] === q[0]) best = Math.max(best, 1);
    }
  }
  return best;
}

interface Hay { entry: Entry; text: string; words: string[] }

export function SettingsWindow() {
  const [query, setQuery] = createSignal("");
  const hay = createMemo<Hay[]>(() => {
    void locale();
    return ENTRIES.map((entry) => {
      const parts = [
        ...entry.keys.flatMap((k) => [t(k as "app-name"), format("en", k as "app-name")]),
        tabLabel(entry.tab), format("en", `stab-${entry.tab}` as "app-name"), entry.tags ?? "",
      ];
      const text = norm(parts.join(" "));
      return { entry, text, words: text.split(/[^\p{L}\p{N}]+/u).filter(Boolean) };
    });
  });
  const results = createMemo(() => {
    const q = norm(query().trim());
    if (!q) return null;
    const qs = q.split(/\s+/).filter(Boolean);
    const scored = hay().map((h) => {
      const per = qs.map((w) => wordScore(w, h.words, h.text));
      return { h, all: per.every((x) => x > 0), score: per.reduce((a, b) => a + b, 0) };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    const best = scored.filter((x) => x.all).map((x) => x.h.entry);
    const partial = scored.filter((x) => !x.all).map((x) => x.h.entry);
    // Related: other settings from the sections of the best matches.
    const tabs = new Set(best.slice(0, 3).map((x) => x.tab));
    const seen = new Set([...best, ...partial]);
    const related = [...partial, ...ENTRIES.filter((x) => tabs.has(x.tab) && !seen.has(x))].slice(0, 8);
    return { best, related };
  });
  const current = createMemo(() => ENTRIES.filter((e) => e.tab === tab()));
  const close = () => setOverlay("none");
  const go = (id: TabId) => { setTab(id); setQuery(""); };

  const EntryView = (props: { entry: Entry; showTab?: boolean }) => (
    <div class="setting" classList={{ wide: !!props.entry.wide }}>
      <Show when={props.entry.icon}>{(() => { const I = props.entry.icon!; return <I class="setting-icon" aria-hidden="true" />; })()}</Show>
      <div class="setting-body">
        {props.entry.render()}
        <Show when={props.showTab}>
          <button class="setting-where" onClick={() => go(props.entry.tab)}>{tabLabel(props.entry.tab)}</button>
        </Show>
      </div>
    </div>
  );

  return (
    <Modal title={t("footer-settings")} hideTitle onClose={close} closeButton={false} class="settings-window">
      <div class="settings-layout" classList={{ detail: mobileDetail() || !!query().trim() }}>
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
                  aria-selected={!results() && tab() === x.id}
                  tabIndex={tab() === x.id ? 0 : -1}
                  class="settings-tab"
                  title={tabLabel(x.id)}
                  onClick={() => { setMobileDetail(true); go(x.id); }}
                >
                  <x.icon aria-hidden="true" />
                  <span>{tabLabel(x.id)}</span>
                </button>
              )}
            </For>
          </div>
        </nav>
        <section id="settings-panel" class="settings-panel" role="tabpanel" aria-labelledby={results() ? undefined : `stab-${tab()}`} aria-label={results() ? t("settings-search") : undefined}>
          <header class="settings-panel-head">
            <button class="icon-btn settings-back" title={t("action-back")} aria-label={t("action-back")} onClick={() => { setQuery(""); setMobileDetail(false); }}><ChevronLeft class="flip-rtl" aria-hidden="true" /></button>
            <h2 class="modal-title">{results() ? t("settings-results") : tabLabel(tab())}</h2>
            <button class="icon-btn" title={t("action-close")} aria-label={t("action-close")} onClick={close}><X /></button>
          </header>
          <div class="settings-scroll">
            <Switch>
              <Match when={results()}>
                {(r) => (
                  <>
                    <p class="sr-only" role="status">{r().best.length ? t("settings-found", { count: r().best.length }) : t("settings-no-match", { query: query().trim() })}</p>
                    <Show when={r().best.length} fallback={<p class="empty">{t("settings-no-match", { query: query().trim() })}</p>}>
                      <For each={r().best}>{(entry) => <EntryView entry={entry} showTab />}</For>
                    </Show>
                    <Show when={r().related.length}>
                      <h3 class="set-sub">{t("settings-related")}</h3>
                      <For each={r().related}>{(entry) => <EntryView entry={entry} showTab />}</For>
                    </Show>
                  </>
                )}
              </Match>
              <Match when={!results()}>
                <For each={current()}>{(entry) => <EntryView entry={entry} />}</For>
              </Match>
            </Switch>
          </div>
        </section>
      </div>
    </Modal>
  );
}
