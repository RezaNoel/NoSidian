// Command registry shared by the command palette, the hotkeys settings tab and
// the global keyboard handler. Shortcuts are stored as "Mod+Shift+K", where
// Mod is Ctrl on Windows/Linux and Cmd on macOS.
import { t, type MessageKey } from "../i18n";
import { announce } from "../a11y/announcer";
import { backend } from "../backend";
import { THEMES } from "./types";
import { pref, setPref } from "./prefs";
import { settings, updateSettings } from "./settings";
import { profile, updateProfile } from "./workspace";
import { setOverlay, toast } from "./ui";
import { activePath, closeTab, createFolder, bumpIndex, createNote, openNote, toggleStar } from "./vault";
import { openDailyNote } from "./daily";

export interface Command {
  id: string;
  label: MessageKey;
  defaultKey?: string;
  /** Hidden from the palette when false (e.g. needs an open note). */
  when?: () => boolean;
  run: () => unknown;
}

const hasNote = () => !!activePath();

function cycleTab(step: number) {
  const tabs = profile.openTabs;
  if (tabs.length < 2) return;
  const i = tabs.indexOf(activePath() ?? "");
  openNote(tabs[(i + step + tabs.length) % tabs.length]);
}

function setMode(mode: "editor" | "split" | "reader") {
  const path = activePath();
  if (path) updateProfile((p) => { p.noteModes[path] = mode; });
}

function focusFiles() {
  updateProfile((p) => { p.panels.left = true; p.leftTab = "files"; });
  requestAnimationFrame(() => (document.querySelector<HTMLElement>('[role=tree] [tabindex="0"]') ?? document.querySelector<HTMLElement>("[role=tree]"))?.focus());
}

// Late-bound so this module doesn't import components (which import it).
let promptNote: (folder?: string) => Promise<void> = async () => { await createNote(t("untitled-note")); };
let promptFolder: () => Promise<void> = async () => { await createFolder(t("untitled-note")); };
export function bindPrompts(note: typeof promptNote, folder: typeof promptFolder): void {
  promptNote = note;
  promptFolder = folder;
}

export const COMMANDS: Command[] = [
  { id: "quick-switcher", label: "ribbon-quick-switcher", defaultKey: "Mod+O", run: () => setOverlay("switcher") },
  { id: "command-palette", label: "ribbon-command-palette", defaultKey: "Mod+K", run: () => setOverlay("palette") },
  { id: "new-note", label: "action-new-note", defaultKey: "Mod+N", run: () => promptNote() },
  { id: "new-folder", label: "action-new-folder", defaultKey: "Mod+Shift+N", run: () => promptFolder() },
  { id: "daily-note", label: "ribbon-daily-note", defaultKey: "Alt+D", run: () => openDailyNote(new Date()) },
  { id: "search", label: "ribbon-search", defaultKey: "Mod+Shift+F", run: () => {
    updateProfile((p) => { p.panels.left = true; p.leftTab = "search"; });
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#search-input")?.focus());
  } },
  { id: "focus-files", label: "cmd-focus-files", defaultKey: "Mod+Shift+E", run: focusFiles },
  { id: "settings", label: "footer-settings", defaultKey: "Mod+,", run: () => setOverlay("settings") },
  { id: "vaults", label: "vault-switcher-title", run: () => setOverlay("vaults") },
  { id: "toggle-left", label: "ribbon-toggle-left", defaultKey: "Mod+Alt+[", run: () => updateProfile((p) => { p.panels.left = !p.panels.left; }) },
  { id: "toggle-right", label: "ribbon-toggle-right", defaultKey: "Mod+Alt+]", run: () => updateProfile((p) => { p.panels.right = !p.panels.right; }) },
  { id: "close-tab", label: "action-close-tab", defaultKey: "Mod+W", when: hasNote, run: () => closeTab(activePath()!) },
  { id: "next-tab", label: "cmd-next-tab", defaultKey: "Ctrl+Tab", when: hasNote, run: () => cycleTab(1) },
  { id: "prev-tab", label: "cmd-prev-tab", defaultKey: "Ctrl+Shift+Tab", when: hasNote, run: () => cycleTab(-1) },
  { id: "mode-editor", label: "mode-editor", defaultKey: "Mod+1", when: hasNote, run: () => setMode("editor") },
  { id: "mode-split", label: "mode-split", defaultKey: "Mod+2", when: hasNote, run: () => setMode("split") },
  { id: "mode-reader", label: "mode-reader", defaultKey: "Mod+3", when: hasNote, run: () => setMode("reader") },
  { id: "star", label: "action-star", when: hasNote, run: () => toggleStar(activePath()!) },
  { id: "next-theme", label: "cmd-next-theme", run: () => {
    const i = THEMES.indexOf(settings.appearance.theme);
    const next = THEMES[(i + 1) % THEMES.length];
    updateSettings((c) => { c.appearance.theme = next; });
    announce(t("announce-theme-changed", { theme: t(`theme-${next}`) }));
  } },
  { id: "rebuild-index", label: "cmd-rebuild-index", run: async () => {
    const n = await backend.rebuildIndex();
    bumpIndex();
    toast(t("index-rebuilt", { count: n }));
  } },
];

export const commandById = (id: string) => COMMANDS.find((c) => c.id === id);

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcut currently bound to a command ("" when unbound). */
export function keyFor(id: string): string {
  const custom = pref("hotkeys")[id];
  return custom !== undefined ? custom : (commandById(id)?.defaultKey ?? "");
}

export function setKey(id: string, combo: string): void {
  const map = { ...pref("hotkeys") };
  if (combo === (commandById(id)?.defaultKey ?? "")) delete map[id];
  else map[id] = combo;
  setPref("hotkeys", map);
}

/** Command that already uses `combo`, other than `except`. */
export function conflictFor(combo: string, except: string): Command | undefined {
  if (!combo) return undefined;
  return COMMANDS.find((c) => c.id !== except && keyFor(c.id) === combo);
}

const NAMED: Record<string, string> = { " ": "Space", Escape: "Esc", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };

/** Normalize a keydown into a combo string, or "" for a bare modifier. */
export function comboOf(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMac()): string {
  if (["Control", "Meta", "Alt", "Shift", "AltGraph"].includes(e.key)) return "";
  const parts: string[] = [];
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod) parts.push("Mod");
  if (mac && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  // Use the physical key for letters and digits so layouts like Persian still match.
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === "BracketLeft") key = "[";
  else if (e.code === "BracketRight") key = "]";
  else if (e.code === "Comma") key = ",";
  else if (e.code === "Period") key = ".";
  else if (e.code === "Slash") key = "/";
  else key = NAMED[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join("+");
}

/** Display form: "Ctrl+Shift+K" on Windows, "⌘⇧K" on macOS. */
export function formatCombo(combo: string, mac = isMac()): string {
  if (!combo) return "";
  if (!mac) return combo.replace(/\bMod\b/g, "Ctrl");
  return combo.replace("Mod+", "⌘").replace("Ctrl+", "⌃").replace("Alt+", "⌥").replace("Shift+", "⇧");
}

let recording = false;
/** While the hotkeys tab records a shortcut, global handling pauses. */
export function setRecording(on: boolean): void {
  recording = on;
}

export function handleGlobalKey(e: KeyboardEvent): boolean {
  if (recording || e.defaultPrevented || e.isComposing) return false;
  const combo = comboOf(e);
  if (!combo || (!combo.includes("+") && !/^F\d+$/.test(combo))) return false;
  const cmd = COMMANDS.find((c) => keyFor(c.id) === combo);
  if (!cmd || (cmd.when && !cmd.when())) return false;
  e.preventDefault();
  e.stopPropagation();
  void cmd.run();
  return true;
}

export function installHotkeys(): () => void {
  const on = (e: KeyboardEvent) => void handleGlobalKey(e);
  window.addEventListener("keydown", on, true);
  return () => window.removeEventListener("keydown", on, true);
}
