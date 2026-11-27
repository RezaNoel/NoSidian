// Checks GitHub once per start for a newer desktop release. When one exists, the
// user sees a card with one button that downloads, installs and restarts.
// Desktop only: phones update through their own store or APK file.
import { createSignal } from "solid-js";

const [version, setVersion] = createSignal<string | null>(null);
const [busy, setBusy] = createSignal(false);
const [failed, setFailed] = createSignal(false);
let pending: { version: string; downloadAndInstall: () => Promise<void> } | null = null;

/** The newer version waiting to be installed, or null. */
export const updateVersion = version;
export const updateBusy = busy;
export const updateFailed = failed;

export function desktopUpdates(): boolean {
  try {
    return "__TAURI_INTERNALS__" in window && !/android|iphone|ipad/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

/** Asks GitHub for a newer release. Stays silent when offline or when no release exists yet. */
export async function checkForUpdate(): Promise<void> {
  if (!desktopUpdates()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      pending = update;
      setVersion(update.version);
    }
  } catch {
    /* no network or no release: nothing to show */
  }
}

/** Downloads and installs the waiting update, then restarts the app. */
export async function installUpdate(): Promise<void> {
  if (!pending || busy()) return;
  setBusy(true);
  setFailed(false);
  try {
    await pending.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    setBusy(false);
    setFailed(true);
  }
}

export function dismissUpdate(): void {
  setVersion(null);
  pending = null;
}
