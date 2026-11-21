// Open note tabs. Middle-click or the X closes; arrow keys move between tabs.
import { For } from "solid-js";
import { Copy, FileText, FolderSearch, Star, X } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { tabTitle as noteTitle } from "../state/views";
import { activePath, closeTab, openNote, toggleStar } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { isAppView } from "../state/views";
import { toast } from "../state/ui";
import { openMenu, type MenuItem } from "./ContextMenu";
import { revealInFiles } from "./FileTree";

/** Right-click menu for a tab: close variants, star, copy path, show in files. */
export function tabMenu(e: MouseEvent, path: string): void {
  const tabs = profile.openTabs;
  const i = tabs.indexOf(path);
  const keep = (list: string[]) => updateProfile((p) => { p.openTabs = list; if (!list.includes(p.activeTab ?? "")) p.activeTab = list.includes(path) ? path : list[list.length - 1] ?? null; });
  const note = !isAppView(path);
  const starred = profile.starred.includes(path);
  const items: MenuItem[] = [
    { label: t("action-close-tab"), icon: <X />, run: () => closeTab(path) },
    { label: t("tab-close-others"), disabled: tabs.length < 2, run: () => keep([path]) },
    { label: t("tab-close-right"), disabled: i < 0 || i === tabs.length - 1, run: () => keep(tabs.slice(0, i + 1)) },
    { label: t("tab-close-all"), run: () => keep([]) },
  ];
  if (note) items.push(
    { label: starred ? t("action-unstar") : t("action-star"), icon: <Star />, sep: true, run: () => toggleStar(path) },
    { label: t("tab-copy-path"), icon: <Copy />, run: () => void navigator.clipboard?.writeText(path).then(() => toast(t("copied"))) },
    { label: t("tab-show-in-files"), icon: <FolderSearch />, run: () => revealInFiles(path) },
  );
  openMenu(e, items);
}

export function TabBar(props: { inline?: boolean }) {
  return (
    <div class="tabbar" classList={{ inline: props.inline }} role="tablist" aria-label={t("tabs-label")} onKeyDown={rovingKeydown("[role=tab]", "horizontal")}>
      <For each={profile.openTabs}>
        {(path) => {
          const active = () => activePath() === path;
          return (
            <div class="tab" classList={{ active: active() }} title={path} onAuxClick={(e) => e.button === 1 && closeTab(path)} onContextMenu={(e) => tabMenu(e, path)}>
              <button
                role="tab"
                aria-selected={active()}
                aria-controls="note-view"
                tabIndex={active() ? 0 : -1}
                class="tab-main"
                title={path}
                onClick={() => openNote(path)}
                onKeyDown={(e) => { if (e.key === "Delete") { e.preventDefault(); closeTab(path); } }}
              >
                <FileText aria-hidden="true" />
                <span dir="auto">{noteTitle(path)}</span>
              </button>
              <button class="tab-close" tabIndex={-1} aria-label={`${t("action-close-tab")}: ${noteTitle(path)}`} title={t("action-close-tab")} onClick={() => closeTab(path)}>
                <X />
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}
