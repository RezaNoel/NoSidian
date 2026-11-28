// Hold Ctrl over a note in the explorer to see a small preview beside the mouse.
import { Show, createResource, createRoot, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { backend } from "../backend";
import { contents } from "../state/vault";
import { noteTitle } from "../lib/markdown";

interface Hover { path: string; x: number; y: number }

const st = createRoot(() => {
  const [over, setOver] = createSignal<Hover | null>(null);
  const [ctrl, setCtrl] = createSignal(false);
  return { over, setOver, ctrl, setCtrl };
});

/** Rows call these on mouse move and leave. */
export function hoverRow(e: MouseEvent, path: string): void {
  if (!/\.md$/i.test(path)) { st.setOver(null); return; }
  st.setOver({ path, x: e.clientX, y: e.clientY });
  st.setCtrl(e.ctrlKey || e.metaKey);
}
export const leaveRow = () => st.setOver(null);

const plain = (md: string) =>
  md.replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_: string, a: string, b: string) => b || a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~]|^\s*[-+]\s+\[[ xX]\]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function HoverPreview() {
  const key = (e: KeyboardEvent) => st.setCtrl(e.ctrlKey || e.metaKey);
  onMount(() => { window.addEventListener("keydown", key); window.addEventListener("keyup", key); window.addEventListener("blur", () => st.setCtrl(false)); });
  onCleanup(() => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); });
  const shown = () => (st.ctrl() ? st.over() : null);
  const [text] = createResource(
    () => shown()?.path,
    async (path) => plain(contents[path] ?? (await backend.read(path).catch(() => ""))).slice(0, 900),
  );
  return (
    <Show when={shown()}>
      {(h) => {
        const pos = () => {
          const w = 320, hgt = 260, pad = 14;
          const left = h().x + pad + w > window.innerWidth ? h().x - w - pad : h().x + pad;
          const top = Math.min(h().y + pad, window.innerHeight - hgt - 8);
          return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` };
        };
        return (
          <Portal>
            <div class="hover-preview glass-modal" style={pos()} aria-hidden="true">
              <strong dir="auto">{noteTitle(h().path)}</strong>
              <p dir="auto">{text() || "…"}</p>
            </div>
          </Portal>
        );
      }}
    </Show>
  );
}
