// Rendered Markdown. Wikilinks open notes (or offer to create missing ones).
import { createMemo } from "solid-js";
import { t } from "../i18n";
import { renderMarkdown, resolveLink } from "../lib/markdown";
import { contents, createNote, markdownPaths, openNote } from "../state/vault";

export function scrollReaderTo(slug: string): boolean {
  const el = document.getElementById(`h-${slug}`);
  if (!el) return false;
  el.scrollIntoView({ block: "start" });
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

export function Reader(props: { path: string }) {
  const html = createMemo(() => renderMarkdown(contents[props.path] ?? ""));
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const target = a.dataset.target;
    if (target !== undefined) {
      e.preventDefault();
      const path = resolveLink(target, markdownPaths());
      if (path) openNote(path);
      else void createNote(target.split("/").pop()!, target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : undefined);
      return;
    }
    // External links open in the system browser, never inside the app window.
    const href = a.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      e.preventDefault();
      window.open(href, "_blank", "noopener");
    } else if (href.startsWith("#")) {
      e.preventDefault();
    }
  };
  return (
    <article class="reader markdown-body" aria-label={t("mode-reader")} innerHTML={html()} onClick={onClick} tabIndex={0} />
  );
}
