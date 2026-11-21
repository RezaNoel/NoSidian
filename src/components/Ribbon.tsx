// Narrow vertical tool ribbon on desktop. Tools from later phases show only
// when their module is enabled for the user's experience level.
import { For, createMemo } from "solid-js";
import { Brain, CalendarDays, Command, Film, Kanban, LayoutDashboard, Network, PanelLeft, PanelRight, Presentation, Search, Settings, Terminal, Timer, Workflow } from "lucide-solid";
import { t, type MessageKey } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { profile, updateProfile } from "../state/workspace";
import { setOverlay, toast } from "../state/ui";
import type { ModuleId } from "../state/types";

export interface Tool { key: MessageKey; icon: typeof Brain; module?: ModuleId; run?: () => void }

export const later = () => toast(t("panel-coming-soon"));

export const TOOLS: Tool[] = [
  { key: "ribbon-dashboard", icon: LayoutDashboard, module: "dashboard" },
  { key: "ribbon-search", icon: Search, run: () => updateProfile((p) => { p.leftTab = "search"; p.panels.left = true; }) },
  { key: "ribbon-quick-switcher", icon: Command },
  { key: "ribbon-graph", icon: Network, module: "knowledge-graph" },
  { key: "ribbon-flashcards", icon: Brain, module: "flashcards" },
  { key: "ribbon-mindmap", icon: Workflow, module: "mindmap" },
  { key: "ribbon-kanban", icon: Kanban, module: "kanban" },
  { key: "ribbon-slides", icon: Presentation, module: "slides" },
  { key: "ribbon-daily-note", icon: CalendarDays, module: "daily-calendar" },
  { key: "ribbon-focus", icon: Timer, module: "zen-focus" },
  { key: "ribbon-media", icon: Film, module: "media-shelf" },
  { key: "ribbon-terminal", icon: Terminal, module: "integrated-terminal" },
];

export function Ribbon() {
  const mods = createMemo(() => enabledModules(settings.experienceLevel, settings.moduleOverrides));
  const tools = createMemo(() => TOOLS.filter((x) => !x.module || mods().has(x.module)));
  return (
    <nav class="ribbon glass" aria-label={t("shell-ribbon-label")}>
      <div class="ribbon-logo" aria-hidden="true">N</div>
      <div class="ribbon-group" role="toolbar" aria-orientation="vertical" aria-label={t("shell-ribbon-label")} onKeyDown={rovingKeydown("button", "vertical")}>
        <button class="icon-btn" tabIndex={0} aria-pressed={profile.panels.left} title={t("ribbon-toggle-left")} aria-label={t("ribbon-toggle-left")} onClick={() => updateProfile((p) => { p.panels.left = !p.panels.left; })}>
          <PanelLeft class="flip-rtl" />
        </button>
        <For each={tools()}>
          {(tool) => (
            <button class="icon-btn" tabIndex={-1} title={t(tool.key)} aria-label={t(tool.key)} onClick={tool.run ?? later}>
              <tool.icon />
            </button>
          )}
        </For>
      </div>
      <div class="ribbon-group end">
        <button class="icon-btn" aria-pressed={profile.panels.right} title={t("ribbon-toggle-right")} aria-label={t("ribbon-toggle-right")} onClick={() => updateProfile((p) => { p.panels.right = !p.panels.right; })}>
          <PanelRight class="flip-rtl" />
        </button>
        <button class="icon-btn" title={t("ribbon-settings")} aria-label={t("ribbon-settings")} aria-haspopup="dialog" onClick={() => setOverlay("settings")}><Settings /></button>
      </div>
    </nav>
  );
}
