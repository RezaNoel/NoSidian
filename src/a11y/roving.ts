// Roving tabindex for toolbars, tab lists and menus (WAI-ARIA APG pattern):
// one Tab stop per widget, arrow keys move inside it. Horizontal widgets
// mirror Left/Right in RTL.

export type Orientation = "horizontal" | "vertical";

export function nextIndex(
  current: number,
  key: string,
  count: number,
  orientation: Orientation,
  rtl = false,
): number | null {
  if (count <= 0) return null;
  const prevKeys = orientation === "vertical" ? ["ArrowUp"] : [rtl ? "ArrowRight" : "ArrowLeft"];
  const nextKeys = orientation === "vertical" ? ["ArrowDown"] : [rtl ? "ArrowLeft" : "ArrowRight"];
  if (nextKeys.includes(key)) return (current + 1) % count;
  if (prevKeys.includes(key)) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Keydown handler for a container whose focusable items match `selector`. */
export function rovingKeydown(selector: string, orientation: Orientation) {
  return (e: KeyboardEvent) => {
    const container = e.currentTarget as HTMLElement;
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
    const current = items.indexOf(document.activeElement as HTMLElement);
    const rtl = getComputedStyle(container).direction === "rtl";
    const next = nextIndex(Math.max(current, 0), e.key, items.length, orientation, rtl);
    if (next === null) return;
    e.preventDefault();
    items.forEach((el, i) => el.setAttribute("tabindex", i === next ? "0" : "-1"));
    items[next].focus();
  };
}
