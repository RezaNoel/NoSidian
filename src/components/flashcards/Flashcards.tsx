// Flashcards: decks from folders and tags, spaced-repetition study (FSRS or
// SM-2) plus practice modes (cram, reverse, multiple choice), adding and
// editing cards without leaving the page, undo, read aloud, a session
// summary, a filterable card browser, statistics, deck presets and CSV/Anki
// import and export.
import { petEvent } from "../../state/petTalk";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import {
  BarChart3, Brain, CircleCheck, CircleX, Clock, Download, Ellipsis, EyeOff, FileText, GraduationCap, Layers, LayoutGrid, List, ListChecks,
  Pause, Pencil, Play, Plus, Repeat, RotateCcw, Settings2, Sparkles, Undo2, Upload, Volume2, Zap,
} from "lucide-solid";
import { locale, t, type MessageKey } from "../../i18n";
import { backend } from "../../backend";
import { renderMarkdown } from "../../lib/markdown";
import { computeContributionHeatmap, computeStreakWithFreeze, computeTrueRetention, computeWorkloadForecast, diffTypedAnswer, previewRatingIntervals } from "../../core/srs";
import { exportCardsToApkgBlob, exportCardsToCsv, importApkgArrayBuffer, importCsvToMarkdownNote } from "../../core/flashcards";
import type { Flashcard, SRSRating } from "../../core/types";
import {
  addCard, allCards, buildQueue, cardsInDeck, cardsPath, countDeck, editCard, isLeech, presetFor, presets, resetCard, review, setCardFlag, srs, stageOf,
  stateOf, undoReview, type CardStage, type NewCardKind, type ReviewUndo,
} from "../../state/srs";
import { loadAllNotes } from "../../state/corpus";
import { createNote, openNote } from "../../state/vault";
import { toast } from "../../state/ui";
import { announce } from "../../a11y/announcer";
import { revealLine } from "../Editor";
import { Modal } from "../Modal";
import { Toggle } from "../controls";
import { openMenu } from "../ContextMenu";
import { clearPendingStudy, pendingStudy } from "./study-state";

type Tab = "decks" | "study" | "browse" | "stats" | "settings";
type Mode = "review" | "cram" | "reverse" | "quiz";
const RATINGS: SRSRating[] = [1, 2, 3, 4];
const num = (n: number) => n.toLocaleString(locale());

function decks(): string[] {
  const set = new Set<string>();
  for (const c of allCards()) {
    set.add(c.folder);
    c.tags.forEach((tg) => set.add(`#${tg}`));
  }
  return [...set].sort((a, b) => (a.startsWith("#") === b.startsWith("#") ? a.localeCompare(b) : a.startsWith("#") ? 1 : -1));
}
const deckLabel = (d: string | null) => (d === null ? t("srs-all-cards") : d === "Root" ? t("srs-root-deck") : d.replace(/\.md$/i, ""));
const plain = (md: string) => md.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, "$1").replace(/[*_`#>[\]()!]/g, "").replace(/\s+/g, " ").trim();

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  if (/[؀-ۿ]/.test(text)) u.lang = "fa-IR";
  speechSynthesis.speak(u);
}

function CardFace(props: { card: Flashcard; side: "q" | "a"; flip?: boolean }) {
  const occ = () => props.card.occlusion;
  const side = () => (props.flip ? (props.side === "q" ? "a" : "q") : props.side);
  return (
    <Show when={occ()} fallback={<div class="card-face markdown-body" dir="auto" innerHTML={renderMarkdown(side() === "q" ? props.card.question : `${props.card.answer}${props.card.extra && !props.flip ? `\n\n---\n${props.card.extra}` : ""}`)} />}>
      <div class="occlusion">
        <img src={occ()!.data.imageSrc} alt={occ()!.data.title} />
        <For each={occ()!.data.boxes}>
          {(b) => {
            const active = b.id === occ()!.activeBoxId;
            const hidden = props.side === "q" ? active || occ()!.data.mode === "hide-all-guess-one" : false;
            return <span class="occ-box" classList={{ active, hidden }} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }} aria-hidden="true" />;
          }}
        </For>
      </div>
    </Show>
  );
}

// ---------- Adding and editing cards ----------

const [editor, setEditor] = createSignal<{ card?: Flashcard } | null>(null);
export const openCardEditor = (card?: Flashcard) => setEditor({ card });

function CardEditor() {
  const card = () => editor()?.card;
  const [kind, setKind] = createSignal<NewCardKind>("basic");
  const [front, setFront] = createSignal(card()?.question ?? "");
  const [back, setBack] = createSignal(card()?.answer ?? "");
  const [note, setNote] = createSignal(cardsPath());
  const notes = createMemo(() => [...new Set([cardsPath(), ...allCards().map((c) => c.sourcePath)])].sort());
  const save = async (again: boolean) => {
    if (!front().trim() || (kind() !== "cloze" && !back().trim())) return;
    if (card()) {
      if (await editCard(card()!, front(), back())) toast(t("srs-card-saved"));
      else toast(t("srs-card-edit-source"), true);
      setEditor(null);
      return;
    }
    await addCard(kind(), front(), back(), note());
    toast(t("srs-card-added"));
    if (again) { setFront(""); setBack(""); (document.querySelector(".card-editor textarea") as HTMLTextAreaElement | null)?.focus(); }
    else setEditor(null);
  };
  const wrapCloze = () => {
    const ta = document.querySelector<HTMLTextAreaElement>(".card-editor textarea");
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    if (a === b) return;
    const n = (value.match(/\{\{c(\d+)::/g) ?? []).length + 1;
    setFront(`${value.slice(0, a)}{{c${n}::${value.slice(a, b)}}}${value.slice(b)}`);
  };
  return (
    <Modal title={card() ? t("srs-edit-card") : t("srs-new-card")} onClose={() => setEditor(null)} class="card-editor">
      <form class="stack" onSubmit={(e) => { e.preventDefault(); void save(false); }} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(!card()); } }}>
        <Show when={!card()}>
          <div class="segmented" role="radiogroup" aria-label={t("srs-card-type")}>
            <For each={["basic", "both", "cloze"] as NewCardKind[]}>{(k) => <button type="button" role="radio" aria-checked={kind() === k} onClick={() => setKind(k)}>{t(`srs-kind-${k}` as MessageKey)}</button>}</For>
          </div>
        </Show>
        <label class="field"><span>{kind() === "cloze" ? t("srs-cloze-text") : t("srs-front")}</span>
          <textarea class="input" rows="3" dir="auto" value={front()} onInput={(e) => setFront(e.currentTarget.value)} autofocus />
        </label>
        <Show when={kind() === "cloze"} fallback={
          <label class="field"><span>{t("srs-back")}</span><textarea class="input" rows="3" dir="auto" value={back()} onInput={(e) => setBack(e.currentTarget.value)} /></label>
        }>
          <div class="row"><button type="button" class="btn sm" onClick={wrapCloze}>{t("srs-make-cloze")}</button><span class="muted sm">{t("srs-cloze-help")}</span></div>
        </Show>
        <Show when={!card()}>
          <label class="field"><span>{t("srs-save-in")}</span>
            <select class="select" value={note()} onChange={(e) => setNote(e.currentTarget.value)}>
              <For each={notes()}>{(n) => <option value={n}>{n.replace(/\.md$/i, "")}</option>}</For>
            </select>
          </label>
        </Show>
        <div class="row">
          <span class="tb-fill" />
          <Show when={!card()}><button type="button" class="btn" onClick={() => void save(true)}>{t("srs-save-add-another")}</button></Show>
          <button type="submit" class="btn primary">{t("action-save")}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Study ----------

interface Tally { 1: number; 2: number; 3: number; 4: number; ms: number; right: number; wrong: number }

function buildPractice(deck: string | null, mode: Mode): Flashcard[] {
  const base = mode === "review" ? buildQueue(deck) : [...cardsInDeck(deck)].filter((c) => !stateOf(c)?.suspended).sort(() => Math.random() - 0.5);
  const list = mode === "quiz" || mode === "reverse" ? base.filter((c) => !c.occlusion && c.answer.trim()) : base;
  const lim = srs.state.sessionLimit;
  return lim > 0 ? list.slice(0, lim) : list;
}

function Study(props: { deck: string | null; mode: Mode; onExit: () => void; onAgain: (m: Mode) => void }) {
  const [queue, setQueue] = createSignal<Flashcard[]>(buildPractice(props.deck, props.mode));
  const total = queue().length;
  const [shown, setShown] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [hint, setHint] = createSignal(false);
  const [picked, setPicked] = createSignal<number | null>(null);
  const [tally, setTally] = createSignal<Tally>({ 1: 0, 2: 0, 3: 0, 4: 0, ms: 0, right: 0, wrong: 0 });
  const [undo, setUndo] = createSignal<{ u: ReviewUndo | null; card: Flashcard; queue: Flashcard[]; tally: Tally } | null>(null);
  let started = performance.now();
  const card = () => queue()[0];
  const scheduled = props.mode === "review";
  const flip = props.mode === "reverse";
  const preview = createMemo(() => (card() && scheduled ? previewRatingIntervals(stateOf(card()!), card()!.id, presetFor(card()!.folder)) : null));
  const diff = createMemo(() => (shown() && srs.state.typeAnswers && typed() ? diffTypedAnswer(typed(), (flip ? card()?.question : card()?.answer) ?? "", { ignoreCase: true, ignorePunctuation: true, ignoreDiacritics: false }) : null));
  const done = () => tally()[1] + tally()[2] + tally()[3] + tally()[4] + tally().right + tally().wrong;
  // The companion cheers at the end of a session, or notes that nothing is due.
  createEffect(on(() => !card(), (empty) => { if (empty) petEvent(done() ? "cards-done" : "cards-none"); }));
  const options = createMemo(() => {
    const c = card();
    if (!c || props.mode !== "quiz") return [];
    const pool = [...new Set(cardsInDeck(props.deck).concat(allCards()).filter((x) => x.id !== c.id && x.answer.trim() && plain(x.answer) !== plain(c.answer)).map((x) => x.answer))];
    const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    return [c.answer, ...wrong].sort(() => Math.random() - 0.5);
  });

  const showCard = () => { if (srs.state.readAloud && card()) speak(flip ? card()!.answer : card()!.question); };
  onMount(showCard);
  const reveal = () => { setShown(true); announce(card()?.answer ?? ""); };
  const advance = (requeue: boolean) => {
    const c = card()!;
    setQueue((q) => { const rest = q.slice(1); if (requeue) rest.splice(Math.min(3, rest.length), 0, c); return rest; });
    setShown(false); setTyped(""); setHint(false); setPicked(null);
    started = performance.now();
    queueMicrotask(showCard);
  };
  const rate = (r: SRSRating) => {
    const c = card();
    if (!c || !shown()) return;
    const ms = performance.now() - started;
    const before = { queue: queue(), tally: tally() };
    const u = props.mode === "quiz" ? null : review(c, r, ms, !scheduled);
    setUndo({ u, card: c, ...before });
    window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "review-card" }));
    setTally((x) => ({ ...x, [r]: x[r] + 1, ms: x.ms + ms }));
    if (r === 4) petEvent("cards-easy");
    else if (r <= 2) petEvent("cards-hard");
    advance(r === 1);
  };
  const pick = (i: number) => {
    if (picked() !== null) return;
    const c = card()!;
    const ok = options()[i] === c.answer;
    setPicked(i);
    setShown(true);
    const ms = performance.now() - started;
    setUndo({ u: null, card: c, queue: queue(), tally: tally() });
    setTally((x) => ({ ...x, right: x.right + (ok ? 1 : 0), wrong: x.wrong + (ok ? 0 : 1), ms: x.ms + ms }));
    window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "review-card" }));
  };
  const doUndo = () => {
    const u = undo();
    if (!u) return;
    if (u.u) undoReview(u.u);
    setQueue(u.queue); setTally(u.tally); setUndo(null);
    setShown(false); setTyped(""); setPicked(null);
    toast(t("srs-undone"));
  };
  const key = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).matches("input, textarea")) { e.preventDefault(); doUndo(); return; }
    if ((e.target as HTMLElement).matches("input, textarea")) { if (e.key === "Enter" && !shown()) { e.preventDefault(); reveal(); } return; }
    if (props.mode === "quiz") {
      if (picked() === null && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); pick(Number(e.key) - 1); }
      else if (picked() !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); advance(false); }
    } else if ((e.key === " " || e.key === "Enter") && !shown()) { e.preventDefault(); reveal(); }
    else if (shown() && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); rate(Number(e.key) as SRSRating); }
    if (e.key === "Escape") props.onExit();
  };
  onMount(() => window.addEventListener("keydown", key));
  onCleanup(() => { window.removeEventListener("keydown", key); if ("speechSynthesis" in window) speechSynthesis.cancel(); });

  const accuracy = () => {
    const x = tally();
    const n = x[1] + x[2] + x[3] + x[4] + x.right + x.wrong;
    return n ? Math.round(((x[3] + x[4] + x.right) / n) * 100) : 0;
  };
  const modeLabel = () => t(`srs-mode-${props.mode}` as MessageKey);

  return (
    <div class="study">
      <header class="study-head">
        <div class="study-title">
          <strong dir="auto">{deckLabel(props.deck)}</strong>
          <span class="muted">{modeLabel()}</span>
        </div>
        <div class="study-progress" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={done()} aria-label={t("srs-progress", { done: done(), left: queue().length })}>
          <span style={{ width: `${total ? Math.min(100, (done() / Math.max(total, done() + queue().length)) * 100) : 0}%` }} />
        </div>
        <span class="muted sm">{t("srs-progress", { done: done(), left: queue().length })}</span>
        <button class="icon-btn sm" title={t("srs-undo")} aria-label={t("srs-undo")} disabled={!undo()} onClick={doUndo}><Undo2 /></button>
        <button class="btn sm" onClick={props.onExit}><Pause />{t("srs-end-session")}</button>
      </header>
      <Show when={card()} keyed fallback={
        <div class="study-summary card glass-soft">
          <CircleCheck class="study-summary-icon" aria-hidden="true" />
          <h2>{done() ? t("srs-session-done") : t("srs-nothing-due")}</h2>
          <Show when={done()}>
            <dl class="w-stats">
              <div><dt>{t("srs-sum-cards")}</dt><dd>{num(done())}</dd></div>
              <div><dt>{t("srs-sum-accuracy")}</dt><dd>{num(accuracy())}%</dd></div>
              <div><dt>{t("srs-sum-time")}</dt><dd>{num(Math.max(1, Math.round(tally().ms / 60000)))} {t("focus-min")}</dd></div>
              <div><dt>{t("srs-sum-again")}</dt><dd>{num(tally()[1] + tally().wrong)}</dd></div>
            </dl>
          </Show>
          <div class="row wrap center">
            <button class="btn primary" onClick={props.onExit}>{t("srs-back-to-decks")}</button>
            <Show when={cardsInDeck(props.deck).length}>
              <button class="btn" onClick={() => props.onAgain("quiz")}><ListChecks />{t("srs-mode-quiz")}</button>
              <button class="btn" onClick={() => props.onAgain("cram")}><Zap />{t("srs-mode-cram")}</button>
            </Show>
          </div>
        </div>
      }>
        {(c) => (
          <div class="study-card glass-soft" aria-live="polite">
            <div class="study-card-top">
              <p class="muted sm" dir="auto">{c.context}</p>
              <span class="tb-fill" />
              <Show when={isLeech(c)}><span class="badge warn" title={t("srs-leech-hint")}>{t("srs-leech")}</span></Show>
              <button class="icon-btn sm ghost" title={t("srs-read-aloud")} aria-label={t("srs-read-aloud")} onClick={() => speak(shown() ? (flip ? c.question : c.answer) : (flip ? c.answer : c.question))}><Volume2 /></button>
              <button class="icon-btn sm ghost" title={t("srs-edit-card")} aria-label={t("srs-edit-card")} onClick={() => openCardEditor(c)}><Pencil /></button>
              <button class="icon-btn sm ghost" title={t("more-actions")} aria-label={t("more-actions")} onClick={(e) => openMenu(e, [
                { label: t("srs-open-source"), icon: <FileText />, run: () => { openNote(c.sourcePath); revealLine(c.sourcePath, Math.max(0, c.lineNumber - 1)); } },
                { label: t("srs-bury"), icon: <EyeOff />, run: () => { setCardFlag(c, "buried", true); advance(false); } },
                { label: t("srs-suspend"), icon: <Pause />, run: () => { setCardFlag(c, "suspended", true); advance(false); } },
              ])}><Ellipsis /></button>
            </div>
            <CardFace card={c} side="q" flip={flip} />
            <Show when={c.hint && !shown()}>
              <button class="btn sm ghost" onClick={() => setHint(true)}>{t("srs-hint")}</button>
              <Show when={hint()}><p class="hint" dir="auto">{c.hint}</p></Show>
            </Show>
            <Switch>
              <Match when={props.mode === "quiz"}>
                <div class="quiz-options" role="group" aria-label={t("srs-pick-answer")}>
                  <For each={options()}>
                    {(o, i) => {
                      const correct = () => picked() !== null && o === c.answer;
                      const wrongPick = () => picked() === i() && o !== c.answer;
                      return (
                        <button class="quiz-option" classList={{ correct: correct(), wrong: wrongPick() }} disabled={picked() !== null} onClick={() => pick(i())}>
                          <kbd>{num(i() + 1)}</kbd>
                          <span class="markdown-body" dir="auto" innerHTML={renderMarkdown(o)} />
                          <Show when={correct()}><CircleCheck aria-hidden="true" /></Show>
                          <Show when={wrongPick()}><CircleX aria-hidden="true" /></Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
                <Show when={picked() !== null}><button class="btn primary block" onClick={() => advance(false)}>{t("srs-next-card")}</button></Show>
              </Match>
              <Match when={true}>
                <Show when={srs.state.typeAnswers && !c.occlusion}>
                  <input class="input" dir="auto" placeholder={t("srs-type-answer")} aria-label={t("srs-type-answer")} value={typed()} disabled={shown()} onInput={(e) => setTyped(e.currentTarget.value)} />
                </Show>
                <Show when={shown()} fallback={<button class="btn primary block" onClick={reveal}>{t("srs-show-answer")} <kbd>Space</kbd></button>}>
                  <hr />
                  <Show when={diff()}>
                    <p class="typed-diff" aria-label={t("srs-accuracy", { pct: Math.round(diff()!.accuracy) })}>
                      <For each={diff()!.segments}>{(s) => <span class={`seg-${s.status}`}>{s.text}</span>}</For>
                      <span class="muted"> · {Math.round(diff()!.accuracy)}%</span>
                    </p>
                  </Show>
                  <CardFace card={c} side="a" flip={flip} />
                  <div class="ratings" role="group" aria-label={t("srs-rate")}>
                    <For each={RATINGS}>
                      {(r) => (
                        <button class={`btn rate-${r}`} onClick={() => rate(r)} aria-keyshortcuts={String(r)}>
                          <span>{t(`srs-rating-${r}`)}</span>
                          <small>{scheduled ? preview()?.[r] : num(r)}</small>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </div>
  );
}

// ---------- Browse ----------

type Filter = "all" | CardStage | "due" | "leech";
const FILTERS: Filter[] = ["all", "due", "new", "learning", "young", "mature", "suspended", "leech"];

function Browse() {
  const [q, setQ] = createSignal("");
  const [filter, setFilter] = createSignal<Filter>("all");
  const [deck, setDeck] = createSignal<string>("");
  const list = createMemo(() => {
    const s = q().trim().toLowerCase();
    const now = Date.now();
    const f = filter();
    return (deck() ? cardsInDeck(deck()) : allCards())
      .filter((c) => !s || c.question.toLowerCase().includes(s) || c.answer.toLowerCase().includes(s) || c.sourcePath.toLowerCase().includes(s))
      .filter((c) => f === "all" || (f === "due" ? (stateOf(c)?.reps ?? 0) > 0 && !stateOf(c)?.suspended && stateOf(c)!.dueAt <= now : f === "leech" ? isLeech(c) : stageOf(c) === f))
      .slice(0, 500);
  });
  const dueText = (c: Flashcard) => {
    const st = stateOf(c);
    if (st?.suspended) return t("srs-suspended");
    if (!st?.reps) return t("srs-new");
    return new Date(st.dueAt).toLocaleDateString(locale(), { month: "short", day: "numeric" });
  };
  return (
    <div class="stack">
      <div class="browse-bar">
        <input class="input" type="search" placeholder={t("srs-search")} aria-label={t("srs-search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <select class="select" aria-label={t("srs-deck")} value={deck()} onChange={(e) => setDeck(e.currentTarget.value)}>
          <option value="">{t("srs-all-cards")}</option>
          <For each={decks()}>{(d) => <option value={d}>{deckLabel(d)}</option>}</For>
        </select>
      </div>
      <div class="chip-row" role="radiogroup" aria-label={t("srs-filter")}>
        <For each={FILTERS}>{(f) => <button class="chip" role="radio" aria-checked={filter() === f} onClick={() => setFilter(f)}>{t(`srs-filter-${f}` as MessageKey)}</button>}</For>
      </div>
      <p class="muted sm">{t("srs-browse-count", { count: list().length })}</p>
      <ul class="card-list">
        <For each={list()}>
          {(c) => {
            const st = () => stateOf(c);
            return (
              <li class="card-row" classList={{ muted: !!st()?.suspended }} onContextMenu={(e) => { e.preventDefault(); openMenu(e, [
                { label: t("srs-edit-card"), icon: <Pencil />, run: () => openCardEditor(c) },
                { label: t("srs-open-source"), icon: <FileText />, run: () => { openNote(c.sourcePath); revealLine(c.sourcePath, Math.max(0, c.lineNumber - 1)); } },
                { label: st()?.suspended ? t("srs-unsuspend") : t("srs-suspend"), icon: <Pause />, run: () => setCardFlag(c, "suspended", !st()?.suspended) },
                { label: t("srs-reset"), icon: <RotateCcw />, run: () => resetCard(c) },
              ]); }}>
                <span class={`stage-dot st-${stageOf(c)}`} title={t(`srs-filter-${stageOf(c)}` as MessageKey)} aria-hidden="true" />
                <div class="card-row-text">
                  <span class="card-row-q" dir="auto">{plain(c.question).slice(0, 140)}</span>
                  <span class="card-row-a" dir="auto">{plain(c.answer).slice(0, 140)}</span>
                </div>
                <span class="card-row-meta" title={st()?.reps ? t("srs-card-stats", { reps: st()!.reps, lapses: st()!.lapses }) : undefined}>{dueText(c)}</span>
                <button class="icon-btn sm" title={t("srs-edit-card")} aria-label={t("srs-edit-card")} onClick={() => openCardEditor(c)}><Pencil /></button>
                <button class="icon-btn sm" aria-pressed={!!st()?.suspended} title={st()?.suspended ? t("srs-unsuspend") : t("srs-suspend")} aria-label={t("srs-suspend")} onClick={() => setCardFlag(c, "suspended", !st()?.suspended)}><Pause /></button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

// ---------- Statistics ----------

function Stats() {
  const heat = createMemo(() => computeContributionHeatmap(srs.state.logs.map((l) => ({ ...l })), 140));
  const streak = createMemo(() => computeStreakWithFreeze(srs.state.logs.map((l) => ({ ...l })), { ...srs.state.freeze, restWeekdays: [...srs.state.freeze.restWeekdays] }));
  const retention = createMemo(() => computeTrueRetention(srs.state.logs.map((l) => ({ ...l }))));
  const forecast = createMemo(() => computeWorkloadForecast(allCards(), JSON.parse(JSON.stringify(srs.state.states)), 30));
  const peak = () => Math.max(1, ...forecast().map((f) => f.count));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return srs.state.logs.filter((l) => l.timestamp >= d.getTime()).length; };
  const stages = createMemo(() => {
    const out: Record<CardStage, number> = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
    for (const c of allCards()) out[stageOf(c)]++;
    return out;
  });
  const recent = createMemo(() => srs.state.logs.filter((l) => l.timestamp > Date.now() - 30 * 86_400_000));
  const ratings = createMemo(() => { const r = [0, 0, 0, 0]; for (const l of recent()) r[l.rating - 1]++; return r; });
  const avgSec = () => (recent().length ? Math.round(recent().reduce((n, l) => n + l.durationMs, 0) / recent().length / 1000) : 0);
  const totalCards = () => Math.max(1, allCards().length);
  const STAGES: CardStage[] = ["new", "learning", "young", "mature", "suspended"];
  return (
    <div class="stats-grid">
      <dl class="w-stats stats-wide">
        <div><dt><Clock aria-hidden="true" />{t("srs-stat-today")}</dt><dd>{num(today())} / {num(srs.state.dailyGoal)}</dd></div>
        <div><dt><Sparkles aria-hidden="true" />{t("srs-stat-streak")}</dt><dd>{num(streak().currentStreak)}</dd></div>
        <div><dt><Repeat aria-hidden="true" />{t("srs-stat-longest")}</dt><dd>{num(streak().longestStreak)}</dd></div>
        <div><dt><CircleCheck aria-hidden="true" />{t("srs-stat-retention")}</dt><dd>{retention().total ? `${num(retention().rate)}%` : "—"}</dd></div>
        <div><dt><Clock aria-hidden="true" />{t("srs-stat-avg-time")}</dt><dd>{avgSec() ? t("srs-seconds", { n: avgSec() }) : "—"}</dd></div>
      </dl>
      <section class="card glass-soft">
        <h3 class="section-title">{t("srs-stat-stages")}</h3>
        <div class="stage-bar" role="img" aria-label={STAGES.map((s) => `${t(`srs-filter-${s}` as MessageKey)}: ${stages()[s]}`).join(", ")}>
          <For each={STAGES}>{(s) => <span class={`st-${s}`} style={{ width: `${(stages()[s] / totalCards()) * 100}%` }} />}</For>
        </div>
        <ul class="stage-legend">
          <For each={STAGES}>{(s) => <li><span class={`stage-dot st-${s}`} aria-hidden="true" />{t(`srs-filter-${s}` as MessageKey)} <strong>{num(stages()[s])}</strong></li>}</For>
        </ul>
      </section>
      <section class="card glass-soft">
        <h3 class="section-title">{t("srs-stat-answers")}</h3>
        <div class="rating-bars">
          <For each={RATINGS}>{(r) => (
            <div class={`rating-bar rate-${r}`}>
              <span>{t(`srs-rating-${r}`)}</span>
              <div class="meter"><span style={{ width: `${(ratings()[r - 1] / Math.max(1, recent().length)) * 100}%` }} /></div>
              <strong>{num(ratings()[r - 1])}</strong>
            </div>
          )}</For>
        </div>
      </section>
      <section class="card glass-soft stats-wide">
        <h3 class="section-title">{t("srs-heatmap")}</h3>
        <div class="heatmap" role="img" aria-label={t("srs-heatmap")}>
          <For each={heat()}>{(d) => <span class={`hm l${d.level}`} title={`${d.date}: ${d.count}`} />}</For>
        </div>
      </section>
      <section class="card glass-soft stats-wide">
        <h3 class="section-title">{t("srs-forecast")}</h3>
        <div class="bars" role="img" aria-label={t("srs-forecast")}>
          <For each={forecast()}>{(f) => <span class="bar" style={{ height: `${(f.count / peak()) * 100}%` }} title={`${f.label}: ${f.count}`} />}</For>
        </div>
      </section>
    </div>
  );
}

// ---------- Settings ----------

function Settings() {
  const exportCsv = async () => { if (await backend.saveText("flashcards.csv", exportCardsToCsv(allCards()), "csv")) toast(t("export-done")); };
  const exportApkg = async () => {
    const blob = await exportCardsToApkgBlob(allCards(), "NoSidian");
    if (await backend.saveBytes("NoSidian.apkg", new Uint8Array(await blob.arrayBuffer()), "apkg")) toast(t("export-done"));
  };
  const importFile = (kind: "csv" | "apkg") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "csv" ? ".csv,text/csv" : ".apkg,.zip";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        if (kind === "csv") {
          const name = f.name.replace(/\.csv$/i, "");
          await createNote(name, "Flashcards", importCsvToMarkdownNote(await f.text(), name));
        } else {
          const r = await importApkgArrayBuffer(await f.arrayBuffer());
          await createNote(r.deckName, "Flashcards", r.markdown);
          toast(t("import-done", { count: r.count }));
        }
      } catch { toast(t("srs-import-failed"), true); }
    };
    input.click();
  };
  return (
    <div class="stack settings-form">
      <label class="field"><span>{t("srs-default-preset")}</span>
        <select class="select" value={srs.state.defaultPreset} onChange={(e) => { const v = e.currentTarget.value; srs.update((s) => { s.defaultPreset = v; }); }}>
          <For each={presets()}>{(p) => <option value={p.id}>{t(`srs-preset-${p.id}` as "srs-preset-default")} · {p.algorithm.toUpperCase()}</option>}</For>
        </select>
      </label>
      <Show when={decks().filter((d) => !d.startsWith("#")).length > 1}>
        <h3 class="section-title">{t("srs-deck-presets")}</h3>
        <For each={decks().filter((d) => !d.startsWith("#"))}>
          {(d) => (
            <label class="field inline"><span dir="auto">{deckLabel(d)}</span>
              <select class="select sm" value={srs.state.deckPresets[d] ?? ""} onChange={(e) => { const v = e.currentTarget.value; srs.update((s) => { if (v) s.deckPresets[d] = v; else delete s.deckPresets[d]; }); }}>
                <option value="">{t("srs-use-default")}</option>
                <For each={presets()}>{(p) => <option value={p.id}>{t(`srs-preset-${p.id}` as "srs-preset-default")}</option>}</For>
              </select>
            </label>
          )}
        </For>
      </Show>
      <label class="field inline"><span>{t("srs-daily-goal")}</span><input class="input sm num" type="number" min="5" max="1000" value={srs.state.dailyGoal} onChange={(e) => { const v = Number(e.currentTarget.value) || 30; srs.update((s) => { s.dailyGoal = v; }); }} /></label>
      <label class="field inline"><span>{t("srs-session-limit")}</span>
        <select class="select sm" value={String(srs.state.sessionLimit)} onChange={(e) => { const v = Number(e.currentTarget.value); srs.update((s) => { s.sessionLimit = v; }); }}>
          <For each={[0, 10, 20, 30, 50, 100]}>{(n) => <option value={n}>{n ? num(n) : t("srs-no-limit")}</option>}</For>
        </select>
      </label>
      <label class="field inline"><span>{t("srs-cards-note")}</span><input class="input sm" value={srs.state.cardsNote} onChange={(e) => { const v = e.currentTarget.value.trim() || "Flashcards.md"; srs.update((s) => { s.cardsNote = v.endsWith(".md") ? v : `${v}.md`; }); }} /></label>
      <Toggle label={t("srs-type-answers")} checked={srs.state.typeAnswers} onChange={(v) => srs.update((s) => { s.typeAnswers = v; })} />
      <Toggle label={t("srs-read-aloud-auto")} checked={srs.state.readAloud} onChange={(v) => srs.update((s) => { s.readAloud = v; })} />
      <h3 class="section-title">{t("srs-extract")}</h3>
      <Toggle label={t("srs-extract-headers")} checked={srs.state.extraction.headers} onChange={(v) => srs.update((s) => { s.extraction.headers = v; })} />
      <Toggle label={t("srs-extract-bullets")} checked={srs.state.extraction.bullets} onChange={(v) => srs.update((s) => { s.extraction.bullets = v; })} />
      <Toggle label={t("srs-extract-tables")} checked={srs.state.extraction.tables} onChange={(v) => srs.update((s) => { s.extraction.tables = v; })} />
      <p class="muted sm">{t("srs-syntax-help")}</p>
      <h3 class="section-title">{t("srs-import-export")}</h3>
      <div class="row wrap">
        <button class="btn sm" onClick={() => void exportCsv()}><Download />CSV</button>
        <button class="btn sm" onClick={() => void exportApkg()}><Download />Anki (.apkg)</button>
        <button class="btn sm" onClick={() => importFile("csv")}><Upload />{t("srs-import-csv")}</button>
        <button class="btn sm" onClick={() => importFile("apkg")}><Upload />{t("srs-import-apkg")}</button>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function Flashcards() {
  const [tab, setTab] = createSignal<Tab>("decks");
  const [deck, setDeck] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<Mode>("review");
  const [session, setSession] = createSignal(0);
  onMount(async () => {
    await loadAllNotes();
    const p = pendingStudy();
    if (p !== undefined) { study(p, "review"); clearPendingStudy(); }
  });
  const study = (d: string | null, m: Mode = "review") => { setDeck(d); setMode(m); setSession((n) => n + 1); setTab("study"); };
  const TABS: { id: Tab; icon: typeof Brain }[] = [
    { id: "decks", icon: LayoutGrid }, { id: "study", icon: GraduationCap }, { id: "browse", icon: List }, { id: "stats", icon: BarChart3 }, { id: "settings", icon: Settings2 },
  ];
  const reviewedToday = createMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return srs.state.logs.filter((l) => l.timestamp >= d.getTime() && !l.cram).length; });
  return (
    <div class="flashcards page">
      <header class="page-head">
        <h1>{t("view-flashcards")}</h1>
        <div class="segmented" role="tablist">
          <For each={TABS}>{(x) => <button role="tab" aria-selected={tab() === x.id} title={t(`srs-tab-${x.id}`)} onClick={() => setTab(x.id)}><x.icon aria-hidden="true" /><span class="seg-label">{t(`srs-tab-${x.id}`)}</span></button>}</For>
        </div>
        <button class="btn primary" onClick={() => openCardEditor()}><Plus />{t("srs-new-card")}</button>
      </header>
      <Switch>
        <Match when={tab() === "decks"}>
          <Show when={allCards().length} fallback={<div class="empty-state"><Brain /><p>{t("srs-no-cards")}</p><p class="muted">{t("srs-syntax-help")}</p><button class="btn primary" onClick={() => openCardEditor()}><Plus />{t("srs-new-card")}</button></div>}>
            <div class="goal-strip">
              <Clock aria-hidden="true" />
              <span>{t("srs-goal-today", { done: reviewedToday(), goal: srs.state.dailyGoal })}</span>
              <div class="meter"><span style={{ width: `${Math.min(100, (reviewedToday() / Math.max(1, srs.state.dailyGoal)) * 100)}%` }} /></div>
            </div>
            <div class="deck-grid">
              <For each={[null, ...decks()]}>
                {(d) => {
                  const c = createMemo(() => countDeck(d));
                  const more = (e: MouseEvent) => openMenu(e, [
                    { label: t("srs-mode-cram"), icon: <Zap />, run: () => study(d, "cram") },
                    { label: t("srs-mode-reverse"), icon: <Repeat />, run: () => study(d, "reverse") },
                    { label: t("srs-mode-quiz"), icon: <ListChecks />, run: () => study(d, "quiz") },
                  ]);
                  return (
                    <article class="deck card glass-soft" onContextMenu={(e) => { e.preventDefault(); more(e); }}>
                      <div class="deck-head">
                        <Layers aria-hidden="true" />
                        <h3 dir="auto">{deckLabel(d)}</h3>
                      </div>
                      <div class="deck-counts">
                        <span class="dc due" title={t("srs-filter-due")}><Clock aria-hidden="true" />{num(c().due)}</span>
                        <span class="dc fresh" title={t("srs-filter-new")}><Sparkles aria-hidden="true" />{num(c().fresh)}</span>
                        <span class="dc" title={t("srs-total")}><Layers aria-hidden="true" />{num(c().total)}</span>
                      </div>
                      <div class="row">
                        <button class="btn sm primary" disabled={!c().due && !c().fresh} onClick={() => study(d)}><Play />{t("srs-study")}</button>
                        <button class="icon-btn sm" title={t("srs-practice")} aria-label={t("srs-practice")} disabled={!cardsInDeck(d).length} onClick={more}><Ellipsis /></button>
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
          </Show>
        </Match>
        <Match when={tab() === "study"}>
          <Show when={session()} keyed>
            {(_s) => <Study deck={deck()} mode={mode()} onExit={() => setTab("decks")} onAgain={(m) => study(deck(), m)} />}
          </Show>
          <Show when={!session()}>
            <div class="empty-state"><GraduationCap /><p>{t("srs-pick-deck")}</p><button class="btn primary" onClick={() => study(null)}><Play />{t("srs-study-all")}</button></div>
          </Show>
        </Match>
        <Match when={tab() === "browse"}><Browse /></Match>
        <Match when={tab() === "stats"}><Stats /></Match>
        <Match when={tab() === "settings"}><Settings /></Match>
      </Switch>
      <Show when={editor()} keyed>{(_e) => <CardEditor />}</Show>
    </div>
  );
}
