// Left sidebar: six section tabs (files, recent, search, tags, starred, calendar).
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { Calendar, Clock, Files, Hash, Search, Star, Tags } from "lucide-solid";
import { locale, t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { noteTitle, splitFrontMatter, tagsOf } from "../lib/markdown";
import { relativeTime } from "../lib/tree";
import { activePath, contents, markdownPaths, openNote } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile, setDrawer } from "../state/ui";
import type { LeftTab } from "../state/types";
import { FileTree } from "./FileTree";
import { VaultFooter } from "./VaultFooter";

const TABS: { id: LeftTab; icon: typeof Files; label: () => string }[] = [
  { id: "files", icon: Files, label: () => t("tab-files") },
  { id: "recent", icon: Clock, label: () => t("tab-recent") },
  { id: "search", icon: Search, label: () => t("tab-search") },
  { id: "tags", icon: Tags, label: () => t("tab-tags") },
  { id: "starred", icon: Star, label: () => t("tab-starred") },
  { id: "calendar", icon: Calendar, label: () => t("tab-calendar") },
];

const open = (path: string) => {
  openNote(path);
  if (isMobile()) setDrawer("none");
};

function NoteLink(props: { path: string; meta?: string; snippet?: string }) {
  return (
    <li>
      <button class="list-row" classList={{ active: activePath() === props.path }} onClick={() => open(props.path)}>
        <span class="list-title" dir="auto">{noteTitle(props.path)}</span>
        <Show when={props.meta}><span class="list-meta">{props.meta}</span></Show>
        <Show when={props.snippet}><span class="list-snippet" dir="auto">{props.snippet}</span></Show>
      </button>
    </li>
  );
}

function RecentPanel() {
  const items = createMemo(() => profile.recent.filter((r) => contents[r.path] !== undefined));
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-recent")}</h2></div>
      <Show when={items().length} fallback={<p class="empty">{t("links-none")}</p>}>
        <ul class="list"><For each={items()}>{(r) => <NoteLink path={r.path} meta={relativeTime(r.openedAt, locale())} />}</For></ul>
      </Show>
    </div>
  );
}

function SearchPanel() {
  const [q, setQ] = createSignal("");
  const results = createMemo(() => {
    const needle = q().trim().toLocaleLowerCase();
    if (!needle) return [];
    const out: { path: string; snippet: string; score: number }[] = [];
    for (const path of markdownPaths()) {
      const title = noteTitle(path).toLocaleLowerCase();
      const [, body] = splitFrontMatter(contents[path] ?? "");
      const lower = body.toLocaleLowerCase();
      const at = lower.indexOf(needle);
      if (!title.includes(needle) && at < 0) continue;
      const snippet = at < 0 ? "" : body.slice(Math.max(0, at - 40), at + needle.length + 60).replace(/\s+/g, " ").trim();
      out.push({ path, snippet, score: (title.includes(needle) ? 10 : 0) + (at >= 0 ? 1 : 0) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  });
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-search")}</h2></div>
      <div class="panel-pad">
        <input class="input" type="search" placeholder={t("search-placeholder")} aria-label={t("tab-search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} dir="auto" autofocus />
      </div>
      <Show when={q().trim()}>
        <p class="sr-only" role="status">{results().length ? "" : t("no-results")}</p>
        <Show when={results().length} fallback={<p class="empty">{t("no-results")}</p>}>
          <ul class="list"><For each={results()}>{(r) => <NoteLink path={r.path} snippet={r.snippet} />}</For></ul>
        </Show>
      </Show>
    </div>
  );
}

function TagsPanel() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const index = createMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of markdownPaths()) for (const tag of tagsOf(contents[p] ?? "")) m.set(tag, [...(m.get(tag) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  });
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-tags")}</h2></div>
      <Show when={index().length} fallback={<p class="empty">{t("no-tags")}</p>}>
        <div class="tag-cloud">
          <For each={index()}>
            {([tag, notes]) => (
              <button class="tag-chip" aria-pressed={selected() === tag} onClick={() => setSelected(selected() === tag ? null : tag)}>
                <Hash aria-hidden="true" />{tag}<span class="count">{notes.length}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={selected()}>
          <ul class="list"><For each={index().find(([tag]) => tag === selected())?.[1] ?? []}>{(p) => <NoteLink path={p} />}</For></ul>
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

function CalendarPanel() {
  return (
    <div class="panel">
      <div class="panel-head"><h2 class="section-title">{t("tab-calendar")}</h2></div>
      <p class="empty">{t("panel-coming-soon")}</p>
    </div>
  );
}

export function LeftSidebar() {
  return (
    <aside class="sidebar left glass" aria-label={t("shell-left-sidebar-label")}>
      <div class="sidebar-tabs" role="tablist" aria-label={t("left-tabs-label")} onKeyDown={rovingKeydown("[role=tab]", "horizontal")}>
        <For each={TABS}>
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
