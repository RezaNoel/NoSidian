// Context panel: links (backlinks, outgoing, unlinked), outline, and tabs for
// focus, history and review stats that arrive in later phases.
import { fileKind } from "../lib/attachments";
import { For, Match, Show, Switch, createMemo, createResource } from "solid-js";
import { History, Link2, ListTree, Brain, Timer, ArrowUpRight, CircleDashed } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { headings, noteTitle } from "../lib/markdown";
import { announce } from "../a11y/announcer";
import { backend } from "../backend";
import { linkMention } from "../lib/links";
import { activePath, contents, createNote, ensureLoaded, indexRev, openNote, setContent } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile, setDrawer } from "../state/ui";
import type { Mention, NoteLinks, RightTab } from "../state/types";
import { editorGotoLine, revealLine } from "./Editor";
import { modeOf } from "./NoteView";
import { scrollReaderTo } from "./Reader";
import { HistoryPanel } from "./HistoryPanel";
import { SrsPanel } from "./flashcards/SrsPanel";
import { FocusPanel } from "./focus/FocusPanel";
import { isAppView } from "../state/views";
import { noteItemMenu } from "./itemMenus";

const TABS: { id: RightTab; icon: typeof Link2; label: () => string }[] = [
  { id: "links", icon: Link2, label: () => t("tab-links") },
  { id: "outline", icon: ListTree, label: () => t("tab-outline") },
  { id: "focus", icon: Timer, label: () => t("tab-focus") },
  { id: "history", icon: History, label: () => t("tab-history") },
  { id: "srs", icon: Brain, label: () => t("tab-srs") },
];

const go = (path: string, line?: number) => {
  openNote(path);
  if (line !== undefined) revealLine(path, line);
  if (isMobile()) setDrawer("none");
};

async function linkIt(m: Mention, target: string) {
  await ensureLoaded(m.path);
  const next = linkMention(contents[m.path] ?? "", m.line, noteTitle(target));
  if (next === null) return;
  setContent(m.path, next);
  announce(t("announce-linked", { name: noteTitle(m.path) }));
}

function MentionList(props: { title: string; items: Mention[]; linkTo?: string }) {
  return (
    <section class="ctx-section">
      <h3 class="section-title">{props.title} <span class="count">{props.items.length}</span></h3>
      <Show when={props.items.length} fallback={<p class="empty sm">{t("links-none")}</p>}>
        <ul class="list">
          <For each={props.items}>
            {(m) => (
              <li class="mention">
                <button class="list-row" onClick={() => go(m.path, m.line)} onContextMenu={(e) => noteItemMenu(e, m.path)}>
                  <span class="list-title" dir="auto">{noteTitle(m.path)}</span>
                  <span class="list-snippet" dir="auto">{m.snippet}</span>
                </button>
                <Show when={props.linkTo}>
                  <button class="btn sm link-btn" title={t("action-link")} aria-label={`${t("action-link")}: ${noteTitle(m.path)}`} onClick={() => void linkIt(m, props.linkTo!)}>
                    <Link2 aria-hidden="true" />{t("action-link")}
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

const EMPTY_LINKS: NoteLinks = { backlinks: [], outgoing: [], unlinked: [] };

function LinksPanel(props: { path: string }) {
  const [links] = createResource(() => ({ path: props.path, rev: indexRev() }), ({ path }) => backend.links(path), { initialValue: EMPTY_LINKS });
  // Embedded images, audio and video are files, not notes to create.
  const out = () => links().outgoing.filter((o) => o.path || !/^(image|audio|video)$/.test(fileKind(o.target) ?? ""));
  return (
    <>
      <MentionList title={t("links-backlinks")} items={links().backlinks} />
      <section class="ctx-section">
        <h3 class="section-title">{t("links-outgoing")} <span class="count">{out().length}</span></h3>
        <Show when={out().length} fallback={<p class="empty sm">{t("links-none")}</p>}>
          <ul class="list">
            <For each={out()}>
              {(o) => (
                <li>
                  <button class="list-row inline" classList={{ unresolved: !o.path }} onClick={() => (o.path ? go(o.path) : void createNote(o.target))} onContextMenu={(e) => o.path && noteItemMenu(e, o.path)}>
                    {o.path ? <ArrowUpRight class="flip-rtl" aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                    <span class="list-title" dir="auto">{o.target}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
      <MentionList title={t("links-unlinked")} items={links().unlinked} linkTo={props.path} />
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
                <Match when={profile.rightTab === "history" && !isAppView(path)}><HistoryPanel path={path} /></Match>
                <Match when={profile.rightTab === "srs"}><SrsPanel path={path} /></Match>
                <Match when={profile.rightTab === "focus"}><FocusPanel /></Match>
              </Switch>
            )}
          </Show>
        </div>
      </div>
    </aside>
  );
}
