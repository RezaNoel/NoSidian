// The start page: shown when no note is open and in the "+" tab. Logo with the
// companion running around it, clock and date, shortcuts and recent files.
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Brain, CalendarDays, Command, FilePlus, FileSearch, FileText, Film, FolderKanban, LayoutDashboard, Network, Timer, Users } from "lucide-solid";
import { pref } from "../state/prefs";
import { locale, t, type MessageKey } from "../i18n";
import { noteTitle } from "../lib/markdown";
import { relativeTime } from "../lib/tree";
import { enabledModules } from "../state/modules";
import { settings } from "../state/settings";
import { openNote, tree } from "../state/vault";
import { profile } from "../state/workspace";
import { setOverlay } from "../state/ui";
import { openDailyNote } from "../state/daily";
import { openView } from "../state/views";
import { pet } from "../state/pet";
import { greeting } from "../state/personal";
import { promptNewNote } from "./FileTree";
import { Logo } from "./Logo";
import { XmasFriends } from "./Christmas";
import { PetViewport } from "./pet/PetViewport";
import type { ModuleId } from "../state/types";
import { noteItemMenu, recentExtras } from "./itemMenus";

interface Shortcut { id?: string; key: MessageKey; icon: typeof Brain; module?: ModuleId; combo?: string; run: () => void }

/** The main action: the dashboard, or a new note when the dashboard is off. */
const PRIMARY: Shortcut[] = [
  { key: "start-open-dashboard", icon: LayoutDashboard, module: "dashboard", run: () => void openView("dashboard") },
  { key: "action-new-note", icon: FilePlus, combo: "Ctrl+N", run: () => void promptNewNote() },
];

/** Buttons that can sit under it; Settings > Appearance picks which and in what order. */
export const START_BUTTONS: Shortcut[] = [
  { id: "new-note", key: "action-new-note", icon: FilePlus, combo: "Ctrl+N", run: () => void promptNewNote() },
  { id: "daily", key: "ribbon-daily-note", icon: CalendarDays, module: "daily-calendar", combo: "Alt+D", run: () => void openDailyNote(new Date()) },
  { id: "switcher", key: "ribbon-quick-switcher", icon: FileSearch, combo: "Ctrl+O", run: () => setOverlay("switcher") },
  { id: "palette", key: "ribbon-command-palette", icon: Command, combo: "Ctrl+K", run: () => setOverlay("palette") },
  { id: "flashcards", key: "ribbon-flashcards", icon: Brain, module: "flashcards", run: () => void openView("flashcards") },
  { id: "focus", key: "ribbon-focus", icon: Timer, module: "zen-focus", run: () => void openView("zen") },
  { id: "media", key: "ribbon-media", icon: Film, module: "media-shelf", run: () => void openView("media") },
  { id: "people", key: "ribbon-people", icon: Users, module: "people", run: () => void openView("people") },
  { id: "graph", key: "ribbon-graph", icon: Network, module: "knowledge-graph", run: () => void openView("graph") },
  { id: "projects", key: "ribbon-projects", icon: FolderKanban, module: "project-mode", run: () => void openView("projects") },
];
export const startButtonIds = () => pref("startButtons").split(",").map((x) => x.trim()).filter((x) => START_BUTTONS.some((b) => b.id === x));

export function StartPage() {
  const [now, setNow] = createSignal(new Date());
  const tick = setInterval(() => setNow(new Date()), 1000);
  onCleanup(() => clearInterval(tick));
  const mods = createMemo(() => enabledModules(settings.experienceLevel, settings.moduleOverrides));
  const allowed = (s: Shortcut) => !s.module || mods().has(s.module);
  const primary = createMemo(() => PRIMARY.find(allowed)!);
  const suggestions = createMemo(() => startButtonIds().map((id) => START_BUTTONS.find((b) => b.id === id)!).filter((s) => allowed(s) && s.key !== primary().key));
  const recent = createMemo(() => {
    const exists = new Set(tree.notes.map((n) => n.path));
    return profile.recent.filter((r) => exists.has(r.path)).slice(0, 5);
  });
  const time = () => now().toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
  const date = () => now().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const showPet = () => mods().has("companion-pet") && settings.petEnabled && pet.ready();

  return (
    <div class="start-wrap">
    <div class="start-page">
      <div class="start-hero">
        <div class="start-orbit" classList={{ "with-pet": showPet() }}>
          <Logo size={88} class="start-logo" />
          <Show when={showPet()}>
            <div class="start-pet" aria-hidden="true">
              <PetViewport species={pet.state.species} activity="idle" accessories={pet.state.equippedAccessories} customModelId={pet.state.customModelId} variant="mini" label={pet.state.name} />
            </div>
          </Show>
        </div>
        <div class="start-clock">
          <time class="start-time" dir="ltr">{time()}</time>
          <span class="start-date">{date()}</span>
        </div>
        <p class="start-greeting" dir="auto">{greeting(now())}</p>
        <XmasFriends />
      </div>

      <nav class="start-actions" aria-label={t("start-shortcuts")}>
        <button class="start-primary" onClick={primary().run}>
          <Dynamic component={primary().icon} aria-hidden="true" />
          <span>{t(primary().key)}</span>
          <Show when={primary().combo}><kbd dir="ltr">{primary().combo}</kbd></Show>
        </button>
        <div class="start-suggest">
          <For each={suggestions()}>
            {(s) => (
              <button class="start-chip" onClick={s.run} title={s.combo ? `${t(s.key)} (${s.combo})` : t(s.key)}>
                <s.icon aria-hidden="true" />
                <span>{t(s.key)}</span>
              </button>
            )}
          </For>
        </div>
      </nav>

      <Show when={recent().length}>
        <section class="start-recent" aria-labelledby="start-recent-h">
          <h2 id="start-recent-h" class="section-title">{t("tab-recent")}</h2>
          <ul>
            <For each={recent()}>
              {(r) => (
                <li>
                  <button class="start-file" onClick={() => openNote(r.path)} onContextMenu={(e) => noteItemMenu(e, r.path, recentExtras(r.path))}>
                    <FileText aria-hidden="true" />
                    <span class="start-file-name" dir="auto">{noteTitle(r.path)}</span>
                    <span class="start-file-time">{relativeTime(r.openedAt, locale())}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
    </div>
  );
}
