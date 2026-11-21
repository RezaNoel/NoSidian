// Focus: the Zen/Pomodoro block sequence and its timer, the ambient sound
// mixer and music, and the falling-particle effect settings.
import { createRoot, createSignal } from "solid-js";
import { appDoc } from "./persist";
import { claimZenReward, computeZenSequenceProgress, normalizeZenConfig } from "../core/zenMode";
import { focusAudio } from "../core/utils/audio";
import { ambientMusic } from "../core/utils/ambientMusic";
import type { AmbientConfig, ZenStudioConfig } from "../core/types";
import { petStudyTick, rewardPet } from "./pet";
import { toast } from "./ui";
import { t } from "../i18n";

export const zen = appDoc<ZenStudioConfig>("zen", () => {
  const z = normalizeZenConfig(null);
  // The core defaults are English; a new plan uses the interface language.
  z.goalTitle = t("focus-default-goal");
  z.rewardText = t("focus-default-reward");
  z.blocks = z.blocks.map((b) => ({ ...b, label: t(b.kind === "break" ? "focus-break" : "focus-focus") }));
  return z;
});
export const ambient = appDoc<AmbientConfig>("ambient", () => ({ effect: "none", density: 55, wind: 2, maxPileHeight: 28, musicTrack: "none", musicPlaying: false, musicVolume: 0.35 }));

/** Focused minutes per day (YYYY-MM-DD), for the calendar and stats. */
export const focusLog = appDoc<{ days: Record<string, number> }>("focus-log", () => ({ days: {} }));
let focusSeconds = 0;
function logFocusSecond() {
  if (++focusSeconds < 60) return;
  focusSeconds = 0;
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  focusLog.update((l) => { l.days[key] = (l.days[key] ?? 0) + 1; });
}

// Nothing plays at start-up, whatever was playing when the app closed.
if (typeof window !== "undefined") {
  const settle = () => (ambient.ready() ? ambient.update((a) => { a.musicPlaying = false; }) : setTimeout(settle, 100));
  settle();
}

const timer = createRoot(() => {
  const [running, setRunning] = createSignal(false);
  const [index, setIndex] = createSignal(0);
  const [remaining, setRemaining] = createSignal(0);
  const [finished, setFinished] = createSignal(false);
  const [zenOpen, setZenOpen] = createSignal(false);
  return { running, setRunning, index, setIndex, remaining, setRemaining, finished, setFinished, zenOpen, setZenOpen };
});

export const timerRunning = timer.running;
export const timerIndex = timer.index;
export const timerRemaining = timer.remaining;
export const sessionFinished = timer.finished;
export const zenOpen = timer.zenOpen;
export const setZenOpen = timer.setZenOpen;

export const currentBlock = () => zen.state.blocks[timer.index()] ?? null;
export const progress = () => computeZenSequenceProgress(zen.state.blocks, timer.index(), timer.remaining());

let handle: ReturnType<typeof setInterval> | undefined;

export function startTimer(): void {
  if (!zen.state.blocks.length) return;
  if (timer.finished() || timer.remaining() <= 0) {
    timer.setFinished(false);
    if (timer.remaining() <= 0) timer.setRemaining(zen.state.blocks[timer.index()].minutes * 60);
  }
  timer.setRunning(true);
  clearInterval(handle);
  handle = setInterval(tick, 1000);
  if (!ambient.state.musicItem && ambient.state.musicTrack !== "none") syncMusic(true);
}

export function pauseTimer(): void {
  timer.setRunning(false);
  clearInterval(handle);
}

export function resetTimer(): void {
  pauseTimer();
  timer.setIndex(0);
  timer.setFinished(false);
  timer.setRemaining(zen.state.blocks[0]?.minutes * 60 || 0);
}

export function skipBlock(): void {
  advance();
}

function advance() {
  const next = timer.index() + 1;
  focusAudio.playChime();
  if (next >= zen.state.blocks.length) {
    pauseTimer();
    timer.setFinished(true);
    timer.setRemaining(0);
    const coins = rewardPet("zen-complete");
    toast(t("focus-session-done", { coins }));
    return;
  }
  timer.setIndex(next);
  timer.setRemaining(zen.state.blocks[next].minutes * 60);
  toast(t(zen.state.blocks[next].kind === "break" ? "focus-break-start" : "focus-block-start", { name: zen.state.blocks[next].label }));
}

function tick() {
  const r = timer.remaining() - 1;
  if (currentBlock()?.kind === "focus") { petStudyTick(); logFocusSecond(); }
  if (r === 60 && zen.state.oneMinuteWarningEnabled) toast(t("focus-one-minute"));
  if (r <= 0) advance();
  else timer.setRemaining(r);
}

export function claimReward(): void {
  zen.replace(claimZenReward(JSON.parse(JSON.stringify(zen.state))));
  timer.setFinished(false);
  resetTimer();
}

export function setChannel(ch: keyof ZenStudioConfig["soundChannels"], v: number): void {
  zen.update((z) => { z.soundChannels[ch] = v; });
  focusAudio.setVolume(ch, v);
}

/** Start/stop the procedural music to match the settings. */
export function syncMusic(playing = ambient.state.musicPlaying): void {
  const track = ambient.state.musicTrack;
  ambient.update((a) => { a.musicPlaying = playing && track !== "none"; });
  ambientMusic.sync(track, playing && track !== "none", ambient.state.musicVolume);
}

export function stopAllSound(): void {
  focusAudio.stopAll();
  ambientMusic.stopAll();
  ambient.update((a) => { a.musicPlaying = false; });
}

export const fmtClock = (sec: number) => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
