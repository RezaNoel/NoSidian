// Transient UI state: mobile drawers, dialogs and overlays. Nothing here is persisted.
import { createRoot, createSignal, onCleanup } from "solid-js";
import { announce } from "../a11y/announcer";

export const MOBILE_QUERY = "(max-width: 767px)";

export type Drawer = "none" | "left" | "right" | "more";
export type Overlay = "none" | "settings" | "vaults" | "banner" | "switcher" | "palette";

export interface PromptRequest {
  kind: "prompt" | "confirm";
  title: string;
  body?: string;
  value?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

/** The Windows/macOS/Linux app (or a ?titlebar preview): narrow windows hide panels instead of switching to the phone layout. */
export const isDesktopApp = typeof window !== "undefined" &&
  ((("__TAURI_INTERNALS__" in window) && !/Android|iPhone|iPad/i.test(navigator.userAgent)) || location.search.includes("titlebar"));
if (isDesktopApp) document.documentElement.dataset.desktop = "true";

const ui = createRoot(() => {
  const mq = !isDesktopApp && typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
  const [mobile, setMobile] = createSignal(mq?.matches ?? false);
  if (mq) {
    const on = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", on);
    onCleanup(() => mq.removeEventListener("change", on));
  }
  const [drawer, setDrawer] = createSignal<Drawer>("none");
  const [overlay, setOverlay] = createSignal<Overlay>("none");
  const [dialog, setDialog] = createSignal<PromptRequest | null>(null);
  const [zoomImage, setZoomImage] = createSignal<{ src: string; alt: string } | null>(null);
  const [slides, setSlides] = createSignal<string | null>(null);
  const [toasts, setToasts] = createSignal<{ id: number; text: string; error: boolean }[]>([]);
  return { mobile, drawer, setDrawer, overlay, setOverlay, dialog, setDialog, toasts, setToasts, zoomImage, setZoomImage, slides, setSlides };
});

export const isMobile = ui.mobile;
const zenPageSignal = createRoot(() => createSignal(false));
/** The full-window Zen studio page. */
export const zenPage = zenPageSignal[0];
export const setZenPage = zenPageSignal[1];
export const drawer = ui.drawer;
export const setDrawer = ui.setDrawer;
export const overlay = ui.overlay;
export const setOverlay = ui.setOverlay;
export const dialog = ui.dialog;

/** Ask for a single line of text. Resolves to null when cancelled. */
export function askText(title: string, value = "", confirmLabel: string): Promise<string | null> {
  return new Promise((resolve) =>
    ui.setDialog({ kind: "prompt", title, value, confirmLabel, resolve: (v) => resolve(typeof v === "string" ? v : null) }),
  );
}

/** Ask a yes/no question. */
export function askConfirm(title: string, body: string, confirmLabel: string, danger = true): Promise<boolean> {
  return new Promise((resolve) =>
    ui.setDialog({ kind: "confirm", title, body, confirmLabel, danger, resolve: (v) => resolve(v === true) }),
  );
}

export function closeDialog(result: string | boolean | null): void {
  const d = ui.dialog();
  ui.setDialog(null);
  d?.resolve(result);
}

let toastId = 0;
if (typeof window !== "undefined") window.addEventListener("nosidian:toast", (e) => toast((e as CustomEvent<string>).detail));
export const toasts = ui.toasts;
/** Image shown full-screen by the lightbox (click an image in the reader). */
export const zoomImage = ui.zoomImage;
export const setZoomImage = ui.setZoomImage;
/** Brief on-screen message, also spoken by screen readers. */
export function toast(text: string, error = false): void {
  const id = ++toastId;
  ui.setToasts((l) => [...l.slice(-2), { id, text, error }]);
  announce(text, error ? "assertive" : "polite");
  setTimeout(() => ui.setToasts((l) => l.filter((x) => x.id !== id)), error ? 6000 : 3200);
}
/** Note shown as a full-screen slide deck, if any. */
export const slidesFor = ui.slides;
export const setSlidesFor = ui.setSlides;
