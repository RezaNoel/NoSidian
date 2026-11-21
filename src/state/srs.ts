// Spaced repetition: cards come from note text (see core/flashcards.ts for the
// syntax), review state lives in `.nosidian/srs.json` so notes stay clean.
import { createMemo, createRoot } from "solid-js";
import { extractFlashcardsAdvanced, updateCardLineInNote } from "../core/flashcards";
import { BUILTIN_PRESETS, DEFAULT_DECK_PRESET, getEndOfDayTs, isCardDue, isCardLockedByDependency, scheduleCardReview } from "../core/srs";
import type { DeckPreset, ExtractionOptions, Flashcard, FlashcardReviewLog, SRSCardState, SRSRating, StreakFreezeConfig } from "../core/types";
import { corpus } from "./corpus";
import { vaultDoc } from "./persist";
import { appendToNote, contents, ensureLoaded, setContent } from "./vault";

export interface SrsDoc {
  states: Record<string, SRSCardState>;
  logs: FlashcardReviewLog[];
  /** Deck key (folder path, `#tag` or note path) → preset id. */
  deckPresets: Record<string, string>;
  customPresets: DeckPreset[];
  defaultPreset: string;
  extraction: ExtractionOptions;
  freeze: StreakFreezeConfig;
  dailyGoal: number;
  cardsNote: string;
  typeAnswers: boolean;
  /** Cards per session (0 = no limit). */
  sessionLimit: number;
  /** Read the question aloud when a card appears. */
  readAloud: boolean;
}

export const srs = vaultDoc<SrsDoc>("srs", () => ({
  states: {},
  logs: [],
  deckPresets: {},
  customPresets: [],
  defaultPreset: DEFAULT_DECK_PRESET.id,
  extraction: { headers: false, bullets: false, tables: true },
  freeze: { freezeDaysPerWeek: 1, restWeekdays: [] },
  dailyGoal: 30,
  cardsNote: "Flashcards.md",
  typeAnswers: false,
  sessionLimit: 0,
  readAloud: false,
}));

const memo = createRoot(() => ({
  cards: createMemo<Flashcard[]>(() => extractFlashcardsAdvanced(corpus(), { ...srs.state.extraction })),
}));

/** Every card in the vault. */
export const allCards = memo.cards;
export const cardsPath = () => srs.state.cardsNote || "Flashcards.md";

export const presets = () => [...BUILTIN_PRESETS, ...srs.state.customPresets];
export function presetFor(deck: string): DeckPreset {
  const id = srs.state.deckPresets[deck] ?? srs.state.defaultPreset;
  return presets().find((p) => p.id === id) ?? DEFAULT_DECK_PRESET;
}

/** Decks: every folder that has cards plus every tag. */
export type DeckKey = string;
export function deckOf(card: Flashcard): DeckKey { return card.folder; }
export function cardsInDeck(deck: DeckKey | null, cards = allCards()): Flashcard[] {
  if (!deck) return cards;
  if (deck.startsWith("#")) return cards.filter((c) => c.tags.includes(deck.slice(1)));
  if (deck.toLowerCase().endsWith(".md")) return cards.filter((c) => c.sourcePath === deck);
  return cards.filter((c) => c.folder === deck || c.folder.startsWith(`${deck}/`));
}

export function stateOf(card: Flashcard): SRSCardState | undefined {
  return srs.state.states[card.id] ?? (card.inlineSrs?.dueAt ? (card.inlineSrs as SRSCardState) : undefined);
}

const startOfDay = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

export interface DeckCounts { total: number; due: number; fresh: number; learned: number; suspended: number }
export function countDeck(deck: DeckKey | null): DeckCounts {
  const out: DeckCounts = { total: 0, due: 0, fresh: 0, learned: 0, suspended: 0 };
  const eod = getEndOfDayTs();
  for (const c of cardsInDeck(deck)) {
    out.total++;
    const st = stateOf(c);
    if (st?.suspended) out.suspended++;
    else if (!st || st.reps === 0) out.fresh++;
    else { out.learned++; if (isCardDue(st, eod)) out.due++; }
  }
  return out;
}

/** Today's study queue for a deck: due reviews first (per preset order), then new cards up to the daily limit. */
export function buildQueue(deck: DeckKey | null, opts: { cram?: boolean } = {}): Flashcard[] {
  const preset = presetFor(deck ?? "");
  const cards = cardsInDeck(deck);
  if (opts.cram) return [...cards].sort(() => Math.random() - 0.5);
  const now = Date.now();
  const today = startOfDay(now);
  const reviewedToday = srs.state.logs.filter((l) => l.timestamp >= today && !l.cram);
  const newDone = new Set(reviewedToday.map((l) => l.cardId).filter((id) => (srs.state.states[id]?.reviewCount ?? 0) <= 1)).size;
  const all = allCards();
  const due: Flashcard[] = [];
  const fresh: Flashcard[] = [];
  const seenSiblings = new Set<string>();
  for (const c of cards) {
    const st = stateOf(c);
    if (st?.suspended || (st?.buriedUntil ?? 0) > now) continue;
    if (isCardLockedByDependency(c, all, srs.state.states).locked) continue;
    if (preset.burySiblings) {
      if (seenSiblings.has(c.siblingKey)) continue;
      seenSiblings.add(c.siblingKey);
    }
    if (!st || st.reps === 0) fresh.push(c);
    else if (isCardDue(st, now)) due.push(c);
  }
  due.sort((a, b) => (stateOf(a)!.dueAt - stateOf(b)!.dueAt));
  const reviews = due.slice(0, Math.max(0, preset.reviewsPerDay - (reviewedToday.length - newDone)));
  const news = fresh.slice(0, Math.max(0, preset.newPerDay - newDone));
  if (preset.order === "random") return [...reviews, ...news].sort(() => Math.random() - 0.5);
  if (preset.order === "new-first") return [...news, ...reviews];
  return [...reviews, ...news];
}

export interface ReviewUndo { cardId: string; prev: SRSCardState | undefined; logId: string }

export function review(card: Flashcard, rating: SRSRating, durationMs: number, cram = false): ReviewUndo {
  const preset = presetFor(deckOf(card));
  const prev = srs.state.states[card.id] ? (JSON.parse(JSON.stringify(srs.state.states[card.id])) as SRSCardState) : undefined;
  const logId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  srs.update((s) => {
    if (!cram) s.states[card.id] = scheduleCardReview(stateOf(card), card.id, rating, preset, Date.now(), s.states, durationMs);
    s.logs.push({ id: logId, cardId: card.id, deckKey: deckOf(card), tags: card.tags, timestamp: Date.now(), rating, durationMs, algorithm: preset.algorithm, cram });
    if (s.logs.length > 20000) s.logs.splice(0, s.logs.length - 20000);
  });
  return { cardId: card.id, prev, logId };
}

/** Take back the last rating: restore the card's schedule and drop the log entry. */
export function undoReview(u: ReviewUndo): void {
  srs.update((s) => {
    if (u.prev) s.states[u.cardId] = u.prev;
    else delete s.states[u.cardId];
    const i = s.logs.findIndex((l) => l.id === u.logId);
    if (i >= 0) s.logs.splice(i, 1);
  });
}

export type CardStage = "new" | "learning" | "young" | "mature" | "suspended";
/** Where a card is in its life: new, learning (under a day), young or mature (21+ days). */
export function stageOf(card: Flashcard): CardStage {
  const st = stateOf(card);
  if (st?.suspended) return "suspended";
  if (!st || st.reps === 0) return "new";
  if (st.intervalDays < 1) return "learning";
  return st.intervalDays >= 21 ? "mature" : "young";
}
export const isLeech = (card: Flashcard) => (stateOf(card)?.lapses ?? 0) >= 6 || !!stateOf(card)?.leech;

export function setCardFlag(card: Flashcard, flag: "suspended" | "buried", on: boolean): void {
  srs.update((s) => {
    const st = s.states[card.id] ?? scheduleBase(card);
    if (flag === "suspended") st.suspended = on;
    else st.buriedUntil = on ? getEndOfDayTs() : undefined;
    s.states[card.id] = st;
  });
}
function scheduleBase(card: Flashcard): SRSCardState {
  const now = Date.now();
  return { cardId: card.id, algorithm: "fsrs", reps: 0, lapses: 0, intervalDays: 0, ease: 2.5, stability: 0, difficulty: 5, dueAt: now, lastReviewedAt: 0, avgTimeMs: 0, reviewCount: 0, updatedAt: now };
}

export function resetCard(card: Flashcard): void {
  srs.update((s) => { delete s.states[card.id]; });
}

export type NewCardKind = "basic" | "both" | "cloze";
/** Add a card in the right syntax to a note (the cards note by default). */
export async function addCard(kind: NewCardKind, front: string, back: string, notePath = cardsPath()): Promise<void> {
  const one = (x: string) => x.replace(/\s*\n+\s*/g, " ").trim();
  const line = kind === "cloze" ? one(front) : `${one(front)} ${kind === "both" ? ":::" : "::"} ${one(back)}`;
  await appendToNote(notePath, line);
}

/** Change a card's question and answer in its note. */
export async function editCard(card: Flashcard, question: string, answer: string): Promise<boolean> {
  if (!["basic", "reversible", "multiline"].includes(card.kind)) return false;
  await ensureLoaded(card.sourcePath);
  const content = contents[card.sourcePath] ?? "";
  const next = updateCardLineInNote(content, card, question, answer);
  if (next === content) return false;
  setContent(card.sourcePath, next);
  return true;
}

/** Append a `question :: answer` card to the vault's cards note. */
export async function appendCard(question: string, answer: string): Promise<void> {
  const q = question.replace(/\n+/g, " ").trim();
  const a = answer.replace(/\n+/g, " ").trim();
  await appendToNote(cardsPath(), `${q} :: ${a}`);
}
