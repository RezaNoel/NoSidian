// Narrow vertical tool ribbon on desktop. Tools from later phases show only
// when their module is enabled for the user's experience level.
import { For, Show, createMemo } from "solid-js";
import { hasTitleBar } from "./TitleBar";
import { Brain, CalendarDays, Command, FileSearch, Film, FolderKanban, Kanban, LayoutDashboard, Network, PanelLeft, PanelRight, PawPrint, Presentation, Search, Terminal, Timer, Workflow } from "lucide-solid";
import { t, type MessageKey } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { profile, updateProfile } from "../state/workspace";
import { setOverlay, toast } from "../state/ui";
import { openDailyNote } from "../state/daily";
import { openView } from "../state/views";
import { activePath } from "../state/vault";
import { setSlidesFor } from "../state/ui";
import { Logo } from "./Logo";
import type { ModuleId } from "../state/types";

export interface Tool { key: MessageKey; icon: typeof Brain; module?: ModuleId; run?: () => void }

export const later = () => toast(t("select-note-first"));

function noteMode(mode: "mindmap" | "kanban") {
  const p = activePath();
  if (!p || p.startsWith("app:")) return later();
  updateProfile((x) => { x.noteModes[p] = mode; });
}

export const TOOLS: Tool[] = [
  { key: "ribbon-dashboard", icon: LayoutDashboard, module: "dashboard", run: () => void openView("dashboard") },
  { key: "ribbon-search", icon: Search, run: () => updateProfile((p) => { p.leftTab = "search"; p.panels.left = true; }) },
  { key: "ribbon-quick-switcher", icon: FileSearch, run: () => setOverlay("switcher") },
  { key: "ribbon-command-palette", icon: Command, run: () => setOverlay("palette") },
  { key: "ribbon-graph", icon: Network, module: "knowledge-graph", run: () => void openView("graph") },
  { key: "ribbon-flashcards", icon: Brain, module: "flashcards", run: () => void openView("flashcards") },
  { key: "ribbon-projects", icon: FolderKanban, module: "project-mode", run: () => void openView("projects") },
  { key: "ribbon-mindmap", icon: Workflow, module: "mindmap", run: () => noteMode("mindmap") },
  { key: "ribbon-kanban", icon: Kanban, module: "kanban", run: () => noteMode("kanban") },
  { key: "ribbon-slides", icon: Presentation, module: "slides", run: () => { const p = activePath(); if (p && !p.startsWith("app:")) setSlidesFor(p); else later(); } },
  { key: "ribbon-daily-note", icon: CalendarDays, module: "daily-calendar", run: () => void openDailyNote(new Date()) },
  { key: "ribbon-focus", icon: Timer, module: "zen-focus", run: () => void openView("zen") },
  { key: "ribbon-media", icon: Film, module: "media-shelf", run: () => void openView("media") },
  { key: "ribbon-terminal", icon: Terminal, module: "integrated-terminal", run: () => window.dispatchEvent(new CustomEvent("nosidian:terminal")) },
  { key: "pet-studio", icon: PawPrint, module: "companion-pet", run: () => window.dispatchEvent(new CustomEvent("nosidian:pet")) },
];

export function Ribbon() {
  const mods = createMemo(() => enabledModules(settings.experienceLevel, settings.moduleOverrides));
  const tools = createMemo(() => TOOLS.filter((x) => !x.module || mods().has(x.module)));
  return (
    <nav class="ribbon glass" aria-label={t("shell-ribbon-label")}>
      <Logo size={30} class="ribbon-logo" />
      <div class="ribbon-group" role="toolbar" aria-orientation="vertical" aria-label={t("shell-ribbon-label")} onKeyDown={rovingKeydown("button", "vertical")}>
        <Show when={!hasTitleBar()}><button class="icon-btn" tabIndex={0} aria-pressed={profile.panels.left} title={t("ribbon-toggle-left")} aria-label={t("ribbon-toggle-left")} onClick={() => updateProfile((p) => { p.panels.left = !p.panels.left; })}>
          <PanelLeft class="flip-rtl" />
        </button></Show>
        <For each={tools()}>
          {(tool, i) => (
            <button class="icon-btn" tabIndex={i() === 0 && hasTitleBar() ? 0 : -1} title={t(tool.key)} aria-label={t(tool.key)} onClick={tool.run ?? later}>
              <tool.icon />
            </button>
          )}
        </For>
      </div>
      <Show when={!hasTitleBar()}><div class="ribbon-group end">
        <button class="icon-btn" aria-pressed={profile.panels.right} title={t("ribbon-toggle-right")} aria-label={t("ribbon-toggle-right")} onClick={() => updateProfile((p) => { p.panels.right = !p.panels.right; })}>
          <PanelRight class="flip-rtl" />
        </button>
      </div></Show>
    </nav>
  );
}
