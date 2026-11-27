// Short, quiet sounds for a few meaningful actions only (timer start and stop,
// ticking off a task, grading a card, picking a theme, the dice). Each action
// has its own sound. Synthesized with Web Audio, so nothing is downloaded.
// Turned off in Settings > You ("Button sounds").
import { pref } from "./prefs";

let ctx: AudioContext | null = null;
let last = 0;

export type SoundKind = "start" | "stop" | "done" | "pick" | "good" | "again" | "dice";

/** One soft note: frequency, start offset and length in seconds, wave and loudness. */
type Note = [hz: number, at: number, dur: number, wave?: OscillatorType, vol?: number];

const SOUNDS: Record<SoundKind, Note[]> = {
  // Two rising notes, like a small chime.
  start: [[523.25, 0, 0.16, "triangle"], [783.99, 0.07, 0.22, "triangle"]],
  // The same two notes falling.
  stop: [[659.25, 0, 0.14, "triangle"], [440, 0.07, 0.2, "triangle"]],
  // A bright little "ding" for a finished task.
  done: [[1046.5, 0, 0.12, "sine", 0.05], [1567.98, 0.05, 0.28, "sine", 0.04]],
  // A soft bell for picking a theme or colour.
  pick: [[880, 0, 0.3, "sine", 0.04], [1760, 0, 0.18, "sine", 0.015]],
  // A card you knew: a warm major third.
  good: [[587.33, 0, 0.14, "sine"], [739.99, 0.06, 0.18, "sine"]],
  // A card to see again: one low, short note.
  again: [[311.13, 0, 0.16, "triangle", 0.05]],
  // The dice: quick wooden ticks.
  dice: [[1200, 0, 0.03, "square", 0.02], [1000, 0.05, 0.03, "square", 0.02], [1300, 0.1, 0.03, "square", 0.02], [900, 0.16, 0.05, "square", 0.02]],
};

export function playUiSound(kind: SoundKind): void {
  if (!pref("uiSounds")) return;
  const now = performance.now();
  if (now - last < 80) return; // one sound per action, never a burst
  last = now;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [hz, at, dur, wave = "sine", vol = 0.06] of SOUNDS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(hz, t0 + at);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.03);
    }
  } catch { /* no audio device: stay silent */ }
}

/** The only things that make a sound. Everything else stays silent. */
const RULES: [string, SoundKind | ((el: HTMLElement) => SoundKind | null)][] = [
  ["[data-sound=start]", "start"],
  ["[data-sound=stop]", "stop"],
  ["[data-sound=pick]", "dice"],
  [".ratings .rate-1", "again"],
  [".ratings .rate-2, .ratings .rate-3, .ratings .rate-4", "good"],
  [".theme-tile, .swatch, .accent-dot", "pick"],
  // Ticking a task box on (not off).
  ["input[type=checkbox].task-box, .widget input[type=checkbox]", (el) => ((el as HTMLInputElement).checked ? "done" : null)],
];

/** Call once at startup. */
export function installUiSounds(): void {
  window.addEventListener("click", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest) return;
    for (const [sel, kind] of RULES) {
      const hit = el.closest(sel) as HTMLElement | null;
      if (!hit) continue;
      const k = typeof kind === "function" ? kind(hit) : kind;
      if (k) playUiSound(k);
      return;
    }
  }, false);
}
