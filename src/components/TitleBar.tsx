// Custom window title bar for the desktop app (native decorations are off),
// laid out like a browser: sidebar and view buttons, the open note tabs, then
// the right sidebar toggle and the window buttons. Empty space drags the
// window; double-click maximizes. Everything mirrors in RTL.
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { ChevronDown, Copy, FolderOpen, Minus, PanelLeft, PanelRight, Plus, Search, Square, Star, X } from "lucide-solid";
import { t } from "../i18n";
import { inTauri } from "../state/backend";
import { noteTitle } from "../lib/markdown";
import { activePath, openNote, vault } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import type { LeftTab } from "../state/types";
import { commandById } from "../state/commands";
import { Logo } from "./Logo";
import { TabBar } from "./TabBar";
import { ModeSwitch } from "./NoteView";
import { openMenu } from "./ContextMenu";

/** The custom bar is shown in the desktop app, or in a browser with ?titlebar for previews. */
export const hasTitleBar = () =>
  (inTauri() && !/Android|iPhone|iPad/i.test(navigator.userAgent)) ||
  (typeof location !== "undefined" && location.search.includes("titlebar"));

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/** Open the left sidebar on a section, or close it if that section is already showing. */
function showLeft(tab: LeftTab) {
  updateProfile((p) => {
    if (p.panels.left && p.leftTab === tab) p.panels.left = false;
    else { p.panels.left = true; p.leftTab = tab; }
  });
}

export function TitleBar() {
  const [maximized, setMaximized] = createSignal(false);
  onMount(async () => {
    document.documentElement.dataset.titlebar = "true";
    if (!inTauri()) return;
    const w = await win();
    setMaximized(await w.isMaximized());
    const off = await w.onResized(async () => setMaximized(await w.isMaximized()));
    onCleanup(off);
  });
  onCleanup(() => delete document.documentElement.dataset.titlebar);

  const run = (fn: (w: Awaited<ReturnType<typeof win>>) => Promise<void>) => () => {
    if (inTauri()) void win().then(fn);
  };
  const leftOn = (tab: LeftTab) => profile.panels.left && profile.leftTab === tab;
  const tabList = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl";
    openMenu({ clientX: rtl ? r.left : r.right - 240, clientY: r.bottom + 4 }, profile.openTabs.map((p) => ({
      label: (p === activePath() ? "✓ " : "") + noteTitle(p),
      run: () => openNote(p),
    })));
  };

  return (
    <header class="titlebar" data-tauri-drag-region classList={{ maximized: maximized(), workspace: !!vault() }}>
      <Show
        when={vault()}
        fallback={
          <div class="titlebar-brand" data-tauri-drag-region>
            <Logo size={18} />
            <span data-tauri-drag-region>{t("app-name")}</span>
          </div>
        }
      >
        <div class="tb-group" role="toolbar" aria-label={t("shell-left-sidebar-label")}>
          <button class="tb-btn" aria-pressed={profile.panels.left} title={t("ribbon-toggle-left")} aria-label={t("ribbon-toggle-left")} onClick={() => updateProfile((p) => { p.panels.left = !p.panels.left; })}>
            <PanelLeft class="flip-rtl" />
          </button>
          <button class="tb-btn" aria-pressed={leftOn("files")} title={t("ribbon-files")} aria-label={t("ribbon-files")} onClick={() => showLeft("files")}><FolderOpen /></button>
          <button class="tb-btn" aria-pressed={leftOn("search")} title={t("ribbon-search")} aria-label={t("ribbon-search")} onClick={() => showLeft("search")}><Search /></button>
          <button class="tb-btn" aria-pressed={leftOn("starred")} title={t("tab-starred")} aria-label={t("tab-starred")} onClick={() => showLeft("starred")}><Star /></button>
        </div>
        <div class="tb-tabs" data-tauri-drag-region>
          <TabBar inline />
          <button class="tb-btn tb-new" title={t("action-new-note")} aria-label={t("action-new-note")} onClick={() => void commandById("new-note")?.run()}><Plus /></button>
          <span class="tb-fill" data-tauri-drag-region />
        </div>
        <div class="tb-group">
          <Show when={activePath()} keyed>{(path) => <ModeSwitch path={path} compact />}</Show>
          <button class="tb-btn" title={t("tabs-label")} aria-label={t("tabs-label")} aria-haspopup="menu" disabled={!profile.openTabs.length} onClick={tabList}><ChevronDown /></button>
          <button class="tb-btn" aria-pressed={profile.panels.right} title={t("ribbon-toggle-right")} aria-label={t("ribbon-toggle-right")} onClick={() => updateProfile((p) => { p.panels.right = !p.panels.right; })}>
            <PanelRight class="flip-rtl" />
          </button>
        </div>
      </Show>
      <div class="caption-buttons">
        <button class="caption" title={t("win-minimize")} aria-label={t("win-minimize")} onClick={run((w) => w.minimize())}><Minus /></button>
        <button class="caption" title={maximized() ? t("win-restore") : t("win-maximize")} aria-label={maximized() ? t("win-restore") : t("win-maximize")} onClick={run((w) => w.toggleMaximize())}>
          {maximized() ? <Copy class="restore" /> : <Square />}
        </button>
        <button class="caption close" title={t("win-close")} aria-label={t("win-close")} onClick={run((w) => w.close())}><X /></button>
      </div>
    </header>
  );
}
