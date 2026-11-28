// Full-page app views (dashboard, graph, flashcards...) open as tabs with an
// `app:` path so they share tab handling, history and the title bar with notes.
import { t } from "../i18n";
import { noteTitle } from "../lib/markdown";

export const APP_VIEWS = ["start", "dashboard", "graph", "flashcards", "projects", "media", "people", "zen"] as const;
export type AppView = (typeof APP_VIEWS)[number];

export const isAppView = (path: string) => path.startsWith("app:");
export const viewOf = (path: string) => path.slice(4) as AppView;
export const viewPath = (v: AppView) => `app:${v}`;

export function tabTitle(path: string): string {
  return isAppView(path) ? t(`view-${viewOf(path)}`) : noteTitle(path);
}

export async function openView(v: AppView): Promise<void> {
  // The Zen studio is a page of its own over the whole window, never a tab.
  if (v === "zen") { const { setZenPage } = await import("./ui"); setZenPage(true); return; }
  const { openNote } = await import("./vault");
  openNote(viewPath(v));
}
