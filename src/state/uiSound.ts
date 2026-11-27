// Short, quiet click sounds for important buttons (settings, timer start/stop,
// themes, shelves...). Synthesized with Web Audio, so nothing is downloaded.
// Turned off in Settings > You ("Button sounds").
import { pref } from "./prefs";

let ctx: AudioContext | null = null;
let last = 0;

type Kind = "tap" | "open" | "start" | "stop" | "pick";
const TONES: Record<Kind, [number, number, number]> = {
  // [start Hz, end Hz, duration s]
  tap: [660, 520, 0.05],
  open: [520, 780, 0.08],
  start: [600, 900, 0.12],
  stop: [700, 420, 0.12],
  pick: [880, 990, 0.06],
};

export function playUiSound(kind: Kind = "tap"): void {
  if (!pref("uiSounds")) return;
  const now = performance.now();
  if (now - last < 60) return; // one sound per click, never a burst
  last = now;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const [f0, f1, dur] = TONES[kind];
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* no audio device: stay silent */ }
}

/** Which buttons click, and how. Kept short on purpose so sounds stay rare. */
const RULES: [string, Kind][] = [
  ["[data-sound=start]", "start"],
  ["[data-sound=stop]", "stop"],
  ["[data-sound=open]", "open"],
  ["[data-sound=pick]", "pick"],
  ["[data-sound]", "tap"],
  [".theme-tile, .swatch, .accent-dot", "pick"],
  [".settings-tab, .mnav-btn, .sheet-item, .ribbon button", "open"],
  [".media-tabs button, .amb-tile, .module-tile", "tap"],
];

/** Call once at startup. */
export function installUiSounds(): void {
  window.addEventListener("click", (e) => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest) return;
    for (const [sel, kind] of RULES) {
      if (el.closest(sel)) { playUiSound(kind); return; }
    }
  }, true);
}
