// Flashcards: decks from folders and tags, a study session with FSRS/SM-2
// scheduling, typed answers, cram mode, a card browser, statistics, deck
// presets and CSV/Anki import and export.
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Brain, Download, EyeOff, FileText, Pause, RotateCcw, Upload } from "lucide-solid";
import { t } from "../../i18n";
import { backend } from "../../backend";
import { renderMarkdown } from "../../lib/markdown";
import { computeContributionHeatmap, computeStreakWithFreeze, computeTrueRetention, computeWorkloadForecast, diffTypedAnswer, previewRatingIntervals } from "../../core/srs";
import { exportCardsToApkgBlob, exportCardsToCsv, importApkgArrayBuffer, importCsvToMarkdownNote } from "../../core/flashcards";
import type { Flashcard, SRSRating } from "../../core/types";
import { allCards, buildQueue, cardsInDeck, countDeck, presetFor, presets, resetCard, review, setCardFlag, srs, stateOf } from "../../state/srs";
import { loadAllNotes } from "../../state/corpus";
import { createNote, openNote } from "../../state/vault";
import { toast } from "../../state/ui";
import { announce } from "../../a11y/announcer";
import { revealLine } from "../Editor";
import { clearPendingStudy, pendingStudy } from "./study-state";

type Tab = "decks" | "study" | "browse" | "stats" | "settings";
const RATINGS: SRSRating[] = [1, 2, 3, 4];

function decks(): string[] {
  const set = new Set<string>();
  for (const c of allCards()) {
    set.add(c.folder);
    c.tags.forEach((tg) => set.add(`#${tg}`));
  }
  return [...set].sort((a, b) => (a.startsWith("#") === b.startsWith("#") ? a.localeCompare(b) : a.startsWith("#") ? 1 : -1));
}
const deckLabel = (d: string | null) => (d === null ? t("srs-all-cards") : d === "Root" ? t("srs-root-deck") : d.replace(/\.md$/i, ""));

function CardFace(props: { card: Flashcard; side: "q" | "a" }) {
  const occ = () => props.card.occlusion;
  return (
    <Show when={occ()} fallback={<div class="card-face markdown-body" dir="auto" innerHTML={renderMarkdown(props.side === "q" ? props.card.question : `${props.card.answer}${props.card.extra ? `\n\n---\n${props.card.extra}` : ""}`)} />}>
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

function Study(props: { deck: string | null; cram: boolean; onExit: () => void }) {
  const [queue, setQueue] = createSignal<Flashcard[]>(buildQueue(props.deck, { cram: props.cram }));
  const [shown, setShown] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [done, setDone] = createSignal(0);
  const [hint, setHint] = createSignal(false);
  let started = performance.now();
  const card = () => queue()[0];
  const preview = createMemo(() => (card() ? previewRatingIntervals(stateOf(card()!), card()!.id, presetFor(card()!.folder)) : null));
  const diff = createMemo(() => (shown() && srs.state.typeAnswers && typed() ? diffTypedAnswer(typed(), card()?.answer ?? "", { ignoreCase: true, ignorePunctuation: true, ignoreDiacritics: false }) : null));

  const reveal = () => { setShown(true); announce(card()?.answer ?? ""); };
  const rate = (r: SRSRating) => {
    const c = card();
    if (!c || !shown()) return;
    review(c, r, performance.now() - started, props.cram);
    window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "review-card" }));
    // "Again" puts the card back a few places in this session.
    setQueue((q) => { const rest = q.slice(1); if (r === 1) rest.splice(Math.min(3, rest.length), 0, c); return rest; });
    setDone((n) => n + 1);
    setShown(false); setTyped(""); setHint(false);
    started = performance.now();
  };
  const key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input, textarea")) { if (e.key === "Enter" && !shown()) { e.preventDefault(); reveal(); } return; }
    if ((e.key === " " || e.key === "Enter") && !shown()) { e.preventDefault(); reveal(); }
    else if (shown() && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); rate(Number(e.key) as SRSRating); }
    else if (e.key === "Escape") props.onExit();
  };
  onMount(() => window.addEventListener("keydown", key));
  onCleanup(() => window.removeEventListener("keydown", key));

  return (
    <div class="study">
      <header class="row">
        <strong>{deckLabel(props.deck)}{props.cram ? ` · ${t("srs-cram")}` : ""}</strong>
        <span class="muted">{t("srs-progress", { done: done(), left: queue().length })}</span>
        <span class="tb-fill" />
        <button class="btn sm" onClick={props.onExit}><Pause />{t("srs-end-session")}</button>
      </header>
      <Show when={card()} keyed fallback={<div class="empty-state"><Brain /><h2>{t("srs-session-done")}</h2><p>{t("srs-session-done-detail", { count: done() })}</p><button class="btn primary" onClick={props.onExit}>{t("srs-back-to-decks")}</button></div>}>
        {(c) => (
          <div class="study-card glass-soft" aria-live="polite">
            <p class="muted sm" dir="auto">{c.context}</p>
            <CardFace card={c} side="q" />
            <Show when={c.hint && !shown()}>
              <button class="btn sm ghost" onClick={() => setHint(true)}>{t("srs-hint")}</button>
              <Show when={hint()}><p class="hint" dir="auto">{c.hint}</p></Show>
            </Show>
            <Show when={srs.state.typeAnswers && !c.occlusion}>
              <input class="input" dir="auto" placeholder={t("srs-type-answer")} aria-label={t("srs-type-answer")} value={typed()} disabled={shown()} onInput={(e) => setTyped(e.currentTarget.value)} />
            </Show>
            <Show when={shown()} fallback={<button class="btn primary block" onClick={reveal}>{t("srs-show-answer")}</button>}>
              <hr />
              <Show when={diff()}>
                <p class="typed-diff" aria-label={t("srs-accuracy", { pct: Math.round(diff()!.accuracy) })}>
                  <For each={diff()!.segments}>{(s) => <span class={`seg-${s.status}`}>{s.text}</span>}</For>
                  <span class="muted"> · {Math.round(diff()!.accuracy)}%</span>
                </p>
              </Show>
              <CardFace card={c} side="a" />
              <div class="ratings" role="group" aria-label={t("srs-rate")}>
                <For each={RATINGS}>
                  {(r) => (
                    <button class={`btn rate-${r}`} onClick={() => rate(r)} aria-keyshortcuts={String(r)}>
                      <span>{t(`srs-rating-${r}`)}</span>
                      <Show when={!props.cram}><small>{preview()?.[r]}</small></Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="row study-tools">
              <button class="btn sm ghost" onClick={() => { openNote(c.sourcePath); revealLine(c.sourcePath, Math.max(0, c.lineNumber - 1)); }}><FileText />{t("srs-open-source")}</button>
              <button class="btn sm ghost" onClick={() => { setCardFlag(c, "buried", true); setQueue((q) => q.slice(1)); setShown(false); }}><EyeOff />{t("srs-bury")}</button>
              <button class="btn sm ghost" onClick={() => { setCardFlag(c, "suspended", true); setQueue((q) => q.slice(1)); setShown(false); }}><Pause />{t("srs-suspend")}</button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

function Browse() {
  const [q, setQ] = createSignal("");
  const list = createMemo(() => {
    const s = q().trim().toLowerCase();
    return allCards().filter((c) => !s || c.question.toLowerCase().includes(s) || c.answer.toLowerCase().includes(s) || c.sourcePath.toLowerCase().includes(s)).slice(0, 400);
  });
  return (
    <div class="stack">
      <input class="input" type="search" placeholder={t("srs-search")} aria-label={t("srs-search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <table class="table">
        <thead><tr><th>{t("srs-question")}</th><th>{t("srs-answer")}</th><th>{t("srs-due")}</th><th>{t("srs-actions")}</th></tr></thead>
        <tbody>
          <For each={list()}>
            {(c) => {
              const st = () => stateOf(c);
              return (
                <tr classList={{ muted: !!st()?.suspended }}>
                  <td dir="auto">{c.question.slice(0, 120)}</td>
                  <td dir="auto">{c.answer.slice(0, 120)}</td>
                  <td>{st()?.suspended ? t("srs-suspended") : st()?.reps ? new Date(st()!.dueAt).toLocaleDateString() : t("srs-new")}</td>
                  <td class="row">
                    <button class="icon-btn sm" title={t("srs-open-source")} aria-label={t("srs-open-source")} onClick={() => { openNote(c.sourcePath); revealLine(c.sourcePath, Math.max(0, c.lineNumber - 1)); }}><FileText /></button>
                    <button class="icon-btn sm" aria-pressed={!!st()?.suspended} title={t("srs-suspend")} aria-label={t("srs-suspend")} onClick={() => setCardFlag(c, "suspended", !st()?.suspended)}><Pause /></button>
                    <button class="icon-btn sm" title={t("srs-reset")} aria-label={t("srs-reset")} onClick={() => resetCard(c)}><RotateCcw /></button>
                  </td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function Stats() {
  const heat = createMemo(() => computeContributionHeatmap(srs.state.logs.map((l) => ({ ...l })), 140));
  const streak = createMemo(() => computeStreakWithFreeze(srs.state.logs.map((l) => ({ ...l })), { ...srs.state.freeze, restWeekdays: [...srs.state.freeze.restWeekdays] }));
  const retention = createMemo(() => computeTrueRetention(srs.state.logs.map((l) => ({ ...l }))));
  const forecast = createMemo(() => computeWorkloadForecast(allCards(), JSON.parse(JSON.stringify(srs.state.states)), 30));
  const peak = () => Math.max(1, ...forecast().map((f) => f.count));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return srs.state.logs.filter((l) => l.timestamp >= d.getTime()).length; };
  return (
    <div class="stack">
      <dl class="w-stats">
        <div><dt>{t("srs-stat-today")}</dt><dd>{today()} / {srs.state.dailyGoal}</dd></div>
        <div><dt>{t("srs-stat-streak")}</dt><dd>{streak().currentStreak}</dd></div>
        <div><dt>{t("srs-stat-longest")}</dt><dd>{streak().longestStreak}</dd></div>
        <div><dt>{t("srs-stat-retention")}</dt><dd>{retention().total ? `${retention().rate}%` : "—"}</dd></div>
      </dl>
      <h3 class="section-title">{t("srs-heatmap")}</h3>
      <div class="heatmap" role="img" aria-label={t("srs-heatmap")}>
        <For each={heat()}>{(d) => <span class={`hm l${d.level}`} title={`${d.date}: ${d.count}`} />}</For>
      </div>
      <h3 class="section-title">{t("srs-forecast")}</h3>
      <div class="bars" role="img" aria-label={t("srs-forecast")}>
        <For each={forecast()}>{(f) => <span class="bar" style={{ height: `${(f.count / peak()) * 100}%` }} title={`${f.label}: ${f.count}`} />}</For>
      </div>
    </div>
  );
}

function Settings() {
  const exportCsv = async () => { if (await backend.saveText("flashcards.csv", exportCardsToCsv(allCards()), "csv")) toast(t("export-done")); };
  const exportApkg = async () => {
    const blob = await exportCardsToApkgBlob(allCards(), "NoSidian");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const a = document.createElement("a");
    a.href = `data:application/zip;base64,${btoa(bin)}`;
    a.download = "NoSidian.apkg";
    a.click();
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
      <label class="field inline"><span>{t("srs-daily-goal")}</span><input class="input sm num" type="number" min="5" max="1000" value={srs.state.dailyGoal} onChange={(e) => { const v = Number(e.currentTarget.value) || 30; srs.update((s) => { s.dailyGoal = v; }); }} /></label>
      <label class="field inline"><span>{t("srs-cards-note")}</span><input class="input sm" value={srs.state.cardsNote} onChange={(e) => { const v = e.currentTarget.value.trim() || "Flashcards.md"; srs.update((s) => { s.cardsNote = v.endsWith(".md") ? v : `${v}.md`; }); }} /></label>
      <label class="check"><input type="checkbox" checked={srs.state.typeAnswers} onChange={(e) => { const v = e.currentTarget.checked; srs.update((s) => { s.typeAnswers = v; }); }} />{t("srs-type-answers")}</label>
      <h3 class="section-title">{t("srs-extract")}</h3>
      <label class="check"><input type="checkbox" checked={srs.state.extraction.headers} onChange={(e) => { const v = e.currentTarget.checked; srs.update((s) => { s.extraction.headers = v; }); }} />{t("srs-extract-headers")}</label>
      <label class="check"><input type="checkbox" checked={srs.state.extraction.bullets} onChange={(e) => { const v = e.currentTarget.checked; srs.update((s) => { s.extraction.bullets = v; }); }} />{t("srs-extract-bullets")}</label>
      <label class="check"><input type="checkbox" checked={srs.state.extraction.tables} onChange={(e) => { const v = e.currentTarget.checked; srs.update((s) => { s.extraction.tables = v; }); }} />{t("srs-extract-tables")}</label>
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

export default function Flashcards() {
  const [tab, setTab] = createSignal<Tab>("decks");
  const [deck, setDeck] = createSignal<string | null>(null);
  const [cram, setCram] = createSignal(false);
  onMount(async () => {
    await loadAllNotes();
    const p = pendingStudy();
    if (p !== undefined) { setDeck(p); setCram(false); setTab("study"); clearPendingStudy(); }
  });
  const study = (d: string | null, c = false) => { setDeck(d); setCram(c); setTab("study"); };
  const TABS: Tab[] = ["decks", "study", "browse", "stats", "settings"];
  return (
    <div class="flashcards page">
      <header class="page-head">
        <h1>{t("view-flashcards")}</h1>
        <div class="segmented" role="tablist">
          <For each={TABS}>{(x) => <button role="tab" aria-selected={tab() === x} onClick={() => setTab(x)}>{t(`srs-tab-${x}`)}</button>}</For>
        </div>
      </header>
      <Switch>
        <Match when={tab() === "decks"}>
          <Show when={allCards().length} fallback={<div class="empty-state"><Brain /><p>{t("srs-no-cards")}</p><p class="muted">{t("srs-syntax-help")}</p></div>}>
            <div class="deck-grid">
              <For each={[null, ...decks()]}>
                {(d) => {
                  const c = createMemo(() => countDeck(d));
                  return (
                    <article class="deck card glass-soft">
                      <h3 dir="auto">{deckLabel(d)}</h3>
                      <p class="muted">{t("srs-deck-counts", { total: c().total, due: c().due, fresh: c().fresh })}</p>
                      <p class="muted sm">{t(`srs-preset-${presetFor(d ?? "").id}` as "srs-preset-default")}</p>
                      <div class="row">
                        <button class="btn sm primary" disabled={!c().due && !c().fresh} onClick={() => study(d)}>{t("srs-study")}</button>
                        <button class="btn sm" disabled={!cardsInDeck(d).length} onClick={() => study(d, true)}>{t("srs-cram")}</button>
                      </div>
                    </article>
                  );
                }}
              </For>
            </div>
          </Show>
        </Match>
        <Match when={tab() === "study"}><Study deck={deck()} cram={cram()} onExit={() => setTab("decks")} /></Match>
        <Match when={tab() === "browse"}><Browse /></Match>
        <Match when={tab() === "stats"}><Stats /></Match>
        <Match when={tab() === "settings"}><Settings /></Match>
      </Switch>
    </div>
  );
}
