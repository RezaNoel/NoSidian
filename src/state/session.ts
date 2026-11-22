// Opening, creating and switching vaults. Rust records the active vault in the
// app config; the settings store is updated the same way so a later debounced
// save of settings doesn't overwrite it with stale data.
import { backend } from "../backend";
import { flushAll } from "./flush";
import { enterVault, leaveVault, reportError } from "./vault";
import { applyStartup } from "./daily";
import { settings, updateSettings } from "./settings";
import type { Vault } from "./types";

const MAX_RECENT_VAULTS = 12;

async function activate(next: Vault): Promise<Vault> {
  updateSettings((c) => {
    c.activeVault = next.root;
    const rest = c.recentVaults.filter((r) => r.path !== next.root);
    c.recentVaults = [{ path: next.root, name: next.meta.name, lastOpened: Date.now() }, ...rest].slice(0, MAX_RECENT_VAULTS);
  });
  await enterVault(next);
  return next;
}

async function guarded(op: () => Promise<Vault>): Promise<Vault | null> {
  // Write the open vault's pending changes before Rust switches to another one.
  await flushAll();
  try {
    return await activate(await op());
  } catch (e) {
    reportError(e);
    return null;
  }
}

export const openSampleVault = () => guarded(() => backend.openSampleVault());
export const createVault = (parent: string, name: string) => guarded(() => backend.createVault(parent, name));
export const openVaultAt = (path: string) => guarded(() => backend.openVault(path));

export async function pickAndOpenVault(): Promise<Vault | null> {
  const path = await backend.pickFolder();
  return path ? openVaultAt(path) : null;
}

/** On startup: reopen the last active vault. Returns false if there is none or it's gone. */
export async function restoreVault(): Promise<boolean> {
  const path = settings.activeVault;
  if (!path) return false;
  try {
    await activate(await backend.openVault(path));
    await applyStartup().catch(reportError);
    return true;
  } catch {
    return false;
  }
}

/** Close the open vault and go back to the vault picker. */
export async function closeVault(): Promise<void> {
  await flushAll();
  leaveVault();
  updateSettings((c) => { c.activeVault = null; });
  window.dispatchEvent(new CustomEvent("nosidian:vault-closed"));
}
