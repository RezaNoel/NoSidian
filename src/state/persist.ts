// JSON documents kept in the vault's `.nosidian/` folder (or the app config
// folder) as reactive stores: loaded when the vault opens, saved debounced.
import { createRoot, createSignal } from "solid-js";
import { createStore, produce, reconcile, type SetStoreFunction } from "solid-js/store";
import { backend } from "../backend";

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
    const read = scope === "vault" ? backend.storeRead.bind(backend) : backend.appStoreRead.bind(backend);
    const write = scope === "vault" ? backend.storeWrite.bind(backend) : backend.appStoreWrite.bind(backend);
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void write(name, JSON.parse(JSON.stringify(state))).catch(() => undefined), 400);
    };
    const api: Persisted<T> = {
      state,
      ready,
      async load() {
        setReady(false);
        const stored = await read<Partial<T>>(name).catch(() => null);
        setState(reconcile({ ...defaults(), ...(stored && typeof stored === "object" ? stored : {}) } as T));
        setReady(true);
      },
      update(fn) {
        setState(produce(fn));
        save();
      },
      replace(next) {
        setState(reconcile(next));
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
