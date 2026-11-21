// Mirrors the Rust types in crates/nosidian-core (serde camelCase / kebab-case).
import type { LanguageCode } from "../i18n/languages";

export type ThemeId =
  | "obsidian-slate" | "midnight-carbon" | "nord-arctic"
  | "catppuccin-mocha" | "paper-daylight" | "warm-parchment";
export const THEMES: ThemeId[] = [
  "obsidian-slate", "midnight-carbon", "nord-arctic",
  "catppuccin-mocha", "paper-daylight", "warm-parchment",
];

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type UseCase = "study-languages" | "writing" | "projects-coding" | "general";
export type RadiusScale = "sharp" | "balanced" | "soft";
export type Density = "compact" | "comfortable";

export type ModuleId =
  | "dashboard" | "flashcards" | "media-shelf" | "knowledge-graph" | "mindmap"
  | "kanban" | "slides" | "daily-calendar" | "recent-files" | "pdf-support"
  | "zen-focus" | "ambient-effects" | "companion-pet" | "project-mode"
  | "dependency-graph" | "integrated-terminal" | "mcp-bridge"
  | "developer-extensions" | "advanced-ribbon-tools";

export interface Appearance {
  theme: ThemeId;
  accent: string;
  glassBlur: number;
  glassOpacity: number;
  ambientMesh: boolean;
  radius: RadiusScale;
  density: Density;
}

export interface Accessibility {
  screenReaderMode: boolean;
  reduceMotion: boolean;
  speechCues: boolean;
  soundCues: boolean;
  speechRate: number;
}

export interface VaultRef { path: string; name: string; lastOpened: number }

export interface AppConfig {
  schemaVersion: number;
  language: LanguageCode | null;
  onboarding: { completed: boolean; step: number };
  experienceLevel: ExperienceLevel;
  useCase: UseCase;
  appearance: Appearance;
  accessibility: Accessibility;
  petEnabled: boolean;
  ambientEffectsEnabled: boolean;
  moduleOverrides: Partial<Record<ModuleId, boolean>>;
  activeVault: string | null;
  recentVaults: VaultRef[];
}

export interface VaultMeta { id: string; name: string; createdAt: number; formatVersion: number }
export interface Vault { root: string; meta: VaultMeta }

/** Error shape returned by every Rust command. `code` maps to `error-<code>`. */
export interface CommandError { code: string; detail: string }

export function defaultConfig(): AppConfig {
  return {
    schemaVersion: 1,
    language: null,
    onboarding: { completed: false, step: 0 },
    experienceLevel: "intermediate",
    useCase: "general",
    appearance: {
      theme: "obsidian-slate",
      accent: "#8b7cf6",
      glassBlur: 18,
      glassOpacity: 0.62,
      ambientMesh: true,
      radius: "balanced",
      density: "comfortable",
    },
    accessibility: { screenReaderMode: false, reduceMotion: false, speechCues: false, soundCues: false, speechRate: 1 },
    petEnabled: true,
    ambientEffectsEnabled: true,
    moduleOverrides: {},
    activeVault: null,
    recentVaults: [],
  };
}

// ---------- Vault contents (mirrors crates/nosidian-core/src/notes.rs) ----------
export type EntryKind = "markdown" | "pdf";
export interface NoteMeta { path: string; kind: EntryKind; size: number; modified: number; created: number }
export interface VaultTree { notes: NoteMeta[]; folders: string[] }

export type ViewMode = "editor" | "split" | "reader" | "mindmap" | "kanban";
export type LeftTab = "files" | "recent" | "search" | "tags" | "starred" | "calendar";
export type RightTab = "links" | "outline" | "focus" | "history" | "srs";
export type SortMode = "name-asc" | "name-desc" | "modified-new" | "modified-old" | "created-new" | "created-old";
export type FocusProfile = "clean-minimal" | "deep-writing" | "review-quiz" | "full-studio";

export interface WorkspaceProfile {
  focusProfile: FocusProfile;
  viewMode: ViewMode;
  panels: { ribbon: boolean; left: boolean; right: boolean; statusBar: boolean };
  leftTab: LeftTab;
  rightTab: RightTab;
  leftWidth: number;
  rightWidth: number;
  uiButtons: Record<string, boolean>;
  openTabs: string[];
  activeTab: string | null;
  starred: string[];
  recent: { path: string; openedAt: number }[];
  collapsedFolders: string[];
  sort: SortMode;
  noteModes: Record<string, ViewMode>;
  banner: BannerConfig;
}

/** `image` is a preset id or `asset:<file name>` for an uploaded image. */
export interface BannerConfig { enabled: boolean; image: string; height: number; posY: number; opacity: number }
export const BANNER_PRESETS = ["carbon", "language", "writer", "observatory"] as const;
export type BannerPreset = (typeof BANNER_PRESETS)[number];

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 560;
export const LEFT_DEFAULT = 280;
export const RIGHT_DEFAULT = 300;

export function defaultProfile(): WorkspaceProfile {
  return {
    focusProfile: "full-studio",
    viewMode: "split",
    panels: { ribbon: true, left: true, right: true, statusBar: true },
    leftTab: "files",
    rightTab: "links",
    leftWidth: LEFT_DEFAULT,
    rightWidth: RIGHT_DEFAULT,
    uiButtons: {},
    openTabs: [],
    activeTab: null,
    starred: [],
    recent: [],
    collapsedFolders: [],
    sort: "name-asc",
    noteModes: {},
    banner: { enabled: false, image: "carbon", height: 96, posY: 50, opacity: 90 },
  };
}
