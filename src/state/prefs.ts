// Typed view over `AppConfig.prefs`: editor, files, daily notes, startup and
// hotkey preferences. Missing or invalid values fall back to the defaults, so
// an older or hand-edited config can't break the UI.
import { settings, updateSettings } from "./settings";
import { resolveUiFontStack } from "../core/fonts";

export type StartupScreen = "last" | "empty" | "daily" | "dashboard";
export type DefaultMode = "editor" | "split" | "reader" | "mindmap" | "kanban";

export interface Prefs {
  startup: StartupScreen;
  editorDefaultMode: DefaultMode;
  readableLine: boolean;
  lineNumbers: boolean;
  autopair: boolean;
  tabSize: number;
  spellcheck: boolean;
  strictBreaks: boolean;
  fontSize: number;
  /** Editor typeface: "" uses the interface font; otherwise a stored font value. */
  editorFont: string;
  lineHeight: number;
  newNoteFolder: string;
  confirmDelete: boolean;
  dailyFolder: string;
  dailyFormat: string;
  dailyTemplate: string;
  dailyOnStartup: boolean;
  formatBar: boolean;
  showProperties: boolean;
  propsInReader: boolean;
  scrollSync: boolean;
  foldHeadings: boolean;
  autopairMarkdown: boolean;
  smartLists: boolean;
  autoUpdateLinks: boolean;
  useWikilinks: boolean;
  historyAuto: boolean;
  /** Allow the terminal to run real shell commands (Advanced; off by default). */
  systemShell: boolean;
  petFloating: boolean;
  /** The companion says short lines on its own and reacts to events. */
  petTalk: boolean;
  /** Add the day's tasks to its daily note when it opens. */
  dailyTasks: boolean;
  terminalShell: string;
  /** Command id → shortcut ("Mod+K"); "" means unbound. Only overrides are stored. */
  hotkeys: Record<string, string>;
  /** Short click sounds on important buttons. */
  uiSounds: boolean;
  /** How a bare link to another note shows in reading view: its name, or a preview card. */
  linkStyle: "name" | "card";
  /** Where pasted or dropped attachments are stored ("" = vault root). */
  attachmentFolder: string;
  /** Files from outside the vault: copy them in, move them in, or keep a link to where they are. */
  attachmentMode: "copy" | "move" | "link";
  /** Folders read as the book and the film/series shelves. */
  mediaBooksFolder: string;
  mediaMoviesFolder: string;
}

export const DEFAULT_PREFS: Prefs = {
  startup: "last",
  editorDefaultMode: "split",
  readableLine: true,
  lineNumbers: false,
  autopair: true,
  tabSize: 4,
  spellcheck: false,
  strictBreaks: false,
  fontSize: 15,
  editorFont: "",
  lineHeight: 1.8,
  newNoteFolder: "",
  confirmDelete: true,
  dailyFolder: "Daily",
  dailyFormat: "YYYY-MM-DD",
  dailyTemplate: "",
  dailyOnStartup: false,
  formatBar: true,
  showProperties: true,
  propsInReader: true,
  scrollSync: true,
  foldHeadings: true,
  autopairMarkdown: true,
  smartLists: true,
  autoUpdateLinks: true,
  useWikilinks: true,
  historyAuto: true,
  systemShell: false,
  petFloating: true,
  petTalk: true,
  dailyTasks: true,
  terminalShell: "powershell",
  hotkeys: {},
  uiSounds: true,
  linkStyle: "name",
  attachmentFolder: "",
  attachmentMode: "copy",
  mediaBooksFolder: "Books",
  mediaMoviesFolder: "Movies",
};

const LIMITS: Partial<Record<keyof Prefs, [number, number]>> = {
  tabSize: [2, 8],
  fontSize: [11, 26],
  lineHeight: [1.2, 2.4],
};

const ENUMS: Partial<Record<keyof Prefs, readonly string[]>> = {
  startup: ["last", "empty", "daily"],
  editorDefaultMode: ["editor", "split", "reader", "mindmap", "kanban"],
  terminalShell: ["powershell", "cmd", "bash", "sh"],
  linkStyle: ["name", "card"],
  attachmentMode: ["copy", "move", "link"],
};

/** Validate one stored value against the default's type and limits. */
export function sanitizePref<K extends keyof Prefs>(key: K, value: unknown): Prefs[K] {
  const d = DEFAULT_PREFS[key];
  if (typeof d === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return d;
    const [lo, hi] = LIMITS[key] ?? [-Infinity, Infinity];
    return Math.min(hi, Math.max(lo, n)) as Prefs[K];
  }
  if (typeof d === "boolean") return (typeof value === "boolean" ? value : d) as Prefs[K];
  if (typeof d === "string") {
    if (typeof value !== "string") return d;
    const allowed = ENUMS[key];
    return (allowed && !allowed.includes(value) ? d : value) as Prefs[K];
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
    return out as Prefs[K];
  }
  return d;
}

export function pref<K extends keyof Prefs>(key: K): Prefs[K] {
  return sanitizePref(key, settings.prefs?.[key]);
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  updateSettings((c) => {
    if (!c.prefs) c.prefs = {};
    c.prefs[key] = value;
  });
}

export function resetPref(key: keyof Prefs): void {
  updateSettings((c) => { if (c.prefs) delete c.prefs[key]; });
}

/** Editor typography preferences as CSS variables on <html>. */
export function applyPrefsToDocument(root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--editor-font-size", `${pref("fontSize")}px`);
  root.style.setProperty("--font-editor", pref("editorFont") ? resolveUiFontStack(pref("editorFont")) : "var(--font-ui)");
  root.style.setProperty("--editor-line-height", String(pref("lineHeight")));
  root.style.setProperty("--editor-max-width", pref("readableLine") ? "760px" : "none");
}
