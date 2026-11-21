// The open note: header (path, title, star, view mode) and the editor/reader panes.
import { For, Match, Show, Switch, createMemo } from "solid-js";
import { BookOpen, Columns2, FilePlus, SquarePen, Star } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { noteTitle } from "../lib/markdown";
import { activePath, openNote, toggleStar, tree } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile } from "../state/ui";
import type { ViewMode } from "../state/types";
import { Editor } from "./Editor";
import { Reader } from "./Reader";
import { promptNewNote } from "./FileTree";

type PaneMode = "editor" | "split" | "reader";
const MODES: { id: PaneMode; icon: typeof BookOpen }[] = [
  { id: "editor", icon: SquarePen },
  { id: "split", icon: Columns2 },
  { id: "reader", icon: BookOpen },
];

export function modeOf(path: string): PaneMode {
  const m: ViewMode = profile.noteModes[path] ?? profile.viewMode;
  const pane: PaneMode = m === "editor" || m === "reader" || m === "split" ? m : "split";
  return pane === "split" && isMobile() ? "editor" : pane;
}

function EmptyState() {
  const recent = createMemo(() => profile.recent.filter((r) => tree.notes.some((n) => n.path === r.path)).slice(0, 5));
  return (
    <div class="empty-state">
      <div class="empty-mark" aria-hidden="true">N</div>
      <h1>{t("empty-title")}</h1>
      <p>{t("empty-subtitle")}</p>
      <button class="btn primary" onClick={() => void promptNewNote()}><FilePlus />{t("action-new-note")}</button>
      <Show when={recent().length}>
        <ul class="empty-recent">
          <For each={recent()}>{(r) => <li><button class="btn" onClick={() => openNote(r.path)} dir="auto">{noteTitle(r.path)}</button></li>}</For>
        </ul>
      </Show>
    </div>
  );
}

export function NoteView() {
  return (
    <section id="note-view" class="note-view" role="tabpanel" aria-label={activePath() ? noteTitle(activePath()!) : t("shell-workspace-label")}>
      <Show when={activePath()} keyed fallback={<EmptyState />}>
        {(path) => {
          const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
          const starred = () => profile.starred.includes(path);
          const mode = () => modeOf(path);
          const setMode = (m: PaneMode) => updateProfile((p) => { p.noteModes[path] = m; p.viewMode = m; });
          return (
            <>
              <header class="note-header">
                <div class="note-heading">
                  <Show when={folder}><span class="note-crumbs" dir="auto">{folder.split("/").join(" / ")}</span></Show>
                  <h1 class="note-title" dir="auto">{noteTitle(path)}</h1>
                </div>
                <button class="icon-btn" aria-pressed={starred()} title={starred() ? t("action-unstar") : t("action-star")} aria-label={starred() ? t("action-unstar") : t("action-star")} onClick={() => toggleStar(path)}>
                  <Star class={starred() ? "filled" : ""} />
                </button>
                <div class="segmented" role="radiogroup" aria-label={t("view-mode-label")} onKeyDown={rovingKeydown("[role=radio]", "horizontal")}>
                  <For each={MODES.filter((m) => !(isMobile() && m.id === "split"))}>
                    {(m) => (
                      <button role="radio" aria-checked={mode() === m.id} tabIndex={mode() === m.id ? 0 : -1} title={t(`mode-${m.id}`)} onClick={() => setMode(m.id)}>
                        <m.icon aria-hidden="true" /><span class="seg-label">{t(`mode-${m.id}`)}</span>
                      </button>
                    )}
                  </For>
                </div>
              </header>
              <div class="panes" data-mode={mode()}>
                <Switch>
                  <Match when={mode() === "editor"}><Editor path={path} /></Match>
                  <Match when={mode() === "reader"}><div class="pane-scroll"><Reader path={path} /></div></Match>
                  <Match when={mode() === "split"}>
                    <Editor path={path} />
                    <div class="pane-scroll pane-divider"><Reader path={path} /></div>
                  </Match>
                </Switch>
              </div>
            </>
          );
        }}
      </Show>
    </section>
  );
}
