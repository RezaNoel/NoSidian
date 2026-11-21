// Thin bridge to the Rust commands. Outside Tauri (plain browser dev server
// or tests) it falls back to localStorage so the UI can be developed alone.
import { defaultConfig, type AppConfig, type CommandError } from "./types";

export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const LS_KEY = "nosidian.config";

function mergeDefaults(partial: Partial<AppConfig>): AppConfig {
  const d = defaultConfig();
  return {
    ...d,
    ...partial,
    onboarding: { ...d.onboarding, ...partial.onboarding },
    appearance: { ...d.appearance, ...partial.appearance },
    accessibility: { ...d.accessibility, ...partial.accessibility },
  };
}

export async function loadConfig(): Promise<AppConfig> {
  if (inTauri()) return invoke<AppConfig>("get_config");
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? mergeDefaults(JSON.parse(raw)) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  if (inTauri()) return invoke<AppConfig>("save_config", { config });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable: keep in memory only */
  }
  return config;
}

export function isCommandError(e: unknown): e is CommandError {
  return typeof e === "object" && e !== null && "code" in e && "detail" in e;
}
