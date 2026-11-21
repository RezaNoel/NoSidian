// The main workspace: ribbon | left sidebar | note area | context panel, with a
// status bar. On phones the sidebars become drawers and a bottom bar appears.
import { For, Show, createMemo } from "solid-js";
import { Settings, Vault as VaultIcon, X } from "lucide-solid";
import { t } from "../i18n";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { profile } from "../state/workspace";
import { drawer, isMobile, setDrawer, setOverlay } from "../state/ui";
import { LeftSidebar } from "./LeftSidebar";
import { MobileNav } from "./MobileNav";
import { NoteView } from "./NoteView";
import { ResizeHandle } from "./ResizeHandle";
import { Ribbon, TOOLS, later } from "./Ribbon";
import { RightSidebar } from "./RightSidebar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";

function MoreSheet() {
  const mods = createMemo(() => enabledModules(settings.experienceLevel, settings.moduleOverrides));
  const tools = createMemo(() => TOOLS.filter((x) => (!x.module || mods().has(x.module)) && x.key !== "ribbon-search"));
  const pick = (fn: () => void) => { setDrawer("none"); fn(); };
  return (
    <div class="sheet glass-modal" role="dialog" aria-label={t("nav-more")}>
      <div class="sheet-grip" aria-hidden="true" />
      <div class="sheet-grid">
        <button class="sheet-item" onClick={() => pick(() => setOverlay("vaults"))}><VaultIcon /><span>{t("vault-switcher-title")}</span></button>
        <button class="sheet-item" onClick={() => pick(() => setOverlay("settings"))}><Settings /><span>{t("footer-settings")}</span></button>
        <For each={tools()}>{(tool) => <button class="sheet-item" onClick={() => pick(tool.run ?? later)}><tool.icon /><span>{t(tool.key)}</span></button>}</For>
      </div>
    </div>
  );
}

export function Workspace() {
  const showLeft = () => (isMobile() ? drawer() === "left" : profile.panels.left);
  const showRight = () => (isMobile() ? drawer() === "right" : profile.panels.right);
  return (
    <div
      class="workspace"
      classList={{ mobile: isMobile(), "no-left": !showLeft(), "no-right": !showRight() }}
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
        <TabBar />
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
