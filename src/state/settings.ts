// Global reactive settings store. Every change is applied to the document
// immediately and saved (debounced) through the backend.
import { createRoot, createEffect } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { setLocale } from "../i18n";
import { detectLanguage } from "../i18n/languages";
import { loadConfig, saveConfig } from "./backend";
import { defaultConfig, type AppConfig } from "./types";

const SAVE_DELAY_MS = 300;

const store = createRoot(() => {
  const [config, setConfig] = createStore<AppConfig>(defaultConfig());
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Plain copy: the store proxy can't cross the IPC boundary.
      void saveConfig(JSON.parse(JSON.stringify(config)));
    }, SAVE_DELAY_MS);
  };

  createEffect(() => applyToDocument(config));

  return {
    config,
    async init() {
      const loadedCfg = await loadConfig();
      setConfig(reconcile(loadedCfg));
      setLocale(loadedCfg.language ?? detectLanguage());
      loaded = true;
    },
    update(fn: (draft: AppConfig) => void) {
      setConfig(produce(fn));
      if (config.language) setLocale(config.language);
      if (loaded) persist();
    },
    reset() {
      const keep = { language: config.language, onboarding: config.onboarding, activeVault: config.activeVault, recentVaults: config.recentVaults };
      setConfig(reconcile({ ...defaultConfig(), ...keep }));
      if (loaded) persist();
    },
  };
});

export const settings = store.config;
export const initSettings = store.init;
export const updateSettings = store.update;
export const resetSettings = store.reset;

/** Push appearance and accessibility settings onto <html> as data attributes and CSS variables. */
export function applyToDocument(cfg: AppConfig, root: HTMLElement = document.documentElement): void {
  const a = cfg.appearance;
  const acc = cfg.accessibility;
  root.dataset.theme = a.theme;
  root.dataset.radius = a.radius;
  root.dataset.density = a.density;
  root.dataset.mesh = String(a.ambientMesh && !acc.reduceMotion);
  root.dataset.a11y = String(acc.screenReaderMode);
  root.dataset.reduceMotion = String(acc.reduceMotion || acc.screenReaderMode);
  root.style.setProperty("--accent", a.accent);
  root.style.setProperty("--glass-blur", `${a.glassBlur}px`);
  root.style.setProperty("--glass-opacity", String(a.glassOpacity));
}
