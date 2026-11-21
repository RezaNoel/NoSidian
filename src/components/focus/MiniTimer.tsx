// Compact focus timer (dashboard widget and side panel).
import { Show } from "solid-js";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-solid";
import { t } from "../../i18n";
import { currentBlock, fmtClock, pauseTimer, progress, resetTimer, skipBlock, startTimer, timerRemaining, timerRunning, zen } from "../../state/focus";

export function MiniTimer() {
  const remaining = () => (timerRemaining() > 0 ? timerRemaining() : (currentBlock()?.minutes ?? zen.state.blocks[0]?.minutes ?? 25) * 60);
  return (
    <div class="mini-timer">
      <div class="ring" style={{ "--pct": `${progress().activeBlockPercent}%` }} role="timer" aria-label={`${currentBlock()?.label ?? ""} ${fmtClock(remaining())}`}>
        <span class="ring-time">{fmtClock(remaining())}</span>
        <span class="ring-label" dir="auto">{currentBlock()?.kind === "break" ? t("focus-break") : t("focus-focus")}</span>
      </div>
      <div class="row">
        <Show when={timerRunning()} fallback={<button class="icon-btn" aria-label={t("focus-start")} title={t("focus-start")} onClick={startTimer}><Play /></button>}>
          <button class="icon-btn" aria-label={t("focus-pause")} title={t("focus-pause")} onClick={pauseTimer}><Pause /></button>
        </Show>
        <button class="icon-btn" aria-label={t("focus-skip")} title={t("focus-skip")} onClick={skipBlock}><SkipForward class="flip-rtl" /></button>
        <button class="icon-btn" aria-label={t("focus-reset")} title={t("focus-reset")} onClick={resetTimer}><RotateCcw /></button>
      </div>
    </div>
  );
}
