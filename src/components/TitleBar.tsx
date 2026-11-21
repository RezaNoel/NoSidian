// Custom window title bar for the desktop app (native decorations are off).
// Drag to move, double-click to maximize; caption buttons mirror in RTL like
// Windows does for right-to-left languages.
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Copy, Minus, Square, X } from "lucide-solid";
import { t } from "../i18n";
import { inTauri } from "../state/backend";
import { noteTitle } from "../lib/markdown";
import { activePath, vault } from "../state/vault";
import { Logo } from "./Logo";

/** The custom bar is shown in the desktop app, or in a browser with ?titlebar for previews. */
export const hasTitleBar = () =>
  (inTauri() && !/Android|iPhone|iPad/i.test(navigator.userAgent)) ||
  (typeof location !== "undefined" && location.search.includes("titlebar"));

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function TitleBar() {
  const [maximized, setMaximized] = createSignal(false);
  onMount(async () => {
    document.documentElement.dataset.titlebar = "true";
    if (!inTauri()) return;
    const w = await win();
    setMaximized(await w.isMaximized());
    const off = await w.onResized(async () => setMaximized(await w.isMaximized()));
    onCleanup(off);
  });
  onCleanup(() => delete document.documentElement.dataset.titlebar);

  const run = (fn: (w: Awaited<ReturnType<typeof win>>) => Promise<void>) => () => {
    if (inTauri()) void win().then(fn);
  };

  return (
    <header class="titlebar" data-tauri-drag-region classList={{ maximized: maximized() }}>
      <div class="titlebar-brand" data-tauri-drag-region>
        <Logo size={18} />
        <span data-tauri-drag-region>{t("app-name")}</span>
      </div>
      <div class="titlebar-title" data-tauri-drag-region dir="auto">
        <Show when={vault()}>
          <span data-tauri-drag-region>{vault()!.meta.name}</span>
          <Show when={activePath()}>
            <span class="sep" data-tauri-drag-region aria-hidden="true">/</span>
            <span class="note" data-tauri-drag-region>{noteTitle(activePath()!)}</span>
          </Show>
        </Show>
      </div>
      <div class="caption-buttons">
        <button class="caption" title={t("win-minimize")} aria-label={t("win-minimize")} onClick={run((w) => w.minimize())}><Minus /></button>
        <button class="caption" title={maximized() ? t("win-restore") : t("win-maximize")} aria-label={maximized() ? t("win-restore") : t("win-maximize")} onClick={run((w) => w.toggleMaximize())}>
          {maximized() ? <Copy class="restore" /> : <Square />}
        </button>
        <button class="caption close" title={t("win-close")} aria-label={t("win-close")} onClick={run((w) => w.close())}><X /></button>
      </div>
    </header>
  );
}
