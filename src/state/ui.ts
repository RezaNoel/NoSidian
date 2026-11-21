// Transient UI state: mobile drawers, dialogs and overlays. Nothing here is persisted.
import { createRoot, createSignal, onCleanup } from "solid-js";
import { announce } from "../a11y/announcer";

export const MOBILE_QUERY = "(max-width: 767px)";

export type Drawer = "none" | "left" | "right" | "more";
export type Overlay = "none" | "settings" | "vaults";

export interface PromptRequest {
  kind: "prompt" | "confirm";
  title: string;
  body?: string;
  value?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

const ui = createRoot(() => {
  const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
  const [mobile, setMobile] = createSignal(mq?.matches ?? false);
  if (mq) {
    const on = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", on);
    onCleanup(() => mq.removeEventListener("change", on));
  }
  const [drawer, setDrawer] = createSignal<Drawer>("none");
  const [overlay, setOverlay] = createSignal<Overlay>("none");
  const [dialog, setDialog] = createSignal<PromptRequest | null>(null);
  const [toasts, setToasts] = createSignal<{ id: number; text: string; error: boolean }[]>([]);
  return { mobile, drawer, setDrawer, overlay, setOverlay, dialog, setDialog, toasts, setToasts };
});

export const isMobile = ui.mobile;
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
export const toasts = ui.toasts;
/** Brief on-screen message, also spoken by screen readers. */
export function toast(text: string, error = false): void {
  const id = ++toastId;
  ui.setToasts((l) => [...l.slice(-2), { id, text, error }]);
  announce(text, error ? "assertive" : "polite");
  setTimeout(() => ui.setToasts((l) => l.filter((x) => x.id !== id)), error ? 6000 : 3200);
}
