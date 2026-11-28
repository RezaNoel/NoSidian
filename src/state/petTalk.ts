// The companion's own voice: a welcome line when the app opens, short
// reactions to things you do, and the odd remark of its own (bored, sleepy,
// hungry, woke up, busy). Lines never repeat until a category is used up,
// and event reactions are rate limited so the pet stays charming, not chatty.
import { createRoot, createSignal } from "solid-js";
import { t } from "../i18n";
import { appDoc } from "./persist";
import { pref } from "./prefs";
import { settings } from "./settings";
import { personal, isBirthday } from "./personal";
import { pet } from "./pet";

/** How many lines each category has (keys `pt-<cat>-<n>`, 1-based). */
const LINES = {
  "welcome-morning": 6, "welcome-afternoon": 6, "welcome-evening": 6, "welcome-night": 6, "welcome-named": 6, "welcome-back": 4,
  bored: 6, sleepy: 5, hungry: 5, woke: 4, busy: 4,
  note: 5, folder: 4, time30: 3, time60: 3, time120: 3,
  "cards-easy": 4, "cards-hard": 4, "cards-done": 4, "cards-none": 3,
  "todo-added": 4, "todo-done": 5, "project-new": 4, "project-done": 4, theme: 6, "focus-done": 4,
} as const;
export type TalkCategory = keyof typeof LINES;
/** Things that happen in the app that the pet can react to. */
export type TalkEvent = "note" | "folder" | "cards-easy" | "cards-hard" | "cards-done" | "cards-none" | "todo-added" | "todo-done" | "project-new" | "project-done" | "theme" | "focus-done";

interface TalkMemory { used: Partial<Record<TalkCategory, number[]>>; lastSeen: number }
const memory = appDoc<TalkMemory>("pet-talk", () => ({ used: {}, lastSeen: 0 }));

const ui = createRoot(() => {
  const [line, setLine] = createSignal<{ id: number; text: string } | null>(null);
  return { line, setLine };
});
/** The line the pet is saying right now, if any. */
export const petLine = ui.line;
export const dismissPetLine = () => ui.setLine(null);

const enabled = () => settings.petEnabled && pref("petTalk");

/** Pick a line from a category that hasn't been said yet; start over when all are used. */
export function pickLine(cat: TalkCategory, rnd = Math.random): number {
  const all = Array.from({ length: LINES[cat] }, (_, i) => i + 1);
  let used = memory.state.used[cat] ?? [];
  let free = all.filter((n) => !used.includes(n));
  // All used: start over, but never repeat the very last one.
  if (!free.length) {
    const last = used[used.length - 1];
    free = all.filter((n) => n !== last);
    used = [];
  }
  const n = free[Math.floor(rnd() * free.length)] ?? 1;
  memory.update((m) => { m.used[cat] = [...used, n]; });
  return n;
}

let seq = 0;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
function show(text: string) {
  const id = ++seq;
  ui.setLine({ id, text });
  clearTimeout(hideTimer);
  // Long enough to read: about 4 words a second, between 4 and 9 seconds.
  const ms = Math.max(4000, Math.min(9000, text.split(/\s+/).length * 260 + 2200));
  hideTimer = setTimeout(() => { if (ui.line()?.id === id) ui.setLine(null); }, ms);
}

function say(cat: TalkCategory, vars?: Record<string, string>) {
  const n = pickLine(cat);
  show(t(`pt-${cat}-${n}` as "pt-welcome-named-1", vars as { name: string }));
}

// ---------- Rate limits ----------
const MIN_GAP = 2 * 60_000; // between any two unprompted lines
const CATEGORY_COOLDOWN = 12 * 60_000; // before the same kind of reaction again
const HOURLY_CAP = 8;
let lastSpoke = 0;
const lastByCat = new Map<TalkCategory, number>();
const recent: number[] = [];

function allowed(cat: TalkCategory, now: number): boolean {
  if (!enabled()) return false;
  if (document.visibilityState === "hidden") return false;
  if (now - lastSpoke < MIN_GAP) return false;
  if (now - (lastByCat.get(cat) ?? 0) < CATEGORY_COOLDOWN) return false;
  while (recent.length && now - recent[0] > 3_600_000) recent.shift();
  return recent.length < HOURLY_CAP;
}
function spoke(cat: TalkCategory, now: number) {
  lastSpoke = now;
  lastByCat.set(cat, now);
  recent.push(now);
}

/** React to something that happened, if the pet hasn't talked too much lately. */
export function petEvent(kind: TalkEvent): void {
  const now = Date.now();
  if (!allowed(kind, now)) return;
  // Not every small thing needs a comment: frequent events speak up some of the time.
  const chance: Partial<Record<TalkEvent, number>> = { note: 0.5, "todo-added": 0.5, "todo-done": 0.6, "cards-easy": 0.35, "cards-hard": 0.35 };
  if (Math.random() > (chance[kind] ?? 1)) return;
  spoke(kind, now);
  say(kind);
}

// ---------- Welcome ----------
let welcomed = false;
/** The pet's welcome line, once per launch. Returns the text it said. */
export function petWelcome(): string | null {
  if (welcomed || !enabled()) return null;
  welcomed = true;
  const now = Date.now();
  const away = memory.state.lastSeen ? now - memory.state.lastSeen : 0;
  const name = personal.state.name.trim();
  let text: string;
  if (isBirthday(new Date())) text = name ? t("greet-birthday-name", { name }) : t("greet-birthday");
  else if (away > 3 * 86_400_000) text = t(`pt-welcome-back-${pickLine("welcome-back")}` as "pt-welcome-back-1");
  else if (name && Math.random() < 0.4) text = t(`pt-welcome-named-${pickLine("welcome-named")}` as "pt-welcome-named-1", { name });
  else {
    const h = new Date().getHours();
    const part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : h < 22 ? "evening" : "night";
    const cat = `welcome-${part}` as TalkCategory;
    text = t(`pt-${cat}-${pickLine(cat)}` as "pt-welcome-morning-1");
  }
  show(text);
  lastSpoke = now;
  return text;
}

// ---------- Its own moods ----------
let lastInput = Date.now();
let boredThisIdle = false;
let keys: number[] = [];
let visibleMs = 0;
let hiddenAt = 0;
const saidTime = new Set<number>();

function tick() {
  const now = Date.now();
  memory.update((m) => { m.lastSeen = now; });
  if (document.visibilityState !== "visible") return;
  visibleMs += 60_000;
  // Time spent in the app.
  for (const [mins, cat] of [[30, "time30"], [60, "time60"], [120, "time120"]] as const) {
    if (visibleMs >= mins * 60_000 && !saidTime.has(mins)) {
      saidTime.add(mins);
      if (allowed(cat, now)) { spoke(cat, now); say(cat); }
      return;
    }
  }
  const idle = now - lastInput;
  const h = new Date().getHours();
  if (idle > 12 * 60_000 && !boredThisIdle) {
    boredThisIdle = true;
    const cat: TalkCategory = h < 5 || pet.state.energy < 25 ? "sleepy" : "bored";
    if (allowed(cat, now)) { spoke(cat, now); say(cat); }
    return;
  }
  if (pet.state.hunger < 30 && allowed("hungry", now) && Math.random() < 0.25) { spoke("hungry", now); say("hungry"); return; }
  keys = keys.filter((k) => now - k < 10 * 60_000);
  if (keys.length > 1800 && allowed("busy", now)) { spoke("busy", now); lastByCat.set("busy", now + 50 * 60_000); say("busy"); }
}

let started = false;
/** Start listening for activity. Safe to call more than once. */
export function startPetTalk(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const input = () => { lastInput = Date.now(); boredThisIdle = false; };
  window.addEventListener("pointerdown", input, true);
  window.addEventListener("keydown", () => { input(); keys.push(Date.now()); }, true);
  document.addEventListener("visibilitychange", () => {
    const now = Date.now();
    if (document.visibilityState === "hidden") hiddenAt = now;
    else if (hiddenAt && now - hiddenAt > 30 * 60_000 && allowed("woke", now)) { spoke("woke", now); say("woke"); }
  });
  window.addEventListener("nosidian:activity", (e) => {
    const kind = (e as CustomEvent<string>).detail;
    if (kind === "create-note") petEvent("note");
    if (kind === "complete-task") petEvent("todo-done");
  });
  // Modules that can't import this one (to avoid cycles) send their events here.
  window.addEventListener("nosidian:talk", (e) => petEvent((e as CustomEvent<TalkEvent>).detail));
  setInterval(tick, 60_000);
}
