// Quick switcher (find or create a note) and command palette. Both are a
// combobox over a listbox: type to filter, arrows to move, Enter to run.
import { For, Show, createMemo, createSignal, createUniqueId, type JSX } from "solid-js";
import { FilePlus, FileText, Terminal, TextSearch } from "lucide-solid";
import { backend } from "../backend";
import type { SearchHit } from "../state/types";
import { revealLine } from "./Editor";
import { t } from "../i18n";
import { rank, type FuzzyResult } from "../lib/fuzzy";
import { noteTitle } from "../lib/markdown";
import { COMMANDS, formatCombo, keyFor } from "../state/commands";
import { profile } from "../state/workspace";
import { setOverlay } from "../state/ui";
import { createNote, openNote, tree } from "../state/vault";
import { newNoteFolder } from "../state/pkm";
import { Modal } from "./Modal";

interface Row { id: string; label: string; detail?: string; match?: FuzzyResult; icon: JSX.Element; hint?: string; run: () => unknown }

function Marked(props: { text: string; indices?: number[] }) {
  const set = () => new Set(props.indices ?? []);
  return <For each={[...props.text]}>{(ch, i) => (set().has(i()) ? <mark>{ch}</mark> : <>{ch}</>)}</For>;
}

function PaletteList(props: { title: string; placeholder: string; rows: (q: string) => Row[]; onShiftEnter?: (q: string) => void; hint?: string }) {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);
  const listId = createUniqueId();
  const rows = createMemo(() => props.rows(q()));
  const close = () => setOverlay("none");
  const pick = (r: Row | undefined) => {
    if (!r) return;
    close();
    void r.run();
  };
  const onKey = (e: KeyboardEvent) => {
    const n = rows().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!n) return;
      setSel((s) => (s + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
      document.getElementById(`${listId}-${sel()}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey && props.onShiftEnter && q().trim()) {
        close();
        props.onShiftEnter(q().trim());
      } else pick(rows()[sel()]);
    }
  };
  return (
    <Modal title={props.title} hideTitle onClose={close} class="palette">
      <input
        class="input palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={rows().length ? `${listId}-${sel()}` : undefined}
        aria-autocomplete="list"
        aria-label={props.title}
        placeholder={props.placeholder}
        value={q()}
        dir="auto"
        autofocus
        onInput={(e) => { setQ(e.currentTarget.value); setSel(0); }}
        onKeyDown={onKey}
      />
      <ul id={listId} class="palette-list" role="listbox" aria-label={props.title}>
        <For each={rows()} fallback={<li class="empty sm" role="presentation">{t("no-results")}</li>}>
          {(r, i) => (
            <li
              id={`${listId}-${i()}`}
              role="option"
              aria-selected={sel() === i()}
              class="palette-row"
              classList={{ selected: sel() === i() }}
              onMouseMove={() => setSel(i())}
              onClick={() => pick(r)}
            >
              <span class="palette-icon" aria-hidden="true">{r.icon}</span>
              <span class="palette-text">
                <span class="palette-label" dir="auto"><Marked text={r.label} indices={r.match?.indices} /></span>
                <Show when={r.detail}><span class="palette-detail" dir="auto">{r.detail}</span></Show>
              </span>
              <Show when={r.hint}><kbd class="kbd">{r.hint}</kbd></Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.hint}><p class="palette-hint">{props.hint}</p></Show>
    </Modal>
  );
}

/** Full-text results for the switcher, by query, filled in the background. */
const [textHits, setTextHits] = createSignal<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
let textTimer: ReturnType<typeof setTimeout> | undefined;
function searchText(q: string) {
  clearTimeout(textTimer);
  if (q.length < 3 || textHits().q === q) return;
  textTimer = setTimeout(() => void backend.search(q, "relevance", 12).then((hits) => setTextHits({ q, hits })).catch(() => undefined), 160);
}

export function QuickSwitcher() {
  const folderOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const create = (name: string) => void createNote(name, newNoteFolder());
  const rows = (q: string): Row[] => {
    const recent = new Map(profile.recent.map((r, i) => [r.path, i]));
    const notes = tree.notes.map((n) => n.path);
    // Empty query: recently opened first, then everything by name.
    const ordered = q.trim()
      ? notes
      : [...notes].sort((a, b) => (recent.get(a) ?? 1e9) - (recent.get(b) ?? 1e9) || noteTitle(a).localeCompare(noteTitle(b)));
    const hits = rank(ordered, q, noteTitle, 60).map(({ item, match }): Row => ({
      id: item,
      label: noteTitle(item),
      detail: folderOf(item) || undefined,
      match,
      icon: <FileText />,
      run: () => openNote(item),
    }));
    // Notes whose text (not only their name) matches, below the name matches.
    const qq = q.trim();
    searchText(qq);
    if (qq.length >= 3 && textHits().q === qq) {
      const have = new Set(hits.map((h) => h.id));
      for (const h of textHits().hits) {
        if (have.has(h.path)) continue;
        hits.push({ id: h.path, label: h.title || noteTitle(h.path), detail: h.matches[0]?.text ?? (folderOf(h.path) || undefined), icon: <TextSearch />, run: () => { openNote(h.path); if (h.matches[0]) revealLine(h.path, h.matches[0].line); } });
      }
    }
    const name = q.trim();
    if (name && !notes.some((p) => noteTitle(p).toLocaleLowerCase() === name.toLocaleLowerCase())) {
      hits.push({ id: "__create", label: t("switcher-create", { name }), icon: <FilePlus />, hint: "Shift+↵", run: () => create(name) });
    }
    return hits;
  };
  return <PaletteList title={t("ribbon-quick-switcher")} placeholder={t("switcher-placeholder")} rows={rows} onShiftEnter={create} hint={t("switcher-hint")} />;
}

export function CommandPalette() {
  const rows = (q: string): Row[] =>
    rank(COMMANDS.filter((c) => c.id !== "command-palette" && (!c.when || c.when())), q, (c) => t(c.label), 80).map(({ item, match }) => ({
      id: item.id,
      label: t(item.label),
      match,
      icon: <Terminal />,
      hint: formatCombo(keyFor(item.id)) || undefined,
      run: item.run,
    }));
  return <PaletteList title={t("ribbon-command-palette")} placeholder={t("palette-placeholder")} rows={rows} />;
}

