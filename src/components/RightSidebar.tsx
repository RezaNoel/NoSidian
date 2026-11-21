// Context panel: links (backlinks, outgoing, unlinked), outline, and tabs for
// focus, history and review stats that arrive in later phases.
import { For, Match, Show, Switch, createMemo } from "solid-js";
import { History, Link2, ListTree, Brain, Timer, ArrowUpRight, CircleDashed } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { headings, noteTitle } from "../lib/markdown";
import { backlinks, outgoing, unlinkedMentions, type Mention } from "../lib/links";
import { activePath, contents, createNote, markdownPaths, openNote } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile, setDrawer } from "../state/ui";
import type { RightTab } from "../state/types";
import { editorGotoLine } from "./Editor";
import { modeOf } from "./NoteView";
import { scrollReaderTo } from "./Reader";

const TABS: { id: RightTab; icon: typeof Link2; label: () => string }[] = [
  { id: "links", icon: Link2, label: () => t("tab-links") },
  { id: "outline", icon: ListTree, label: () => t("tab-outline") },
  { id: "focus", icon: Timer, label: () => t("tab-focus") },
  { id: "history", icon: History, label: () => t("tab-history") },
  { id: "srs", icon: Brain, label: () => t("tab-srs") },
];

const go = (path: string) => {
  openNote(path);
  if (isMobile()) setDrawer("none");
};

function MentionList(props: { title: string; items: Mention[] }) {
  return (
    <section class="ctx-section">
      <h3 class="section-title">{props.title} <span class="count">{props.items.length}</span></h3>
      <Show when={props.items.length} fallback={<p class="empty sm">{t("links-none")}</p>}>
        <ul class="list">
          <For each={props.items}>
            {(m) => (
              <li>
                <button class="list-row" onClick={() => go(m.path)}>
                  <span class="list-title" dir="auto">{noteTitle(m.path)}</span>
                  <span class="list-snippet" dir="auto">{m.snippet}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function LinksPanel(props: { path: string }) {
  const back = createMemo(() => backlinks(props.path, contents, markdownPaths()));
  const out = createMemo(() => outgoing(props.path, contents, markdownPaths()));
  const unlinked = createMemo(() => unlinkedMentions(props.path, contents, markdownPaths()));
  return (
    <>
      <MentionList title={t("links-backlinks")} items={back()} />
      <section class="ctx-section">
        <h3 class="section-title">{t("links-outgoing")} <span class="count">{out().length}</span></h3>
        <Show when={out().length} fallback={<p class="empty sm">{t("links-none")}</p>}>
          <ul class="list">
            <For each={out()}>
              {(o) => (
                <li>
                  <button class="list-row inline" classList={{ unresolved: !o.path }} onClick={() => (o.path ? go(o.path) : void createNote(o.target))}>
                    {o.path ? <ArrowUpRight class="flip-rtl" aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                    <span class="list-title" dir="auto">{o.target}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
      <MentionList title={t("links-unlinked")} items={unlinked()} />
    </>
  );
}

function OutlinePanel(props: { path: string }) {
  const hs = createMemo(() => headings(contents[props.path] ?? ""));
  const jump = (line: number, slug: string) => {
    if (isMobile()) setDrawer("none");
    if (modeOf(props.path) === "reader") scrollReaderTo(slug);
    else if (!editorGotoLine(line)) scrollReaderTo(slug);
  };
  return (
    <Show when={hs().length} fallback={<p class="empty">{t("outline-empty")}</p>}>
      <ul class="outline">
        <For each={hs()}>
          {(h) => (
            <li style={{ "--level": h.level - 1 }}>
              <button class="list-row" onClick={() => jump(h.line, h.slug)}><span class="outline-text" dir="auto">{h.text}</span></button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

export function RightSidebar() {
  return (
    <aside class="sidebar right glass" aria-label={t("shell-right-sidebar-label")}>
      <div class="sidebar-tabs" role="tablist" aria-label={t("shell-right-sidebar-label")} onKeyDown={rovingKeydown("[role=tab]", "horizontal")}>
        <For each={TABS}>
          {(tab) => (
            <button
              role="tab"
              id={`rtab-${tab.id}`}
              aria-controls="right-panel"
              aria-selected={profile.rightTab === tab.id}
              tabIndex={profile.rightTab === tab.id ? 0 : -1}
              class="icon-btn"
              title={tab.label()}
              aria-label={tab.label()}
              onClick={() => updateProfile((p) => { p.rightTab = tab.id; })}
              onFocus={() => updateProfile((p) => { p.rightTab = tab.id; })}
            >
              <tab.icon />
            </button>
          )}
        </For>
      </div>
      <div id="right-panel" class="sidebar-body" role="tabpanel" aria-labelledby={`rtab-${profile.rightTab}`}>
        <div class="panel">
          <div class="panel-head"><h2 class="section-title">{TABS.find((x) => x.id === profile.rightTab)?.label()}</h2></div>
          <Show when={activePath()} keyed fallback={<p class="empty">{t("empty-title")}</p>}>
            {(path) => (
              <Switch fallback={<p class="empty">{t("panel-coming-soon")}</p>}>
                <Match when={profile.rightTab === "links"}><LinksPanel path={path} /></Match>
                <Match when={profile.rightTab === "outline"}><OutlinePanel path={path} /></Match>
              </Switch>
            )}
          </Show>
        </div>
      </div>
    </aside>
  );
}
