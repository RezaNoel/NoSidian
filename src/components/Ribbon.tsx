// Narrow vertical tool ribbon on desktop. Tools show only when their module is
// enabled. Drag a tool to reorder; right-click to choose which tools show.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { themedIcon } from "./Christmas";
import { hasTitleBar } from "./TitleBar";
import { Blocks, Brain, CalendarDays, CloudSun, Settings as SettingsIcon, Command, FileSearch, Film, FolderKanban, LayoutDashboard, Network, PanelLeft, PanelRight, PawPrint, RotateCcw, Terminal, Timer, Users } from "lucide-solid";
import { t, type MessageKey } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { enabledModules } from "../state/modules";
import { settings, updateSettings } from "../state/settings";
import { ambOpen, setAmbOpen } from "./focus/Ambience";
import { openSettings } from "./settings/SettingsWindow";
import { profile, updateProfile } from "../state/workspace";
import { isMobile, setOverlay, toast } from "../state/ui";
import { openDailyNote } from "../state/daily";
import { openView } from "../state/views";
import { openMenu } from "./ContextMenu";
import type { ModuleId } from "../state/types";
import { dev, runPluginById } from "../state/devtools";
import { ENTRY_ICONS } from "./EntryStyle";

export interface Tool { key: MessageKey; icon: typeof Brain; module?: ModuleId; desktopOnly?: boolean; run?: () => void; /** Set for plugin tools, whose names are the user's own. */ label?: string }

/** A tool's name: the user's plugin name, or the translated label. */
export const toolLabel = (tool: Tool) => tool.label ?? t(tool.key);

/** Plugins the user chose to show on the ribbon. */
const pluginTools = (): Tool[] => dev.state.scripts
  .filter((p) => p.enabled && p.ribbon)
  .map((p) => ({ key: `plugin:${p.id}` as MessageKey, label: p.name, icon: (p.icon && ENTRY_ICONS[p.icon]) || Blocks, run: () => void runPluginById(p.id) }));

export const later = () => toast(t("select-note-first"));

export const TOOLS: Tool[] = [
  { key: "ribbon-dashboard", icon: LayoutDashboard, module: "dashboard", run: () => void openView("dashboard") },
  { key: "ribbon-quick-switcher", icon: FileSearch, run: () => setOverlay("switcher") },
  { key: "ribbon-command-palette", icon: Command, run: () => setOverlay("palette") },
  { key: "ribbon-graph", icon: Network, module: "knowledge-graph", run: () => void openView("graph") },
  { key: "ribbon-flashcards", icon: Brain, module: "flashcards", run: () => void openView("flashcards") },
  { key: "ribbon-projects", icon: FolderKanban, module: "project-mode", run: () => void openView("projects") },
  { key: "ribbon-daily-note", icon: CalendarDays, module: "daily-calendar", run: () => void openDailyNote(new Date()) },
  { key: "ribbon-focus", icon: Timer, module: "zen-focus", run: () => void openView("zen") },
  { key: "ribbon-media", icon: Film, module: "media-shelf", run: () => void openView("media") },
  { key: "ribbon-people", icon: Users, module: "people", run: () => void openView("people") },
  { key: "ribbon-terminal", icon: Terminal, module: "integrated-terminal", desktopOnly: true, run: () => window.dispatchEvent(new CustomEvent("nosidian:terminal")) },
  { key: "pet-studio", icon: PawPrint, module: "companion-pet", run: () => window.dispatchEvent(new CustomEvent("nosidian:pet")) },
];

const byOrder = (list: Tool[]) => {
  const order = profile.ribbonOrder;
  // Tools not yet placed keep their built-in order; new plugin buttons go last.
  const rank = (k: string) => { const i = order.indexOf(k); if (i >= 0) return i; const j = TOOLS.findIndex((x) => x.key === k); return order.length + (j < 0 ? TOOLS.length + list.findIndex((x) => x.key === k) : j); };
  return [...list].sort((a, b) => rank(a.key) - rank(b.key));
};

/** Every tool this device can show, in the user's order. */
export const everyTool = (): Tool[] => byOrder([...TOOLS.filter((x) => !(x.desktopOnly && isMobile())), ...pluginTools()]);

/** Tools the user's modules allow, in the user's order. */
export function availableTools(): Tool[] {
  const mods = enabledModules(settings.experienceLevel, settings.moduleOverrides);
  return everyTool().filter((x) => !x.module || mods.has(x.module));
}

export function Ribbon() {
  const all = createMemo(availableTools);
  const tools = createMemo(() => all().filter((x) => !profile.ribbonHidden.includes(x.key)));
  const [dragKey, setDragKey] = createSignal<string | null>(null);
  const [drop, setDrop] = createSignal<{ key: string; after: boolean } | null>(null);

  const move = (from: string, to: string, after: boolean) => {
    if (from === to) return;
    const keys: string[] = all().map((x) => x.key as string).filter((k) => k !== from);
    const i = keys.indexOf(to);
    keys.splice(after ? i + 1 : i, 0, from);
    updateProfile((p) => { p.ribbonOrder = keys; });
  };

  // Every tool is listed, whatever the experience level. Turning on a tool
  // whose feature is off also turns the feature on.
  const menu = (e: MouseEvent) => openMenu(e, [
    ...everyTool().map((tool) => {
      const featureOn = !tool.module || enabledModules(settings.experienceLevel, settings.moduleOverrides).has(tool.module);
      const shown = featureOn && !profile.ribbonHidden.includes(tool.key);
      return {
        label: toolLabel(tool),
        icon: <tool.icon />,
        checked: shown,
        run: () => {
          if (!featureOn && tool.module) {
            const m = tool.module;
            updateSettings((c) => { c.moduleOverrides = { ...c.moduleOverrides, [m]: true }; });
            updateProfile((p) => { p.ribbonHidden = p.ribbonHidden.filter((k) => k !== tool.key); });
          } else updateProfile((p) => {
            p.ribbonHidden = shown ? [...p.ribbonHidden, tool.key] : p.ribbonHidden.filter((k) => k !== tool.key);
          });
        },
      };
    }),
    { label: t("ribbon-menu-reset"), icon: <RotateCcw />, sep: true, run: () => updateProfile((p) => { p.ribbonOrder = []; p.ribbonHidden = []; }) },
  ]);

  return (
    <nav class="ribbon glass" aria-label={t("shell-ribbon-label")} onContextMenu={menu}>
      <div class="ribbon-group" role="toolbar" aria-orientation="vertical" aria-label={t("shell-ribbon-label")} onKeyDown={rovingKeydown("button", "vertical")}>
        <Show when={!hasTitleBar()}><button class="icon-btn" tabIndex={0} aria-pressed={profile.panels.left} title={t("ribbon-toggle-left")} aria-label={t("ribbon-toggle-left")} onClick={() => updateProfile((p) => { p.panels.left = !p.panels.left; })}>
          <PanelLeft class="flip-rtl" />
        </button></Show>
        <For each={tools()}>
          {(tool, i) => (
            <button
              class="icon-btn"
              classList={{ dragging: dragKey() === tool.key, "drop-before": drop()?.key === tool.key && !drop()!.after, "drop-after": drop()?.key === tool.key && drop()!.after }}
              tabIndex={i() === 0 && hasTitleBar() ? 0 : -1}
              title={toolLabel(tool)}
              aria-label={toolLabel(tool)}
              draggable="true"
              onClick={tool.run ?? later}
              onDragStart={(e) => { setDragKey(tool.key); e.dataTransfer?.setData("text/x-nosidian-ribbon", tool.key); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => {
                if (!dragKey()) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDrop({ key: tool.key, after: e.clientY > r.top + r.height / 2 });
              }}
              onDragLeave={() => setDrop(null)}
              onDrop={(e) => { e.preventDefault(); const d = drop(); const k = dragKey(); if (d && k) move(k, d.key, d.after); setDrop(null); setDragKey(null); }}
              onDragEnd={() => { setDrop(null); setDragKey(null); }}
              onKeyDown={(e) => {
                // Alt+Up/Down moves the focused tool, the keyboard twin of dragging.
                if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault(); e.stopPropagation();
                const list = tools(); const j = i() + (e.key === "ArrowUp" ? -1 : 1);
                if (j < 0 || j >= list.length) return;
                move(tool.key, list[j].key, e.key === "ArrowDown");
                queueMicrotask(() => (e.currentTarget as HTMLElement | null)?.focus());
              }}
            >
              <Dynamic component={themedIcon(tool.key, tool.icon)} />
            </button>
          )}
        </For>
      </div>
      <div class="ribbon-group end">
        {/* With the left sidebar closed, its footer buttons move here. */}
        <Show when={!profile.panels.left}>
          <button class="icon-btn amb-toggle" aria-expanded={ambOpen()} aria-haspopup="dialog" title={t("footer-ambient")} aria-label={t("footer-ambient")} onClick={() => setAmbOpen(!ambOpen())}><Dynamic component={themedIcon("ambience", CloudSun)} /></button>
          <button class="icon-btn" aria-haspopup="dialog" title={t("footer-settings")} aria-label={t("footer-settings")} onClick={() => openSettings("home")}><Dynamic component={themedIcon("settings", SettingsIcon)} /></button>
        </Show>
        <Show when={!hasTitleBar()}><button class="icon-btn" aria-pressed={profile.panels.right} title={t("ribbon-toggle-right")} aria-label={t("ribbon-toggle-right")} onClick={() => updateProfile((p) => { p.panels.right = !p.panels.right; })}>
          <PanelRight class="flip-rtl" />
        </button></Show>
      </div>
    </nav>
  );
}
