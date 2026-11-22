// Full-screen overlays: the image lightbox and the slide presenter.
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from "lucide-solid";
import { t } from "../i18n";
import { renderMarkdown, splitSlides } from "../lib/markdown";
import { setSlidesFor, setZoomImage, slidesFor, zoomImage } from "../state/ui";
import { contents } from "../state/vault";

function useEscape(close: () => void) {
  const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  onMount(() => window.addEventListener("keydown", on, true));
  onCleanup(() => window.removeEventListener("keydown", on, true));
}

export function Lightbox() {
  return (
    <Show when={zoomImage()} keyed>
      {(img) => {
        let btn!: HTMLButtonElement;
        let host!: HTMLDivElement;
        const back = document.activeElement as HTMLElement | null;
        const [scale, setScale] = createSignal(1);
        const [pan, setPan] = createSignal({ x: 0, y: 0 });
        let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
        const close = () => { setZoomImage(null); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); back?.focus(); };
        const zoomTo = (s: number) => {
          const next = Math.max(1, Math.min(8, s));
          setScale(next);
          if (next === 1) setPan({ x: 0, y: 0 });
        };
        const full = () => (document.fullscreenElement ? void document.exitFullscreen() : void host.requestFullscreen?.().catch(() => undefined));
        useEscape(close);
        onMount(() => btn.focus());
        const key = (e: KeyboardEvent) => {
          if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(scale() * 1.25); }
          else if (e.key === "-") { e.preventDefault(); zoomTo(scale() / 1.25); }
          else if (e.key === "0") zoomTo(1);
          else if (e.key === "f") full();
        };
        const wheel = (e: WheelEvent) => { e.preventDefault(); zoomTo(scale() * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); };
        const down = (e: PointerEvent) => {
          if (e.button !== 0) return;
          drag = { x: e.clientX, y: e.clientY, px: pan().x, py: pan().y, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!drag || scale() === 1) return;
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          setPan({ x: drag.px + dx, y: drag.py + dy });
        };
        const up = (e: PointerEvent) => {
          const d = drag;
          drag = null;
          if (d && !d.moved && e.target === e.currentTarget) close();
        };
        return (
          <div ref={host} class="lightbox" classList={{ zoomed: scale() > 1 }} role="dialog" aria-modal="true" aria-label={img.alt || t("image-zoom")}
            onKeyDown={key} onWheel={wheel} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <img src={img.src} alt={img.alt} draggable={false} style={{ transform: `translate(${pan().x}px, ${pan().y}px) scale(${scale()})` }}
              onDblClick={() => zoomTo(scale() > 1 ? 1 : 2.5)} />
            <div class="lightbox-tools" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              <button class="icon-btn" aria-label={t("image-zoom-out")} title={t("image-zoom-out")} disabled={scale() <= 1} onClick={() => zoomTo(scale() / 1.25)}><ZoomOut /></button>
              <button class="lightbox-pct" aria-label={t("image-zoom-reset")} title={t("image-zoom-reset")} onClick={() => zoomTo(1)}>{Math.round(scale() * 100)}%</button>
              <button class="icon-btn" aria-label={t("image-zoom-in")} title={t("image-zoom-in")} disabled={scale() >= 8} onClick={() => zoomTo(scale() * 1.25)}><ZoomIn /></button>
              <button class="icon-btn" aria-label={t("player-fullscreen")} title={t("player-fullscreen")} onClick={full}><Maximize2 /></button>
              <button ref={btn} class="icon-btn" aria-label={t("action-close")} title={t("action-close")} onClick={close}><X /></button>
            </div>
          </div>
        );
      }}
    </Show>
  );
}

export function SlidesOverlay() {
  return (
    <Show when={slidesFor()} keyed>
      {(path) => {
        const slides = createMemo(() => splitSlides(contents[path] ?? ""));
        const [i, setI] = createSignal(0);
        let host!: HTMLDivElement;
        const close = () => { setSlidesFor(null); void document.exitFullscreen?.().catch(() => undefined); };
        const go = (d: number) => setI((n) => Math.max(0, Math.min(slides().length - 1, n + d)));
        useEscape(close);
        const key = (e: KeyboardEvent) => {
          const rtl = document.documentElement.dir === "rtl";
          if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(e.key === "ArrowRight" && rtl ? -1 : 1); }
          if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(e.key === "ArrowLeft" && rtl ? 1 : -1); }
          if (e.key === "Home") setI(0);
          if (e.key === "End") setI(slides().length - 1);
        };
        onMount(() => { host.focus(); void host.requestFullscreen?.().catch(() => undefined); });
        createEffect(() => { if (i() >= slides().length) setI(Math.max(0, slides().length - 1)); });
        return (
          <div ref={host} class="slides" role="dialog" aria-modal="true" aria-roledescription={t("slides-label")} aria-label={t("slides-label")} tabIndex={-1} onKeyDown={key}>
            <article class="slide markdown-body" dir="auto" aria-live="polite" innerHTML={renderMarkdown(slides()[i()] ?? "")} />
            <footer class="slides-bar">
              <button class="icon-btn" aria-label={t("slides-prev")} disabled={i() === 0} onClick={() => go(-1)}><ChevronLeft class="flip-rtl" /></button>
              <span class="slides-count">{t("slides-count", { current: i() + 1, total: slides().length })}</span>
              <button class="icon-btn" aria-label={t("slides-next")} disabled={i() >= slides().length - 1} onClick={() => go(1)}><ChevronRight class="flip-rtl" /></button>
              <button class="icon-btn" aria-label={t("action-close")} onClick={close}><X /></button>
            </footer>
          </div>
        );
      }}
    </Show>
  );
}
