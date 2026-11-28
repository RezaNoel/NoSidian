// Debounced saves register here so they can be written at once before the
// window closes or another vault opens. Without this, a change made in the
// last moment before closing (or before switching vaults) was lost.
const flushers = new Set<() => Promise<void> | void>();

export function onFlush(fn: () => Promise<void> | void): void {
  flushers.add(fn);
}

/** Write every pending change now. Never throws. */
export async function flushAll(): Promise<void> {
  await Promise.all([...flushers].map(async (f) => { try { await f(); } catch { /* best effort */ } }));
}

if (typeof window !== "undefined") {
  // Browser fallback; in the desktop app the close request below waits for the writes.
  window.addEventListener("pagehide", () => void flushAll());
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      // Tauri waits for this handler, then closes the window.
      getCurrentWindow().onCloseRequested(async () => {
        await Promise.race([flushAll(), new Promise((r) => setTimeout(r, 3000))]);
      }),
    );
  }
}
