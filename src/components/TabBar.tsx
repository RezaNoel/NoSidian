// Open note tabs. Middle-click or the X closes; arrow keys move between tabs.
import { For } from "solid-js";
import { FileText, X } from "lucide-solid";
import { t } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { tabTitle as noteTitle } from "../state/views";
import { activePath, closeTab, openNote } from "../state/vault";
import { profile } from "../state/workspace";

export function TabBar(props: { inline?: boolean }) {
  return (
    <div class="tabbar" classList={{ inline: props.inline }} role="tablist" aria-label={t("tabs-label")} onKeyDown={rovingKeydown("[role=tab]", "horizontal")}>
      <For each={profile.openTabs}>
        {(path) => {
          const active = () => activePath() === path;
          return (
            <div class="tab" classList={{ active: active() }} title={path} onAuxClick={(e) => e.button === 1 && closeTab(path)}>
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
