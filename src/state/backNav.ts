// The phone's back button (and back gesture): close what is on top, go back
// to the previous note or page, and leave the app only when back is pressed
// twice in a row on the first page. Works through the browser history, which
// is what the Android back button drives in the app's web view.
import { createEffect, createRoot, on } from "solid-js";
import { t } from "../i18n";
import { drawer, setDrawer, setZenPage, toast, zenPage } from "./ui";
import { profile } from "./workspace";
import { openNote, tree } from "./vault";

const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null;
const escape = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

/** Close the top-most layer, if any; true when something closed. */
function closeTop(): boolean {
  const menu = document.querySelector<HTMLElement>(".context-menu");
  if (menu) { escape(menu); return true; }
  const dialogs = [...document.querySelectorAll<HTMLElement>("[role=dialog]")].filter(visible);
  const top = dialogs[dialogs.length - 1];
  if (top) {
    // Pages inside a dialog (settings on a phone) go back a page before closing.
    const back = [...top.querySelectorAll<HTMLElement>("[data-back], .settings-back")].find(visible);
    if (back) { back.click(); return true; }
    escape(top);
    return true;
  }
  if (zenPage()) { setZenPage(false); return true; }
  if (drawer() !== "none") { setDrawer("none"); return true; }
  const pageBack = [...document.querySelectorAll<HTMLElement>("[data-back]")].find(visible);
  if (pageBack) { pageBack.click(); return true; }
  return false;
}

// Notes and pages visited, newest last, for going back.
const visited: string[] = [];
let goingBack = false;

function previousPage(): boolean {
  const exists = (p: string) => p.startsWith("app:") || tree.notes.some((n) => n.path === p);
  visited.pop();
  while (visited.length) {
    const p = visited[visited.length - 1];
    if (exists(p) && p !== profile.activeTab) {
      goingBack = true;
      openNote(p);
      queueMicrotask(() => { goingBack = false; });
      return true;
    }
    visited.pop();
  }
  return false;
}

let installed = false;
let lastBack = 0;

export function installBackNav(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  createRoot(() => createEffect(on(() => profile.activeTab, (p) => {
    if (!p || goingBack) return;
    if (visited[visited.length - 1] !== p) visited.push(p);
    if (visited.length > 50) visited.shift();
  })));
  // One guard entry: each back press lands on it being popped, and we put it back.
  history.replaceState({ nosidian: "root" }, "");
  history.pushState({ nosidian: "guard" }, "");
  window.addEventListener("popstate", () => {
    if (closeTop() || previousPage()) {
      history.pushState({ nosidian: "guard" }, "");
      return;
    }
    const now = Date.now();
    if (now - lastBack < 2000) {
      history.back(); // past the first entry: the system closes the app
      return;
    }
    lastBack = now;
    toast(t("back-again-to-exit"));
    history.pushState({ nosidian: "guard" }, "");
  });
}
