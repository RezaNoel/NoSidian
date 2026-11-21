// Full-screen overlays: the image lightbox and the slide presenter.
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ChevronLeft, ChevronRight, X } from "lucide-solid";
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
        const back = document.activeElement as HTMLElement | null;
        const close = () => { setZoomImage(null); back?.focus(); };
        useEscape(close);
        onMount(() => btn.focus());
        return (
          <div class="lightbox" role="dialog" aria-modal="true" aria-label={img.alt || t("image-zoom")} onClick={close}>
            <img src={img.src} alt={img.alt} />
            <button ref={btn} class="icon-btn lightbox-close" aria-label={t("action-close")} onClick={close}><X /></button>
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
