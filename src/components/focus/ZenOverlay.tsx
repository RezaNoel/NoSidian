// Full-screen distraction-free focus: the goal, the timer and nothing else.
import { Show, onCleanup, onMount } from "solid-js";
import { X } from "lucide-solid";
import { t } from "../../i18n";
import { setZenOpen, zen, zenOpen } from "../../state/focus";
import { MiniTimer } from "./MiniTimer";

export function ZenOverlay() {
  return (
    <Show when={zenOpen()}>
      {(() => {
        let el!: HTMLDivElement;
        const close = () => { setZenOpen(false); void document.exitFullscreen?.().catch(() => undefined); };
        const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
        onMount(() => { el.focus(); window.addEventListener("keydown", key); void el.requestFullscreen?.().catch(() => undefined); });
        onCleanup(() => window.removeEventListener("keydown", key));
        return (
          <div ref={el} class="zen-overlay" role="dialog" aria-modal="true" aria-label={t("focus-zen-mode")} tabIndex={-1}>
            <h1 dir="auto">{zen.state.goalTitle}</h1>
            <MiniTimer />
            <p class="muted" dir="auto">{t("focus-reward")}: {zen.state.rewardText}</p>
            <button class="icon-btn zen-close" aria-label={t("action-close")} onClick={close}><X /></button>
          </div>
        );
      })()}
    </Show>
  );
}
