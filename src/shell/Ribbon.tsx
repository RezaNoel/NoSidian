import { For, createSignal } from "solid-js";
import { t, type MessageKey } from "../i18n";
import { rovingKeydown } from "../a11y/roving";
import { Icon } from "./icons";

interface RibbonItem { id: string; icon: string; label: MessageKey }

const ITEMS: RibbonItem[] = [
  { id: "dashboard", icon: "home", label: "ribbon-dashboard" },
  { id: "files", icon: "files", label: "ribbon-files" },
  { id: "search", icon: "search", label: "ribbon-search" },
  { id: "graph", icon: "graph", label: "ribbon-graph" },
  { id: "flashcards", icon: "cards", label: "ribbon-flashcards" },
  { id: "focus", icon: "focus", label: "ribbon-focus" },
];

export function Ribbon() {
  const [active, setActive] = createSignal("dashboard");
  const button = (item: RibbonItem, index: () => number) => (
    <button
      type="button"
      class="icon-btn"
      data-ribbon-item
      tabindex={index() === 0 ? 0 : -1}
      aria-label={t(item.label)}
      title={t(item.label)}
      aria-pressed={active() === item.id}
      onClick={() => setActive(item.id)}
    >
      <Icon name={item.icon} />
    </button>
  );
  return (
    <nav
      class="ribbon glass"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("shell-ribbon-label")}
      onKeyDown={rovingKeydown("[data-ribbon-item]", "vertical")}
    >
      <For each={ITEMS}>{(item, i) => button(item, i)}</For>
      <div class="spacer" />
      {button({ id: "settings", icon: "settings", label: "ribbon-settings" }, () => -1)}
    </nav>
  );
}
