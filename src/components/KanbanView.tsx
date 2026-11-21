// Kanban board over a note: `## Column` headings with `- [ ]` cards. Cards
// drag between columns (or Alt+arrows), and every change is written back as
// plain Markdown.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Plus, Trash2 } from "lucide-solid";
import { t } from "../i18n";
import { parseKanbanFromNote, serializeKanbanToBody } from "../core/knowledge";
import { parseFrontmatter } from "../core/markdown";
import type { KanbanColumn } from "../core/types";
import { contents, setContent } from "../state/vault";
import { announce } from "../a11y/announcer";

const clone = (cols: KanbanColumn[]) => cols.map((c) => ({ ...c, cards: c.cards.map((x) => ({ ...x })), otherLines: [...c.otherLines] }));

export function KanbanView(props: { path: string }) {
  const text = () => contents[props.path] ?? "";
  const parsed = createMemo(() => parseKanbanFromNote(text()));
  const [drag, setDrag] = createSignal<{ col: number; card: number } | null>(null);
  const [over, setOver] = createSignal<number | null>(null);
  const [draft, setDraft] = createSignal<Record<number, string>>({});

  const commit = (cols: KanbanColumn[]) => {
    const src = text();
    const head = src.slice(0, src.length - parseFrontmatter(src).body.length);
    setContent(props.path, head + serializeKanbanToBody(parsed().preamble, cols));
  };
  const move = (from: { col: number; card: number }, toCol: number, toIndex?: number) => {
    const cols = clone(parsed().columns);
    if (!cols[toCol]) return;
    const [card] = cols[from.col].cards.splice(from.card, 1);
    const at = toIndex ?? cols[toCol].cards.length;
    cols[toCol].cards.splice(Math.max(0, Math.min(at, cols[toCol].cards.length)), 0, card);
    commit(cols);
    announce(t("kanban-moved", { card: card.text, column: cols[toCol].title }));
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-kb="${toCol}-${Math.min(at, cols[toCol].cards.length - 1)}"]`)?.focus());
  };
  const edit = (fn: (cols: KanbanColumn[]) => void) => { const cols = clone(parsed().columns); fn(cols); commit(cols); };
  const addCard = (col: number) => {
    const v = (draft()[col] ?? "").trim();
    if (!v) return;
    edit((cols) => cols[col].cards.push({ id: "", done: false, text: v }));
    setDraft((d) => ({ ...d, [col]: "" }));
  };
  const addColumn = () => edit((cols) => cols.push({ title: t("kanban-new-column"), cards: [], otherLines: [] }));
  const template = () => setContent(props.path, `${text().trimEnd()}\n\n## ${t("kanban-todo")}\n- [ ] \n\n## ${t("kanban-doing")}\n\n## ${t("kanban-done")}\n`);

  const cardKey = (e: KeyboardEvent, col: number, card: number) => {
    if (!e.altKey) return;
    const n = parsed().columns.length;
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl";
    const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dx) { e.preventDefault(); const to = col + (rtl ? -dx : dx); if (to >= 0 && to < n) move({ col, card }, to); }
    if (e.key === "ArrowUp" && card > 0) { e.preventDefault(); move({ col, card }, col, card - 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); move({ col, card }, col, card + 1); }
  };

  return (
    <div class="kanban" aria-label={t("kanban-label")}>
      <p class="sr-only">{t("kanban-hint")}</p>
      <Show when={parsed().columns.length} fallback={
        <div class="empty-state sm"><p>{t("kanban-empty")}</p><button class="btn primary" onClick={template}><Plus />{t("kanban-template")}</button></div>
      }>
        <div class="kanban-cols">
          <For each={parsed().columns}>
            {(col, ci) => (
              <section
                class="kanban-col glass-soft" classList={{ over: over() === ci() }} aria-label={col.title}
                onDragOver={(e) => { if (drag()) { e.preventDefault(); setOver(ci()); } }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); const d = drag(); setOver(null); setDrag(null); if (d) move(d, ci()); }}
              >
                <header class="kanban-head">
                  <input class="kanban-title" value={col.title} aria-label={t("kanban-column-name")} dir="auto"
                    onChange={(e) => { const v = e.currentTarget.value.trim(); if (v) edit((cols) => { cols[ci()].title = v; }); }} />
                  <span class="count">{col.cards.length}</span>
                  <button class="icon-btn sm" title={t("kanban-delete-column")} aria-label={t("kanban-delete-column")} onClick={() => edit((cols) => { cols.splice(ci(), 1); })}><Trash2 /></button>
                </header>
                <ul class="kanban-cards">
                  <For each={col.cards}>
                    {(card, ki) => (
                      <li class="kanban-card" classList={{ done: card.done }} draggable="true" data-kb={`${ci()}-${ki()}`} tabIndex={0}
                        aria-label={`${card.text}${card.done ? `, ${t("kanban-card-done")}` : ""}`}
                        onDragStart={(e) => { setDrag({ col: ci(), card: ki() }); e.dataTransfer?.setData("text/plain", card.text); }}
                        onDragEnd={() => { setDrag(null); setOver(null); }}
                        onKeyDown={(e) => cardKey(e, ci(), ki())}>
                        <input type="checkbox" checked={card.done} aria-label={t("kanban-card-done")} onChange={(e) => { const v = e.currentTarget.checked; edit((cols) => { cols[ci()].cards[ki()].done = v; }); }} />
                        <span dir="auto" class="kanban-text">{card.text}</span>
                        <button class="icon-btn sm ghost" aria-label={t("kanban-delete-card")} title={t("kanban-delete-card")} onClick={() => edit((cols) => { cols[ci()].cards.splice(ki(), 1); })}><Trash2 /></button>
                      </li>
                    )}
                  </For>
                </ul>
                <form class="kanban-add" onSubmit={(e) => { e.preventDefault(); addCard(ci()); }}>
                  <input class="input sm" placeholder={t("kanban-add-card")} aria-label={t("kanban-add-card")} dir="auto" value={draft()[ci()] ?? ""} onInput={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, [ci()]: v })); }} />
                </form>
              </section>
            )}
          </For>
          <button class="kanban-col add glass-soft" onClick={addColumn}><Plus />{t("kanban-add-column")}</button>
        </div>
      </Show>
    </div>
  );
}
