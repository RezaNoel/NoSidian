// The main workspace: ribbon | left sidebar | note area | context panel, with a
// status bar. On phones the sidebars become drawers and a bottom bar appears.
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { Settings, Vault as VaultIcon, X } from "lucide-solid";
import { t } from "../i18n";
import { profile, updateProfile } from "../state/workspace";
import { drawer, isMobile, setDrawer, setOverlay } from "../state/ui";
import { LeftSidebar } from "./LeftSidebar";
import { MobileNav } from "./MobileNav";
import { NoteView } from "./NoteView";
import { ResizeHandle } from "./ResizeHandle";
import { Ribbon, availableTools, later } from "./Ribbon";
import { RightSidebar } from "./RightSidebar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { hasTitleBar } from "./TitleBar";
import { openSettings } from "./settings/SettingsWindow";

function MoreSheet() {
  const tools = createMemo(availableTools);
  const pick = (fn: () => void) => { setDrawer("none"); fn(); };
  return (
    <div class="sheet glass-modal" role="dialog" aria-label={t("nav-more")}>
      <div class="sheet-grip" aria-hidden="true" />
      <div class="sheet-grid">
        <button class="sheet-item" onClick={() => pick(() => setOverlay("vaults"))}><VaultIcon /><span>{t("vault-switcher-title")}</span></button>
        <button class="sheet-item" onClick={() => pick(() => openSettings("you"))}><Settings /><span>{t("footer-settings")}</span></button>
        <For each={tools()}>{(tool) => <button class="sheet-item" onClick={() => pick(tool.run ?? later)}><tool.icon /><span>{t(tool.key)}</span></button>}</For>
      </div>
    </div>
  );
}

/** Below these widths the desktop app closes the side panels; opening one again lays it over the note. */
const NARROW_RIGHT = 1100;
const NARROW_LEFT = 820;

export function Workspace() {
  const [width, setWidth] = createSignal(window.innerWidth);
  const onResize = () => setWidth(window.innerWidth);
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));
  const narrowRight = () => !isMobile() && width() < NARROW_RIGHT;
  const narrowLeft = () => !isMobile() && width() < NARROW_LEFT;
  // Close a panel when the window shrinks past its width, once per crossing.
  createEffect(on(narrowRight, (n, was) => { if (n && !was) updateProfile((p) => { p.panels.right = false; }); }));
  createEffect(on(narrowLeft, (n, was) => { if (n && !was) updateProfile((p) => { p.panels.left = false; }); }));
  const showLeft = () => (isMobile() ? drawer() === "left" : profile.panels.left);
  const showRight = () => (isMobile() ? drawer() === "right" : profile.panels.right);
  return (
    <div
      class="workspace"
      classList={{ mobile: isMobile(), "no-left": !showLeft(), "no-right": !showRight(), "float-left": narrowLeft(), "float-right": narrowRight() }}
      style={{ "--left-width": `${profile.leftWidth}px`, "--right-width": `${profile.rightWidth}px` }}
      onKeyDown={(e) => { if (e.key === "Escape" && isMobile() && drawer() !== "none") setDrawer("none"); }}
    >
      <Show when={!isMobile() && profile.panels.ribbon}><Ribbon /></Show>
      <Show when={showLeft()}>
        <div class="slot-left">
          <LeftSidebar />
          <Show when={!isMobile()}><ResizeHandle side="left" label={t("resize-left")} /></Show>
        </div>
      </Show>
      <main class="main glass" id="main" aria-label={t("shell-workspace-label")}>
        <Show when={!hasTitleBar() || isMobile()}><TabBar /></Show>
        <NoteView />
      </main>
      <Show when={showRight()}>
        <div class="slot-right">
          <Show when={!isMobile()}><ResizeHandle side="right" label={t("resize-right")} /></Show>
          <RightSidebar />
        </div>
      </Show>
      <Show when={isMobile() && drawer() !== "none"}>
        <button class="drawer-scrim" aria-label={t("action-close")} onClick={() => setDrawer("none")}><X aria-hidden="true" /></button>
      </Show>
      <Show when={isMobile() && drawer() === "more"}><MoreSheet /></Show>
      <Show when={!isMobile() && profile.panels.statusBar}><StatusBar /></Show>
      <Show when={isMobile()}><MobileNav /></Show>
    </div>
  );
}
