// Left sidebar: six section tabs (files, recent, search, tags, starred, calendar).
import { For, Match, Show, Switch, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { Calendar, Clock, Files, Hash, Search, Star, Tags } from "lucide-solid";
import { locale, t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { noteTitle } from "../lib/markdown";
import { backend } from "../backend";
import { relativeTime } from "../lib/tree";
import { activePath, indexRev, openNote, tree } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile, setDrawer } from "../state/ui";
import type { LeftTab, SearchHit, SearchSort, TagCount } from "../state/types";
import { revealLine } from "./Editor";
import { CalendarPanel } from "./Calendar";
import { FileTree } from "./FileTree";
import { VaultFooter } from "./VaultFooter";
import { noteItemMenu, recentExtras, tagMenu } from "./itemMenus";
import type { MenuItem } from "./ContextMenu";
import { VaultBanner } from "./Banner";
import { hasTitleBar } from "./TitleBar";

const TABS: { id: LeftTab; icon: typeof Files; label: () => string }[] = [
  { id: "files", icon: Files, label: () => t("tab-files") },
  { id: "recent", icon: Clock, label: () => t("tab-recent") },
  { id: "search", icon: Search, label: () => t("tab-search") },
  { id: "tags", icon: Tags, label: () => t("tab-tags") },
  { id: "starred", icon: Star, label: () => t("tab-starred") },
  { id: "calendar", icon: Calendar, label: () => t("tab-calendar") },
];

/** These live in the window title bar on desktop, so the panel strip skips them. */
const TOP_BAR_TABS: LeftTab[] = ["files", "search", "starred"];

const open = (path: string) => {
  openNote(path);
  if (isMobile()) setDrawer("none");
};

function NoteLink(props: { path: string; meta?: string; snippet?: string; extra?: MenuItem[] }) {
  return (
    <li>
      <button class="list-row" classList={{ active: activePath() === props.path }} onClick={() => open(props.path)} onContextMenu={(e) => noteItemMenu(e, props.path, props.extra)}>
        <span class="list-title" dir="auto">{noteTitle(props.path)}</span>
        <Show when={props.meta}><span class="list-meta">{props.meta}</span></Show>
        <Show when={props.snippet}><span class="list-snippet" dir="auto">{props.snippet}</span></Show>
      </button>
    </li>
  );
}

function RecentPanel() {
  const items = createMemo(() => {
    const exists = new Set(tree.notes.map((n) => n.path));
    return profile.recent.filter((r) => exists.has(r.path));
  });
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-recent")}</h2></div>
      <Show when={items().length} fallback={<p class="empty">{t("links-none")}</p>}>
        <ul class="list"><For each={items()}>{(r) => <NoteLink path={r.path} meta={relativeTime(r.openedAt, locale())} extra={recentExtras(r.path)} />}</For></ul>
      </Show>
    </div>
  );
}

const SEARCH_SORTS: SearchSort[] = ["relevance", "title", "modified"];
const [searchQuery, setSearchQuery] = createSignal("");
const [searchSort, setSearchSort] = createSignal<SearchSort>("relevance");
// Tag clicks in notes, the dashboard and the graph search the vault for that tag.
if (typeof window !== "undefined") window.addEventListener("nosidian:search", (e) => {
  setSearchQuery((e as CustomEvent<string>).detail);
  updateProfile((p) => { p.panels.left = true; p.leftTab = "search"; });
});

/** Highlight query terms inside a matched line. */
function Highlighted(props: { text: string; terms: string[] }) {
  const parts = createMemo(() => {
    const terms = props.terms.filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!terms.length) return [props.text];
    // With one capture group, odd indices are the matches.
    return props.text.split(new RegExp(`(${terms.join("|")})`, "iu"));
  });
  return <For each={parts()}>{(p, i) => (i() % 2 ? <mark>{p}</mark> : <>{p}</>)}</For>;
}

/** Plain words of a query, for highlighting (operators and exclusions dropped). */
function queryTerms(q: string): string[] {
  const out: string[] = [];
  for (const m of q.matchAll(/"([^"]+)"|(\S+)/g)) {
    const raw = m[1] ?? m[2];
    if (m[2] && (raw.startsWith("-") || raw.startsWith("#") || /^(tag|path):/i.test(raw))) continue;
    out.push(raw.replace(/^title:/i, ""));
  }
  return out;
}

function SearchPanel() {
  const [debounced, setDebounced] = createSignal(searchQuery());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onInput = (v: string) => {
    setSearchQuery(v);
    clearTimeout(timer);
    timer = setTimeout(() => setDebounced(v), 140);
  };
  onCleanup(() => clearTimeout(timer));
  const [results] = createResource(
    () => ({ q: debounced().trim(), sort: searchSort(), rev: indexRev() }),
    ({ q, sort }) => (q ? backend.search(q, sort, 100) : Promise.resolve([] as SearchHit[])),
    { initialValue: [] },
  );
  const terms = createMemo(() => queryTerms(debounced()));
  const go = (path: string, line?: number) => {
    open(path);
    if (line !== undefined) revealLine(path, line);
  };
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-search")}</h2></div>
      <div class="panel-pad search-bar">
        <input id="search-input" class="input" type="search" placeholder={t("search-placeholder")} aria-label={t("tab-search")} aria-describedby="search-help"
          value={searchQuery()} onInput={(e) => onInput(e.currentTarget.value)} dir="auto" autofocus />
        <select class="input select-sm" aria-label={t("search-sort-label")} value={searchSort()} onChange={(e) => setSearchSort(e.currentTarget.value as SearchSort)}>
          <For each={SEARCH_SORTS}>{(s) => <option value={s}>{t(`search-sort-${s}`)}</option>}</For>
        </select>
      </div>
      <p id="search-help" class="hint panel-pad">{t("search-help")}</p>
      <Show when={debounced().trim()}>
        <p class="sr-only" role="status">{results.loading ? "" : results().length ? t("status-results", { count: results().length }) : t("no-results")}</p>
        <Show when={results().length} fallback={<Show when={!results.loading}><p class="empty">{t("no-results")}</p></Show>}>
          <ul class="list search-results">
            <For each={results()}>
              {(r) => (
                <li class="search-hit">
                  <button class="list-row" classList={{ active: activePath() === r.path }} onClick={() => go(r.path, r.matches[0]?.line)} onContextMenu={(e) => noteItemMenu(e, r.path)}>
                    <span class="list-title" dir="auto"><Highlighted text={r.title} terms={terms()} /></span>
                    <Show when={r.path.includes("/")}><span class="list-meta" dir="auto">{r.path.slice(0, r.path.lastIndexOf("/"))}</span></Show>
                  </button>
                  <Show when={r.matches.length}>
                    <ul class="line-matches">
                      <For each={r.matches.slice(0, 4)}>
                        {(m) => (
                          <li>
                            <button class="line-match" onClick={() => go(r.path, m.line)}>
                              <span class="line-no">{m.line + 1}</span>
                              <span class="list-snippet" dir="auto"><Highlighted text={m.text} terms={terms()} /></span>
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}

function TagsPanel() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [tags] = createResource(() => indexRev() + 1, () => backend.tags(), { initialValue: [] as TagCount[] });
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-tags")}</h2></div>
      <Show when={tags().length} fallback={<p class="empty">{t("no-tags")}</p>}>
        <div class="tag-cloud">
          <For each={tags()}>
            {(tag) => (
              <button class="tag-chip" aria-pressed={selected() === tag.tag} onClick={() => setSelected(selected() === tag.tag ? null : tag.tag)} onContextMenu={(e) => tagMenu(e, tag.tag)}>
                <Hash aria-hidden="true" />{tag.tag}<span class="count">{tag.count}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={selected()}>
          <ul class="list"><For each={tags().find((x) => x.tag === selected())?.paths ?? []}>{(p) => <NoteLink path={p} />}</For></ul>
        </Show>
      </Show>
    </div>
  );
}

function StarredPanel() {
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-starred")}</h2></div>
      <Show when={profile.starred.length} fallback={<p class="empty">{t("no-starred")}</p>}>
        <ul class="list"><For each={profile.starred}>{(p) => <NoteLink path={p} />}</For></ul>
      </Show>
    </div>
  );
}

export function LeftSidebar() {
  return (
    <aside class="sidebar left glass" aria-label={t("shell-left-sidebar-label")}>
      <VaultBanner />
      <div class="sidebar-tabs" role="tablist" aria-label={t("left-tabs-label")} onKeyDown={rovingKeydown("[role=tab]", "horizontal")}>
        <For each={TABS.filter((x) => !(hasTitleBar() && !isMobile() && TOP_BAR_TABS.includes(x.id)))}>
          {(tab) => (
            <button
              role="tab"
              id={`ltab-${tab.id}`}
              aria-controls="left-panel"
              aria-selected={profile.leftTab === tab.id}
              tabIndex={profile.leftTab === tab.id ? 0 : -1}
              class="icon-btn"
              title={tab.label()}
              aria-label={tab.label()}
              onClick={() => updateProfile((p) => { p.leftTab = tab.id; })}
              onFocus={() => updateProfile((p) => { p.leftTab = tab.id; })}
            >
              <tab.icon />
            </button>
          )}
        </For>
      </div>
      <div id="left-panel" class="sidebar-body" role="tabpanel" aria-labelledby={`ltab-${profile.leftTab}`}>
        <Switch>
          <Match when={profile.leftTab === "files"}><FileTree /></Match>
          <Match when={profile.leftTab === "recent"}><RecentPanel /></Match>
          <Match when={profile.leftTab === "search"}><SearchPanel /></Match>
          <Match when={profile.leftTab === "tags"}><TagsPanel /></Match>
          <Match when={profile.leftTab === "starred"}><StarredPanel /></Match>
          <Match when={profile.leftTab === "calendar"}><CalendarPanel /></Match>
        </Switch>
      </div>
      <VaultFooter />
    </aside>
  );
}
