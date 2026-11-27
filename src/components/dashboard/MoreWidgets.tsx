// Home widgets for boards, open tasks across the vault, people, a random
// note to revisit, PARA folders and the Zettelkasten.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Cake, FilePlus2, FolderOpen, Plus, RefreshCw, Shuffle, Sparkles, UserPlus } from "lucide-solid";
import { locale, t } from "../../i18n";
import type { DashboardWidget } from "../../core/types";
import { parseFrontmatter } from "../../core/markdown";
import { noteTitle } from "../../lib/markdown";
import { updateWidget } from "../../state/dashboard";
import { corpus } from "../../state/corpus";
import { createPerson, peoplePaths, readPerson } from "../../state/people";
import { PARA, newZettel, notesIn, orphanZettels, paraReady, setupPara, zettelFolder } from "../../state/pkm";
import { askText } from "../../state/ui";
import { openView } from "../../state/views";
import { contents, createNote, ensureLoaded, markdownPaths, openNote, setContent } from "../../state/vault";
import { petEvent } from "../../state/petTalk";
import { KanbanView } from "../KanbanView";
import { Avatar } from "../people/Avatar";

const reveal = (folder: string) => window.dispatchEvent(new CustomEvent("nosidian:reveal", { detail: folder }));

/** A Kanban board from a note, right on the home page. */
export function KanbanWidget(props: { w: DashboardWidget; edit: boolean }) {
  const path = () => props.w.notePath && markdownPaths().includes(props.w.notePath) ? props.w.notePath : "";
  const boards = createMemo(() => corpus().filter((n) => /^##\s/m.test(n.content) && /^\s*- \[[ xX]\]/m.test(n.content)).map((n) => n.path));
  const choose = (p: string) => { void ensureLoaded(p); updateWidget(props.w.id, (x) => { x.notePath = p; }); };
  const create = async () => {
    const name = await askText(t("widget-kanban-new"), t("widget-kanban"), t("action-create"));
    if (!name?.trim()) return;
    const p = await createNote(name, undefined, `# ${name.trim()}\n\n## ${t("kanban-todo")}\n- [ ] \n\n## ${t("kanban-doing")}\n\n## ${t("kanban-done")}\n`, false);
    if (p) choose(p);
  };
  return (
    <div class="w-kanban">
      <Show when={!path() || props.edit}>
        <div class="row wrap">
          <select class="select sm" aria-label={t("widget-kanban-pick")} value={path()} onChange={(e) => choose(e.currentTarget.value)}>
            <option value="" disabled>{t("widget-kanban-pick")}</option>
            <For each={[...new Set([...(path() ? [path()] : []), ...boards()])]}>{(p) => <option value={p}>{noteTitle(p)}</option>}</For>
          </select>
          <button class="btn sm" onClick={() => void create()}><Plus />{t("widget-kanban-new")}</button>
        </div>
      </Show>
      <Show when={path()}>
        {(p) => <><button class="link-btn sm" onClick={() => openNote(p())}>{noteTitle(p())}</button><KanbanView path={p()} /></>}
      </Show>
    </div>
  );
}

/** Task text without Markdown marks: [[a|b]] -> b, **x** -> x. */
const plain = (s: string) => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, (_, x: string) => x.split("/").pop()!).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|~~|==|`)/g, "");

interface OpenTask { path: string; line: number; text: string }

/** Unchecked `- [ ]` items from every note. */
export function OpenTasksWidget() {
  const tasks = createMemo<OpenTask[]>(() => {
    const out: OpenTask[] = [];
    for (const n of corpus()) {
      const lines = n.content.split("\n");
      lines.forEach((l, i) => { const m = l.match(/^\s*[-*+] \[ \]\s+(.+)$/); if (m && m[1].trim()) out.push({ path: n.path, line: i, text: m[1].trim() }); });
    }
    return out.sort((a, b) => (corpus().find((n) => n.path === b.path)?.updatedAt ?? 0) - (corpus().find((n) => n.path === a.path)?.updatedAt ?? 0));
  });
  const done = (x: OpenTask) => {
    const lines = (contents[x.path] ?? "").split("\n");
    if (!/\[ \]/.test(lines[x.line] ?? "")) return;
    lines[x.line] = lines[x.line].replace("[ ]", "[x]");
    setContent(x.path, lines.join("\n"));
    petEvent("todo-done");
  };
  return (
    <div class="stack w-open-tasks">
      <span class="muted sm">{t("widget-open-tasks-count", { n: tasks().length })}</span>
      <ul class="w-todos">
        <For each={tasks().slice(0, 12)} fallback={<li class="empty sm">{t("widget-open-tasks-none")}</li>}>
          {(x) => (
            <li>
              <label><input type="checkbox" onChange={() => done(x)} /><span dir="auto">{plain(x.text)}</span></label>
              <button class="link-btn sm muted w-task-src" onClick={() => openNote(x.path)} dir="auto">{noteTitle(x.path)}</button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

/** Days until the next birthday from a YYYY-MM-DD or MM-DD value. */
function daysToBirthday(v: string | undefined, now = new Date()): number | null {
  const m = v?.match(/(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** People: upcoming birthdays and quick access to everyone. */
export function PeopleWidget() {
  const people = createMemo(() => peoplePaths().map(readPerson));
  const soon = createMemo(() => people().map((p) => ({ p, d: daysToBirthday(p.fields.birthday) })).filter((x) => x.d !== null && x.d <= 30).sort((a, b) => a.d! - b.d!).slice(0, 4));
  const add = async () => { const n = await askText(t("people-new"), "", t("action-add")); if (n?.trim()) await createPerson(n, true); };
  return (
    <div class="stack w-people">
      <Show when={soon().length}>
        <ul class="list">
          <For each={soon()}>{(x) => (
            <li><button class="list-row inline" onClick={() => openNote(x.p.path)}><Cake aria-hidden="true" /><span class="list-title" dir="auto">{x.p.name}</span><span class="muted sm">{x.d === 0 ? t("widget-people-today") : t("widget-people-in-days", { n: x.d! })}</span></button></li>
          )}</For>
        </ul>
      </Show>
      <div class="w-people-grid">
        <For each={people().slice(0, 12)} fallback={<p class="empty sm">{t("people-empty")}</p>}>
          {(p) => <button class="w-person" title={p.name} onClick={() => openNote(p.path)}><Avatar path={p.path} photo={p.photo} /><span dir="auto">{p.name}</span></button>}
        </For>
      </div>
      <div class="row wrap">
        <button class="btn sm" onClick={() => void add()}><UserPlus />{t("people-new")}</button>
        <button class="btn sm" onClick={() => void openView("people")}>{t("view-people")}</button>
      </div>
    </div>
  );
}

/** A random note to look at again. */
export function RandomNoteWidget() {
  const [seed, setSeed] = createSignal(Math.random());
  const pick = createMemo(() => {
    const notes = corpus().filter((n) => n.content.trim().length > 40);
    return notes.length ? notes[Math.floor(seed() * notes.length) % notes.length] : null;
  });
  const excerpt = () => {
    const body = parseFrontmatter(pick()?.content ?? "").body.replace(/^#.*$/gm, "").replace(/[*_`>#[\]]/g, "").replace(/\s+/g, " ").trim();
    return body.length > 220 ? `${body.slice(0, 220)}…` : body;
  };
  return (
    <Show when={pick()} fallback={<p class="empty sm">{t("dash-nothing")}</p>}>
      {(n) => (
        <div class="stack w-random">
          <button class="link-btn w-random-title" onClick={() => openNote(n().path)} dir="auto">{noteTitle(n().path)}</button>
          <p class="muted sm" dir="auto">{excerpt()}</p>
          <span class="muted xs">{new Date(n().updatedAt || Date.now()).toLocaleDateString(locale(), { year: "numeric", month: "short", day: "numeric" })}</span>
          <button class="btn sm align-start" onClick={() => setSeed(Math.random())}><Shuffle />{t("widget-random-another")}</button>
        </div>
      )}
    </Show>
  );
}

/** PARA: the four folders with their note counts. */
export function ParaWidget() {
  const add = async (f: string) => { const n = await askText(t("action-new-note"), "", t("action-create")); if (n?.trim()) await createNote(n, f); };
  return (
    <Show when={paraReady()} fallback={
      <div class="stack"><p class="muted sm">{t("widget-para-intro")}</p><button class="btn sm primary align-start" onClick={() => void setupPara()}><Sparkles />{t("widget-para-setup")}</button></div>
    }>
      <ul class="list w-para">
        <For each={PARA}>{(f) => (
          <li class="row">
            <button class="list-row inline" onClick={() => reveal(f)}><FolderOpen aria-hidden="true" /><span class="list-title">{t(`para-${f.slice(2).toLowerCase()}` as "para-projects")}</span><span class="muted sm">{notesIn(f).length}</span></button>
            <button class="icon-btn sm ghost" title={t("action-new-note")} aria-label={t("action-new-note")} onClick={() => void add(f)}><FilePlus2 /></button>
          </li>
        )}</For>
      </ul>
    </Show>
  );
}

/** Zettelkasten: capture an idea as a new note, and notes waiting for links. */
export function ZettelWidget() {
  const [idea, setIdea] = createSignal("");
  const [rev, setRev] = createSignal(0);
  const orphans = createMemo(() => { rev(); corpus(); return orphanZettels(); });
  return (
    <div class="stack w-zettel">
      <form class="row" onSubmit={async (e) => { e.preventDefault(); const v = idea().trim(); if (!v) return; await newZettel(v, undefined, false); setIdea(""); setRev((x) => x + 1); }}>
        <input class="input sm" dir="auto" placeholder={t("widget-zettel-placeholder")} aria-label={t("widget-zettel-placeholder")} value={idea()} onInput={(e) => setIdea(e.currentTarget.value)} />
        <button class="btn sm primary" disabled={!idea().trim()}><Plus />{t("action-add")}</button>
      </form>
      <span class="muted sm">{t("widget-zettel-count", { n: notesIn(zettelFolder()).length, orphans: orphans().length })}</span>
      <Show when={orphans().length}>
        <ul class="list">
          <For each={orphans().slice(0, 5)}>{(p) => <li><button class="list-row" onClick={() => openNote(p)}><span class="list-title" dir="auto">{noteTitle(p)}</span></button></li>}</For>
        </ul>
      </Show>
      <button class="btn sm align-start" onClick={() => setRev((x) => x + 1)}><RefreshCw />{t("widget-zettel-refresh")}</button>
    </div>
  );
}
