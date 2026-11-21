// Mobile bottom navigation: files drawer, workspace, new note, context drawer, more.
import { For } from "solid-js";
import { Ellipsis, Files, Link2, Plus, SquarePen } from "lucide-solid";
import { t } from "../i18n";
import { drawer, setDrawer, type Drawer } from "../state/ui";
import { promptNewNote } from "./FileTree";

export function MobileNav() {
  const items: { id: Drawer | "new"; icon: typeof Files; label: () => string }[] = [
    { id: "left", icon: Files, label: () => t("nav-files") },
    { id: "none", icon: SquarePen, label: () => t("nav-workspace") },
    { id: "new", icon: Plus, label: () => t("nav-new") },
    { id: "right", icon: Link2, label: () => t("nav-context") },
    { id: "more", icon: Ellipsis, label: () => t("nav-more") },
  ];
  return (
    <nav class="mobile-nav glass" aria-label={t("nav-label")}>
      <For each={items}>
        {(it) => (
          <button
            class="mnav-btn"
            classList={{ fab: it.id === "new" }}
            aria-current={it.id !== "new" && drawer() === it.id ? "page" : undefined}
            aria-expanded={it.id === "left" || it.id === "right" || it.id === "more" ? drawer() === it.id : undefined}
            onClick={() => (it.id === "new" ? void promptNewNote() : setDrawer(drawer() === it.id ? "none" : (it.id as Drawer)))}
          >
            <it.icon aria-hidden="true" />
            <span>{it.label()}</span>
          </button>
        )}
      </For>
    </nav>
  );
}
