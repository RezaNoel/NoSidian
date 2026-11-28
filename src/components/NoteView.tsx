// The open note: header (path, title, star, view mode) and the editor/reader panes.
import { For, Match, Show, Switch } from "solid-js";
import { BookOpen, Columns2, Ellipsis, Kanban,  SquarePen, Star, Workflow } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { noteTitle } from "../lib/markdown";
import { activePath, toggleStar } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isMobile } from "../state/ui";
import type { ViewMode } from "../state/types";
import { Editor, syncReaderScroll } from "./Editor";
import { Reader } from "./Reader";
import { hasTitleBar } from "./TitleBar";
import { setNoteSource } from "../a11y/voice";
import { contents } from "../state/vault";
import { pref } from "../state/prefs";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { isAppView, tabTitle } from "../state/views";
import { setSlidesFor } from "../state/ui";
import { exportHtml, exportMarkdown, printNote } from "../state/export";
import { openMenu, type MenuItem } from "./ContextMenu";
import { PdfView } from "./PdfView";
import { KanbanView } from "./KanbanView";
import { MindmapView } from "./MindmapView";
import { StartPage } from "./StartPage";
import { AppViewHost } from "./AppViewHost";
import { FormatBar } from "./FormatBar";
import { Properties } from "./Properties";
import { MediaNoteHero } from "./media/MediaNoteHero";
import { PersonNoteHero } from "./people/PersonNoteHero";

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

function noteMenu(e: MouseEvent, path: string) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl";
  const starred = profile.starred.includes(path);
  // Phones keep the header to the title and two buttons; the rest lives here.
  const phone: MenuItem[] = isMobile() ? [
    { label: starred ? t("action-unstar") : t("action-star"), icon: <Star />, run: () => toggleStar(path) },
    ...MODES.filter((m) => modeAllowed(m.id) && (m.id === "mindmap" || m.id === "kanban")).map((m) => ({ label: t(`mode-${m.id}`), icon: <m.icon />, mark: modeOf(path) === m.id, run: () => updateProfile((p) => { p.noteModes[path] = m.id; }) })),
  ] : [];
  openMenu({ clientX: rtl ? r.left : r.right - 240, clientY: r.bottom + 4 }, [
    ...phone,
    { label: t("slides-present"), sep: phone.length > 0, run: () => setSlidesFor(path) },
    { label: t("export-md"), run: () => void exportMarkdown(path) },
    { label: t("export-html"), run: () => void exportHtml(path) },
    { label: t("export-print"), run: () => void printNote(path) },
  ]);
}

function NoteBody(props: { path: string }) {
  const path = props.path;
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const starred = () => profile.starred.includes(path);
  const mode = () => modeOf(path);
  const editing = () => mode() === "editor" || mode() === "split";
  return (
    <>
      <header class="note-header">
        <div class="note-heading">
          <Show when={folder}><span class="note-crumbs" dir="auto">{folder.split("/").join(" / ")}</span></Show>
          <h1 class="note-title" dir="auto">{noteTitle(path)}</h1>
        </div>
        <Show when={!isMobile()}>
          <button class="icon-btn" aria-pressed={starred()} title={starred() ? t("action-unstar") : t("action-star")} aria-label={starred() ? t("action-unstar") : t("action-star")} onClick={() => toggleStar(path)}>
            <Star class={starred() ? "filled" : ""} />
          </button>
        </Show>
        <Show when={!/\.pdf$/i.test(path)}>
          <Show when={isMobile()}>
            <button class="icon-btn mode-flip" title={editing() ? t("mode-reader") : t("mode-editor")} aria-label={editing() ? t("mode-reader") : t("mode-editor")} onClick={() => updateProfile((p) => { p.noteModes[path] = editing() ? "reader" : "editor"; })}>
              <Show when={editing()} fallback={<SquarePen />}><BookOpen /></Show>
            </button>
          </Show>
          <button class="icon-btn" title={t("note-more")} aria-label={t("note-more")} aria-haspopup="menu" onClick={(e) => noteMenu(e, path)}><Ellipsis /></button>
          <Show when={!hasTitleBar() && !isMobile()}><ModeSwitch path={path} /></Show>
        </Show>
      </header>
      <Show when={/\.pdf$/i.test(path)} fallback={
        <>
          <Show when={editing() && pref("formatBar")}><FormatBar /></Show>
          <Show when={mode() !== "mindmap" && mode() !== "kanban"}><MediaNoteHero path={path} /><PersonNoteHero path={path} /></Show>
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
    <div class="editor-pane" dir="auto" onScroll={(e) => syncReaderScroll(e.currentTarget)}>
      <Show when={pref("showProperties")}><Properties path={props.path} /></Show>
      <Editor path={props.path} />
    </div>
  );
}

export function NoteView() {
  return (
    <section id="note-view" class="note-view" role="tabpanel" aria-label={activePath() ? tabTitle(activePath()!) : t("shell-workspace-label")}>
      <Show when={activePath()} keyed fallback={<StartPage />}>
        {(path) => (isAppView(path) ? <AppViewHost path={path} /> : <NoteBody path={path} />)}
      </Show>
    </section>
  );
}
