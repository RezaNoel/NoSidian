// The open note: header (path, title, star, view mode) and the editor/reader panes.
import { For, Match, Show, Switch, createMemo } from "solid-js";
import { BookOpen, Columns2, Ellipsis, FilePlus, Kanban, Languages, Presentation, SquarePen, Star, Workflow } from "lucide-solid";
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
import { Logo } from "./Logo";
import { hasTitleBar } from "./TitleBar";
import { setNoteSource } from "../a11y/voice";
import { contents } from "../state/vault";
import { pref } from "../state/prefs";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { isAppView, tabTitle } from "../state/views";
import { setSlidesFor } from "../state/ui";
import { exportHtml, exportMarkdown, printNote } from "../state/export";
import { openMenu } from "./ContextMenu";
import { PdfView } from "./PdfView";
import { KanbanView } from "./KanbanView";
import { MindmapView } from "./MindmapView";
import { AppViewHost } from "./AppViewHost";
import { FormatBar } from "./FormatBar";
import { Properties } from "./Properties";

setNoteSource(() => (activePath() ? contents[activePath()!] ?? null : null));

type PaneMode = ViewMode;
const MODES: { id: PaneMode; icon: typeof BookOpen }[] = [
  { id: "editor", icon: SquarePen },
  { id: "split", icon: Columns2 },
  { id: "reader", icon: BookOpen },
  { id: "mindmap", icon: Workflow },
  { id: "kanban", icon: Kanban },
];

export function modeOf(path: string): PaneMode {
  const m: ViewMode = profile.noteModes[path] ?? pref("editorDefaultMode");
  return m === "split" && isMobile() ? "editor" : m;
}

const modeAllowed = (m: PaneMode) => {
  const mods = enabledModules(settings.experienceLevel, settings.moduleOverrides);
  return (m !== "split" || !isMobile()) && (m !== "mindmap" || mods.has("mindmap")) && (m !== "kanban" || mods.has("kanban"));
};

/** Editor / split / reader switch for a note (in the title bar on desktop). */
export function ModeSwitch(props: { path: string; compact?: boolean }) {
  const mode = () => modeOf(props.path);
  if (isAppView(props.path) || /\.pdf$/i.test(props.path)) return null;
  const setMode = (m: PaneMode) => updateProfile((p) => { p.noteModes[props.path] = m; });
  return (
    <div class="segmented" classList={{ compact: props.compact }} role="radiogroup" aria-label={t("view-mode-label")} onKeyDown={rovingKeydown("[role=radio]", "horizontal")}>
      <For each={MODES.filter((m) => modeAllowed(m.id))}>
        {(m) => (
          <button role="radio" aria-checked={mode() === m.id} tabIndex={mode() === m.id ? 0 : -1} title={t(`mode-${m.id}`)} aria-label={t(`mode-${m.id}`)} onClick={() => setMode(m.id)}>
            <m.icon aria-hidden="true" /><Show when={!props.compact}><span class="seg-label">{t(`mode-${m.id}`)}</span></Show>
          </button>
        )}
      </For>
    </div>
  );
}

function EmptyState() {
  const recent = createMemo(() => profile.recent.filter((r) => tree.notes.some((n) => n.path === r.path)).slice(0, 5));
  return (
    <div class="empty-state">
      <Logo size={76} class="empty-mark" />
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

function noteMenu(e: MouseEvent, path: string) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl";
  openMenu({ clientX: rtl ? r.left : r.right - 240, clientY: r.bottom + 4 }, [
    { label: t("slides-present"), run: () => setSlidesFor(path) },
    { label: t("export-md"), run: () => void exportMarkdown(path) },
    { label: t("export-html"), run: () => void exportHtml(path) },
    { label: t("export-print"), run: () => void printNote(path) },
  ]);
}

const DIRS = ["auto", "rtl", "ltr"] as const;
function cycleDir(path: string) {
  updateProfile((p) => {
    const cur = p.noteDirs[path] ?? "auto";
    const next = DIRS[(DIRS.indexOf(cur) + 1) % DIRS.length];
    if (next === "auto") delete p.noteDirs[path];
    else p.noteDirs[path] = next;
  });
}

function NoteBody(props: { path: string }) {
  const path = props.path;
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const starred = () => profile.starred.includes(path);
  const mode = () => modeOf(path);
  const dir = () => profile.noteDirs[path] ?? "auto";
  const editing = () => mode() === "editor" || mode() === "split";
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
        <Show when={!/\.pdf$/i.test(path)}>
          <button class="icon-btn dir-btn" title={`${t("note-dir-label")}: ${t(`note-dir-${dir()}`)}`} aria-label={`${t("note-dir-label")}: ${t(`note-dir-${dir()}`)}`} onClick={() => cycleDir(path)}>
            <Languages /><span class="dir-tag" aria-hidden="true">{dir() === "auto" ? "A" : dir().toUpperCase()}</span>
          </button>
          <button class="icon-btn" title={t("slides-present")} aria-label={t("slides-present")} onClick={() => setSlidesFor(path)}><Presentation /></button>
          <button class="icon-btn" title={t("note-more")} aria-label={t("note-more")} aria-haspopup="menu" onClick={(e) => noteMenu(e, path)}><Ellipsis /></button>
          <Show when={!hasTitleBar()}><ModeSwitch path={path} /></Show>
        </Show>
      </header>
      <Show when={/\.pdf$/i.test(path)} fallback={
        <>
          <Show when={editing() && pref("formatBar")}><FormatBar /></Show>
          <div class="panes" data-mode={mode()}>
            <Switch>
              <Match when={mode() === "editor"}><EditorPane path={path} /></Match>
              <Match when={mode() === "reader"}><div class="pane-scroll"><Reader path={path} /></div></Match>
              <Match when={mode() === "split"}>
                <EditorPane path={path} />
                <div class="pane-scroll pane-divider" data-sync="reader"><Reader path={path} /></div>
              </Match>
              <Match when={mode() === "mindmap"}><MindmapView path={path} /></Match>
              <Match when={mode() === "kanban"}><KanbanView path={path} /></Match>
            </Switch>
          </div>
        </>
      }>
        <PdfView path={path} />
      </Show>
    </>
  );
}

function EditorPane(props: { path: string }) {
  return (
    <div class="editor-pane" dir={profile.noteDirs[props.path] ?? "auto"}>
      <Show when={pref("showProperties")}><Properties path={props.path} /></Show>
      <Editor path={props.path} />
    </div>
  );
}

export function NoteView() {
  return (
    <section id="note-view" class="note-view" role="tabpanel" aria-label={activePath() ? tabTitle(activePath()!) : t("shell-workspace-label")}>
      <Show when={activePath()} keyed fallback={<EmptyState />}>
        {(path) => (isAppView(path) ? <AppViewHost path={path} /> : <NoteBody path={path} />)}
      </Show>
    </section>
  );
}
