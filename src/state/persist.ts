// JSON documents kept in the vault's `.nosidian/` folder (or the app config
// folder) as reactive stores: loaded when the vault opens, saved debounced.
import { createRoot, createSignal } from "solid-js";
import { createStore, produce, reconcile, type SetStoreFunction } from "solid-js/store";
import { backend } from "../backend";
import { onFlush } from "./flush";

export interface Persisted<T extends object> {
  state: T;
  /** True once the stored document has been read. */
  ready: () => boolean;
  update(fn: (s: T) => void): void;
  replace(next: T): void;
  load(): Promise<void>;
}

const vaultStores: Persisted<object>[] = [];

function make<T extends object>(name: string, defaults: () => T, scope: "vault" | "app"): Persisted<T> {
  return createRoot(() => {
    const [state, setState] = createStore<T>(defaults()) as [T, SetStoreFunction<T>];
    const [ready, setReady] = createSignal(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    let readOnly = false;
    // Changes made before the stored document was read. They are applied
    // again on top of what was read, so they neither get lost nor overwrite
    // the saved document with defaults.
    let early: ((s: T) => void)[] = [];
    const read = scope === "vault" ? backend.storeRead.bind(backend) : backend.appStoreRead.bind(backend);
    const write = scope === "vault" ? backend.storeWrite.bind(backend) : backend.appStoreWrite.bind(backend);
    const flush = async () => {
      clearTimeout(timer);
      timer = undefined;
      if (!dirty || !ready() || readOnly) return;
      dirty = false;
      try { await write(name, JSON.parse(JSON.stringify(state))); } catch { dirty = true; }
    };
    const save = () => {
      dirty = true;
      if (!ready()) return;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 400);
    };
    onFlush(flush);
    const api: Persisted<T> = {
      state,
      ready,
      async load() {
        // Anything still pending belongs to the previous vault and was written by flushAll() before the switch.
        clearTimeout(timer);
        timer = undefined;
        dirty = false;
        setReady(false);
        // A failed read must never be mistaken for "nothing saved yet": that
        // would let the next change write defaults over the real document.
        let stored: Partial<T> | null = null;
        let failed = true;
        for (let i = 0; i < 4 && failed; i++) {
          try { stored = await read<Partial<T>>(name); failed = false; } catch { await new Promise((r) => setTimeout(r, 250 * (i + 1))); }
        }
        readOnly = failed;
        setState(reconcile({ ...defaults(), ...(stored && typeof stored === "object" ? stored : {}) } as T));
        const pending = early;
        early = [];
        for (const fn of pending) setState(produce(fn));
        setReady(true);
        if (pending.length) save();
      },
      update(fn) {
        setState(produce(fn));
        if (!ready()) early.push(fn);
        save();
      },
      replace(next) {
        setState(reconcile(next));
        if (!ready()) early = [(s) => { Object.assign(s, JSON.parse(JSON.stringify(next))); }];
        save();
      },
    };
    return api;
  });
}

/** A document in `<vault>/.nosidian/<name>.json`, reloaded whenever a vault opens. */
export function vaultDoc<T extends object>(name: string, defaults: () => T): Persisted<T> {
  const p = make(name, defaults, "vault");
  vaultStores.push(p as Persisted<object>);
  return p;
}

/** A document in the app config folder, shared by every vault. */
export function appDoc<T extends object>(name: string, defaults: () => T): Persisted<T> {
  const p = make(name, defaults, "app");
  void p.load();
  return p;
}

export async function loadVaultDocs(): Promise<void> {
  await Promise.all(vaultStores.map((s) => s.load()));
}
