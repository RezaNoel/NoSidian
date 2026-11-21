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
    accessibility: { screenReaderMode: false, reduceMotion: false, speechCues: false, soundCues: false },
    petEnabled: true,
    ambientEffectsEnabled: true,
    moduleOverrides: {},
    activeVault: null,
    recentVaults: [],
  };
}
