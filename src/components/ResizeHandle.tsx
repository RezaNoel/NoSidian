// Draggable, keyboard-operable splitter for a sidebar. Width is saved per vault.
import { createSignal } from "solid-js";
import { LEFT_DEFAULT, RIGHT_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from "../state/types";
import { clampWidth, profile, updateProfile } from "../state/workspace";

export function ResizeHandle(props: { side: "left" | "right"; label: string }) {
  const [dragging, setDragging] = createSignal(false);
  const width = () => (props.side === "left" ? profile.leftWidth : profile.rightWidth);
  const set = (w: number) =>
    updateProfile((p) => {
      if (props.side === "left") p.leftWidth = clampWidth(w);
      else p.rightWidth = clampWidth(w);
    });
  // Dragging toward the main area grows the sidebar; mirrored in RTL.
  const sign = (el: HTMLElement) => {
    const rtl = getComputedStyle(el).direction === "rtl";
    return (props.side === "left" ? 1 : -1) * (rtl ? -1 : 1);
  };

  const onPointerDown = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startW = width(), s = sign(el);
    setDragging(true);
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => set(startW + (ev.clientX - startX) * s);
    const up = () => {
      setDragging(false);
      document.body.classList.remove("resizing");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const onKey = (e: KeyboardEvent) => {
    const s = sign(e.currentTarget as HTMLElement);
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowRight") set(width() + step * s);
    else if (e.key === "ArrowLeft") set(width() - step * s);
    else if (e.key === "Home") set(SIDEBAR_MIN);
    else if (e.key === "End") set(SIDEBAR_MAX);
    else if (e.key === "Enter") set(props.side === "left" ? LEFT_DEFAULT : RIGHT_DEFAULT);
    else return;
    e.preventDefault();
  };

  return (
    <div
      class={`resize-handle ${props.side}`}
      classList={{ dragging: dragging() }}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width()}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDblClick={() => set(props.side === "left" ? LEFT_DEFAULT : RIGHT_DEFAULT)}
      onKeyDown={onKey}
    />
  );
}
