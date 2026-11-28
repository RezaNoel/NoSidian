// Per-vault workspace profile (tabs, stars, sidebar widths...) with debounced saving.
import { createRoot } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { backend } from "../backend";
import { onFlush } from "./flush";
import { defaultProfile, SIDEBAR_MAX, SIDEBAR_MIN, type WorkspaceProfile } from "./types";

const ws = createRoot(() => {
  const [profile, setProfile] = createStore<WorkspaceProfile>(defaultProfile());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ready = false;
  let dirty = false;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || !ready) return;
    dirty = false;
    await backend.saveProfile(JSON.parse(JSON.stringify(profile))).catch(() => { dirty = true; });
  };
  onFlush(flush);
  return {
    profile,
    async load() {
      clearTimeout(timer);
      dirty = false;
      ready = false;
      setProfile(reconcile(await backend.loadProfile()));
      ready = true;
    },
    update(fn: (p: WorkspaceProfile) => void) {
      setProfile(produce(fn));
      if (!ready) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 400);
    },
  };
});

export const profile = ws.profile;
export const loadProfile = ws.load;
export const updateProfile = ws.update;

export const clampWidth = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));
