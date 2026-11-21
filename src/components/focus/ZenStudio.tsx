// Zen studio: plan a sequence of focus and break blocks with a goal and a
// reward, mix ambient sounds and music, pick a background effect, and enter
// the distraction-free full-screen mode.
import { For, Show } from "solid-js";
import { ArrowDown, ArrowUp, Coffee, Gift, Maximize2, Pause, Play, Plus, Trash2 } from "lucide-solid";
import { t } from "../../i18n";
import { addBreakAfterBlock, addFocusBlock, removeZenBlock, updateZenBlock } from "../../core/zenMode";
import { AMBIENT_MUSIC_TRACKS } from "../../core/utils/ambientMusic";
import type { AmbientEffectType, AmbientMusicTrack } from "../../core/types";
import { ambient, claimReward, sessionFinished, setZenOpen, syncMusic, timerIndex, timerRunning, zen } from "../../state/focus";
import { Toggle } from "../controls";
import { MiniTimer } from "./MiniTimer";
import { Mixer } from "./FocusPanel";

export const EFFECTS: AmbientEffectType[] = ["none", "snow", "autumn", "sakura", "fireflies", "rain", "starfield", "embers", "aurora"];

export default function ZenStudio() {
  const blocks = () => zen.state.blocks;
  const setBlocks = (fn: (b: typeof zen.state.blocks) => typeof zen.state.blocks) => zen.update((z) => { z.blocks = fn(JSON.parse(JSON.stringify(z.blocks))); });
  const swap = (i: number, j: number) => setBlocks((b) => { if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const total = () => blocks().filter((b) => b.kind === "focus").reduce((n, b) => n + b.minutes, 0);
  return (
    <div class="zen-studio page">
      <header class="page-head">
        <h1>{t("view-zen")}</h1>
        <button class="btn primary" onClick={() => setZenOpen(true)}><Maximize2 />{t("focus-zen-mode")}</button>
      </header>
      <div class="zen-grid">
        <section class="card glass-soft">
          <h2 class="section-title">{t("focus-plan")}</h2>
          <label class="field"><span>{t("focus-goal")}</span><input class="input" dir="auto" value={zen.state.goalTitle} onChange={(e) => { const v = e.currentTarget.value; zen.update((z) => { z.goalTitle = v; }); }} /></label>
          <label class="field"><span>{t("focus-reward")}</span><input class="input" dir="auto" value={zen.state.rewardText} onChange={(e) => { const v = e.currentTarget.value; zen.update((z) => { z.rewardText = v; }); }} /></label>
          <ol class="zen-blocks">
            <For each={blocks()}>
              {(b, i) => (
                <li class="zen-block" classList={{ active: timerRunning() && i() === timerIndex(), brk: b.kind === "break" }}>
                  {b.kind === "break" ? <Coffee aria-hidden="true" /> : <Play aria-hidden="true" />}
                  <input class="input sm" dir="auto" value={b.label} aria-label={t("focus-block-name")} onChange={(e) => { const v = e.currentTarget.value; setBlocks((x) => updateZenBlock(x, b.id, { label: v })); }} />
                  <input class="input sm num" type="number" min="1" max="180" value={b.minutes} aria-label={t("focus-minutes")} onChange={(e) => { const v = Math.max(1, Math.min(180, Number(e.currentTarget.value) || 1)); setBlocks((x) => updateZenBlock(x, b.id, { minutes: v })); }} />
                  <span class="muted">{t("focus-min")}</span>
                  <button class="icon-btn sm" aria-label={t("dash-move-back")} onClick={() => swap(i(), i() - 1)}><ArrowUp /></button>
                  <button class="icon-btn sm" aria-label={t("dash-move-forward")} onClick={() => swap(i(), i() + 1)}><ArrowDown /></button>
                  <button class="icon-btn sm" aria-label={t("focus-add-break")} title={t("focus-add-break")} onClick={() => setBlocks((x) => addBreakAfterBlock(x, i(), 5, t("focus-break")))}><Coffee /></button>
                  <button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => setBlocks((x) => removeZenBlock(x, b.id))}><Trash2 /></button>
                </li>
              )}
            </For>
          </ol>
          <div class="row">
            <button class="btn sm" onClick={() => setBlocks((x) => addFocusBlock(x, 25, t("focus-focus")))}><Plus />{t("focus-add-focus")}</button>
            <span class="muted">{t("focus-total", { minutes: total() })}</span>
          </div>
          <Toggle label={t("focus-one-minute-warning")} checked={zen.state.oneMinuteWarningEnabled} onChange={(v) => zen.update((z) => { z.oneMinuteWarningEnabled = v; })} />
        </section>
        <section class="card glass-soft center">
          <MiniTimer />
          <Show when={sessionFinished()}>
            <div class="reward">
              <Gift aria-hidden="true" />
              <p dir="auto">{t("focus-reward-ready", { reward: zen.state.rewardText })}</p>
              <button class="btn primary" onClick={claimReward}>{t("focus-claim")}</button>
            </div>
          </Show>
          <p class="muted">{t("focus-sessions", { count: zen.state.completedSessions })}</p>
          <Show when={zen.state.claimedRewards.length}>
            <ul class="list compact">
              <For each={zen.state.claimedRewards.slice(0, 5)}>{(r) => <li dir="auto">{r.rewardText} · {new Date(r.claimedAt).toLocaleDateString()}</li>}</For>
            </ul>
          </Show>
        </section>
        <section class="card glass-soft">
          <h2 class="section-title">{t("focus-music")}</h2>
          <div class="row">
            <select class="select" aria-label={t("focus-music")} value={ambient.state.musicTrack} onChange={(e) => { const v = e.currentTarget.value as AmbientMusicTrack; ambient.update((a) => { a.musicTrack = v; }); syncMusic(v !== "none" && ambient.state.musicPlaying); }}>
              <option value="none">{t("focus-music-none")}</option>
              <For each={AMBIENT_MUSIC_TRACKS}>{(tr) => <option value={tr.id}>{t(`music-${tr.id}`)}</option>}</For>
            </select>
            <button class="icon-btn" aria-pressed={ambient.state.musicPlaying} aria-label={ambient.state.musicPlaying ? t("focus-pause") : t("focus-start")} disabled={ambient.state.musicTrack === "none"} onClick={() => syncMusic(!ambient.state.musicPlaying)}>
              {ambient.state.musicPlaying ? <Pause /> : <Play />}
            </button>
          </div>
          <label class="mixer-row"><span>{t("focus-volume")}</span><input type="range" min="0" max="1" step="0.05" value={ambient.state.musicVolume} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.musicVolume = v; }); syncMusic(); }} /></label>
          <h2 class="section-title">{t("focus-sounds")}</h2>
          <Mixer />
          <h2 class="section-title">{t("focus-effect")}</h2>
          <select class="select" aria-label={t("focus-effect")} value={ambient.state.effect} onChange={(e) => { const v = e.currentTarget.value as AmbientEffectType; ambient.update((a) => { a.effect = v; }); }}>
            <For each={EFFECTS}>{(ef) => <option value={ef}>{t(`effect-${ef}`)}</option>}</For>
          </select>
          <label class="mixer-row"><span>{t("focus-density")}</span><input type="range" min="20" max="100" value={ambient.state.density} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.density = v; }); }} /></label>
          <label class="mixer-row"><span>{t("focus-wind")}</span><input type="range" min="-10" max="10" value={ambient.state.wind} onInput={(e) => { const v = Number(e.currentTarget.value); ambient.update((a) => { a.wind = v; }); }} /></label>
        </section>
      </div>
    </div>
  );
}
