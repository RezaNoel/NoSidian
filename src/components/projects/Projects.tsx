// Project mode: projects (manual or folders with a project note), a task
// board fed by Markdown checkboxes and tag rules, a list with sprints, a day
// planner with time blocks and a task timer, a dependency graph with blocker
// editing, templates and tag rules. Linked notes open beside the board.
import { DatePicker } from "../DatePicker";
import { Dynamic } from "solid-js/web";
import { ENTRY_ICONS } from "../EntryStyle";
import { For, Match, Show, Switch, createMemo, createRoot, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import {
  CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, FilePlus2, FileText, Filter, GitBranch, Hash, KanbanSquare,
  Link2, ListTodo, MoreHorizontal, Pause, PanelRight, Pencil, Play, Plus, Star, Trash2, Wand2, X,
} from "lucide-solid";
import { locale, t } from "../../i18n";
import {
  PROJECT_COLUMNS, SMART_PROJECT_TEMPLATES, buildFolderProjectId, buildProjectDependencyGraph, convertNoteToProjectTask, filterTasksWithFileContext,
  generateSmartProjectFiles, generateSprintReviewMarkdown, injectDueTasksIntoDailyNote,
} from "../../core/projectEngine";
import { computeDeadlineCountdown, computeTaskProgress } from "../../core/projects";
import type { ProjectItem, ProjectTask, ProjectTaskStatus, ProjectTemplateId, TagWorkflowRule } from "../../core/types";
import { allProjects, allTasks, logTime, newId, primaryProject, projectState, removeTask, scheduleTask, setTaskStatus, toggleTask, upsertTask } from "../../state/projects";
import { corpus, loadAllNotes } from "../../state/corpus";
import { backend } from "../../backend";
import { contents, createNote, ensureLoaded, markdownPaths, openNote, refresh, setContent, tree } from "../../state/vault";
import { dailyPath, openDailyNote } from "../../state/daily";
import { askText, toast } from "../../state/ui";
import { noteTitle, resolveLink } from "../../lib/markdown";
import { Modal } from "../Modal";
import { Reader } from "../Reader";
import { revealLine } from "../Editor";
import { openMenu, type MenuItem } from "../ContextMenu";

type Tab = "board" | "list" | "timeline" | "graph" | "automation";
type Priority = ProjectTask["priority"];
const TABS: { id: Tab; icon: typeof KanbanSquare }[] = [
  { id: "board", icon: KanbanSquare }, { id: "list", icon: ListTodo }, { id: "timeline", icon: CalendarClock }, { id: "graph", icon: GitBranch }, { id: "automation", icon: Wand2 },
];
const COLORS = ["#3b7ddd", "#0ea5e9", "#10b981", "#7c3aed", "#f59e0b", "#e11d48"];
const PROJECT_ICONS = ["folder", "rocket", "target", "briefcase", "code", "book-open", "school", "science", "idea", "star", "heart", "art", "music", "camera", "globe", "travel", "money", "sport", "nature", "brain"];
const PRIORITIES: Priority[] = ["high", "medium", "low"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const fmtDay = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { month: "short", day: "numeric" });
const num = (n: number) => n.toLocaleString(locale());
const editable = (x: ProjectTask) => !x.sourceType || x.sourceType === "manual" || x.sourceType === "note-card";
const noteOf = (x: ProjectTask) => x.linkedNotePath || x.sourcePath;
const plain = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => (b ?? a).trim());
const statusOf = (x: ProjectTask): ProjectTaskStatus => x.status ?? (x.done ? "done" : "todo");

// Page-wide UI state that outlives tab switches.
const ui = createRoot(() => {
  const [split, setSplit] = createSignal<string | null>(null);
  const [timerTask, setTimerTask] = createSignal<string>("");
  const [timerStart, setTimerStart] = createSignal<number | null>(null);
  const [tick, setTick] = createSignal(Date.now());
  return { split, setSplit, timerTask, setTimerTask, timerStart, setTimerStart, tick, setTick };
});

/** Open a note (path or wikilink target) beside the board. */
function openBeside(target: string) {
  const path = markdownPaths().includes(target) ? target : resolveLink(target, markdownPaths());
  if (path) { void ensureLoaded(path); ui.setSplit(path); } else toast(t("proj-note-missing", { name: target }), true);
}

/** Task title with `[[links]]` as buttons that open the note beside the board. */
function TaskTitle(props: { title: string; onOpen?: () => void }) {
  const parts = createMemo(() => {
    const out: (string | { target: string; label: string })[] = [];
    const rx = /\[\[([^\]]+)\]\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(props.title))) {
      if (m.index > last) out.push(props.title.slice(last, m.index));
      const [target, alias] = m[1].split("|");
      out.push({ target: target.split("#")[0].trim(), label: (alias ?? target).trim() });
      last = m.index + m[0].length;
    }
    if (last < props.title.length) out.push(props.title.slice(last));
    return out;
  });
  return (
    <span class="task-title" dir="auto">
      <For each={parts()}>{(p) => typeof p === "string"
        ? <span onClick={() => props.onOpen?.()}>{p}</span>
        : <button type="button" class="wikilink" onClick={(e) => { e.stopPropagation(); openBeside(p.target); }}>{p.label}</button>}</For>
    </span>
  );
}

async function deleteProject(p: ProjectItem) {
  projectState.update((s) => {
    s.projects = s.projects.filter((x) => x.id !== p.id);
    s.sprints = s.sprints.filter((x) => x.projectId !== p.id);
    s.tasks = s.tasks.filter((x) => x.projectId !== p.id);
    if (s.spotlightProjectId === p.id) s.spotlightProjectId = s.projects[0]?.id ?? null;
  });
}
/** Change a project's field: manual projects in the project file, folder projects in their _project.md front matter. */
async function setProjectField(p: ProjectItem, key: "name" | "deadline" | "color" | "status" | "icon", value: string) {
  if (!p.fromFolderProject) {
    projectState.update((s) => { const x = s.projects.find((y) => y.id === p.id); if (x) (x as unknown as Record<string, string>)[key] = value; });
    return;
  }
  const path = tree.notes.find((n) => n.path.toLowerCase() === `${p.folderPath}/_project.md`.toLowerCase())?.path;
  if (!path) return;
  await ensureLoaded(path);
  const src = contents[path] ?? "";
  const line = `${key}: ${value.replace(/\n/g, " ")}`;
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  let next: string;
  if (!m) next = `---\n${line}\n---\n${src}`;
  else {
    const re = new RegExp(`^${key}:.*$`, "m");
    const fm = re.test(m[1]) ? m[1].replace(re, line) : `${m[1]}\n${line}`;
    next = src.replace(m[0], `---\n${fm}\n---`);
  }
  if (next !== src) setContent(path, next);
}
const setPrimary = (p: ProjectItem) => projectState.update((s) => { s.spotlightProjectId = p.id; s.projects.forEach((x) => { x.isPrimary = x.id === p.id; }); });

function projectMenu(e: MouseEvent, p: ProjectItem, onRemoved: () => void) {
  const items: MenuItem[] = [
    { label: t("proj-make-primary"), icon: <Star />, disabled: primaryProject()?.id === p.id, run: () => setPrimary(p) },
  ];
  if (p.folderPath) items.push({ label: t("proj-open-folder-note"), icon: <FileText />, run: () => { const n = tree.notes.find((x) => x.path.startsWith(`${p.folderPath}/`) && /_project\.md$|project\.md$/i.test(x.path)); if (n) openNote(n.path); } });
  items.push(
    { label: t("proj-edit"), icon: <Pencil />, sep: true, run: () => setEditingProject(p) },
    { label: p.status === "completed" ? t("proj-reopen") : t("proj-mark-complete"), icon: <CheckCircle2 />, run: () => void setProjectField(p, "status", p.status === "completed" ? "active" : "completed") },
  );
  if (!p.fromFolderProject) items.push({ label: t("proj-remove"), icon: <Trash2 />, danger: true, sep: true, run: () => { void deleteProject(p); onRemoved(); } });
  openMenu(e, items);
}

function taskMenu(e: MouseEvent, x: ProjectTask, onEdit: (x: ProjectTask) => void) {
  const items: MenuItem[] = [
    { label: t("proj-edit-task"), icon: <Pencil />, run: () => onEdit(x) },
  ];
  const n = noteOf(x);
  if (n) items.push({ label: t("proj-open-beside"), icon: <PanelRight />, run: () => openBeside(n) });
  if (x.sourcePath) items.push({ label: t("srs-open-source"), icon: <ExternalLink />, run: () => { openNote(x.sourcePath!); if (x.sourceLine !== undefined) revealLine(x.sourcePath!, x.sourceLine); } });
  PROJECT_COLUMNS.forEach((c, i) => items.push({ label: t(`proj-col-${c.id}`), mark: statusOf(x) === c.id, sep: i === 0, run: () => void setTaskStatus(x, c.id) }));
  items.push(
    { label: t("proj-log-15"), icon: <Clock />, sep: true, run: () => void logTime(x, 15).then(() => toast(t("proj-logged", { minutes: 15 }))) },
    { label: t("proj-time-this-task"), icon: <Play />, run: () => { ui.setTimerTask(x.id); ui.setTimerStart(Date.now()); } },
  );
  if (editable(x)) items.push({ label: t("action-delete"), icon: <Trash2 />, danger: true, sep: true, run: () => removeTask(x.id) });
  openMenu(e, items);
}

const [editingProject, setEditingProject] = createRoot(() => createSignal<ProjectItem | null>(null));

/** Colour swatches and icon choices shared by the new and edit dialogs. */
function ProjectLook(props: { color: string; icon: string; onColor: (c: string) => void; onIcon: (i: string) => void }) {
  return (
    <>
      <fieldset class="field color-pick">
        <legend>{t("proj-color")}</legend>
        <div class="color-row" role="radiogroup" aria-label={t("proj-color")}>
          <For each={COLORS}>{(c, i) => <button type="button" role="radio" class="color-dot lg" style={{ background: c }} aria-checked={props.color === c} aria-label={t("proj-color-n", { n: i() + 1 })} title={t("proj-color-n", { n: i() + 1 })} onClick={() => props.onColor(c)} />}</For>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>{t("proj-icon")}</legend>
        <div class="entry-icons proj-icons" role="radiogroup" aria-label={t("proj-icon")}>
          <For each={PROJECT_ICONS}>
            {(id) => (
              <button type="button" role="radio" class="entry-icon" aria-checked={props.icon === id} aria-label={id} title={id} style={{ color: props.color }} onClick={() => props.onIcon(id)}>
                <Dynamic component={ENTRY_ICONS[id]} />
              </button>
            )}
          </For>
        </div>
      </fieldset>
    </>
  );
}

/** A project's chosen icon, or its colour dot when it has none. */
export function ProjectIcon(props: { p: ProjectItem }) {
  return (
    <Show when={props.p.icon && ENTRY_ICONS[props.p.icon]} fallback={<span class="col-dot" />}>
      {(I) => <Dynamic component={I()} class="proj-icon" aria-hidden="true" />}
    </Show>
  );
}

function EditProject(props: { p: ProjectItem; onClose: () => void }) {
  const [name, setName] = createSignal(props.p.name);
  const [deadline, setDeadline] = createSignal(props.p.deadline);
  const [color, setColor] = createSignal(props.p.color);
  const [icon, setIcon] = createSignal(props.p.icon ?? "");
  const save = async () => {
    const p = props.p;
    if (name().trim() && name().trim() !== p.name) await setProjectField(p, "name", name().trim());
    if (deadline() && deadline() !== p.deadline) await setProjectField(p, "deadline", deadline());
    if (color() !== p.color) await setProjectField(p, "color", color());
    if (icon() !== (p.icon ?? "")) await setProjectField(p, "icon", icon());
    props.onClose();
  };
  return (
    <Modal title={t("proj-edit")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label class="field"><span>{t("proj-name")}</span><input class="input" data-autofocus dir="auto" value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <div class="field"><span>{t("proj-deadline")}</span><DatePicker label={t("proj-deadline")} value={deadline()} onChange={(v) => v && setDeadline(v)} /></div>
        <ProjectLook color={color()} icon={icon()} onColor={setColor} onIcon={setIcon} />
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!name().trim()}>{t("action-save")}</button></div>
      </form>
    </Modal>
  );
}

function NewProject(props: { template?: ProjectTemplateId; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = createSignal("");
  const [deadline, setDeadline] = createSignal(addDays(iso(), 21));
  const [tpl, setTpl] = createSignal<ProjectTemplateId>(props.template ?? "blank");
  const [color, setColor] = createSignal(COLORS[0]);
  const [icon, setIcon] = createSignal("");
  const create = async () => {
    const n = name().trim();
    if (!n) return;
    const look = (c: string) => c.replace(/^color:.*$/m, `color: ${color()}${icon() ? `\nicon: ${icon()}` : ""}`);
    const files = generateSmartProjectFiles(n, tpl(), deadline()).map((f) => (/_project\.md$/i.test(f.path) ? { ...f, content: look(f.content) } : f));
    for (const f of files) {
      const folder = f.path.slice(0, f.path.lastIndexOf("/"));
      for (let i = folder.indexOf("/"); ; i = folder.indexOf("/", i + 1)) {
        const part = i < 0 ? folder : folder.slice(0, i);
        if (part && !tree.folders.includes(part)) await backend.createFolder(part).catch(() => undefined);
        if (i < 0) break;
      }
      await backend.createNote(f.path, f.content).catch(() => undefined);
    }
    await refresh();
    await loadAllNotes();
    const main = files.find((f) => /_project\.md$/i.test(f.path)) ?? files[0];
    const id = buildFolderProjectId(main.path.slice(0, main.path.lastIndexOf("/")));
    projectState.update((s) => { if (!s.spotlightProjectId) s.spotlightProjectId = id; });
    props.onCreated(id);
    props.onClose();
  };
  return (
    <Modal title={t("proj-new")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label class="field"><span>{t("proj-name")}</span><input class="input" data-autofocus dir="auto" value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <div class="field"><span>{t("proj-deadline")}</span><DatePicker label={t("proj-deadline")} value={deadline()} onChange={(v) => v && setDeadline(v)} /></div>
        <ProjectLook color={color()} icon={icon()} onColor={setColor} onIcon={setIcon} />
        <fieldset class="choice-grid">
          <legend>{t("dash-template")}</legend>
          <For each={SMART_PROJECT_TEMPLATES}>{(x) => <label class="choice-card"><input type="radio" name="ptpl" checked={tpl() === x.id} onChange={() => setTpl(x.id)} /><strong>{t(`proj-tpl-${x.id}`)}</strong><span>{t(`proj-tpl-${x.id}-desc`)}</span></label>}</For>
        </fieldset>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!name().trim()}>{t("action-create")}</button></div>
      </form>
    </Modal>
  );
}

function NotePicker(props: { projectId: string; onClose: () => void }) {
  const [q, setQ] = createSignal("");
  const list = createMemo(() => {
    const s = q().trim().toLowerCase();
    return corpus().filter((n) => !s || n.path.toLowerCase().includes(s)).slice(0, 60);
  });
  const pick = (path: string) => {
    const n = corpus().find((x) => x.path === path);
    if (!n) return;
    upsertTask(convertNoteToProjectTask(n, props.projectId, "todo"));
    toast(t("proj-note-converted", { name: noteTitle(path) }));
    props.onClose();
  };
  return (
    <Modal title={t("proj-from-note")} onClose={props.onClose}>
      <div class="stack">
        <p class="muted sm">{t("proj-from-note-help")}</p>
        <input class="input" type="search" data-autofocus placeholder={t("search-placeholder")} aria-label={t("search-placeholder")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <ul class="pick-list">
          <For each={list()} fallback={<li class="muted sm">{t("no-results")}</li>}>
            {(n) => <li><button type="button" onClick={() => pick(n.path)}><FileText aria-hidden="true" /><span dir="auto">{noteTitle(n.path)}</span><span class="muted sm ellipsis">{n.path}</span></button></li>}
          </For>
        </ul>
      </div>
    </Modal>
  );
}

function TaskEditor(props: { task: ProjectTask; onClose: () => void }) {
  const [x, setX] = createSignal<ProjectTask>({ ...props.task, tags: [...(props.task.tags ?? [])], blockedBy: [...(props.task.blockedBy ?? [])] });
  const md = !editable(props.task);
  const patch = (p: Partial<ProjectTask>) => setX((v) => ({ ...v, ...p }));
  const save = () => { if (!md) upsertTask(x()); props.onClose(); };
  return (
    <Modal title={t("proj-edit-task")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Show when={md}><p class="muted sm">{t("proj-md-task-hint")}</p></Show>
        <label class="field"><span>{t("proj-task-title")}</span><input class="input" dir="auto" disabled={md} value={x().title} onInput={(e) => patch({ title: e.currentTarget.value })} /></label>
        <label class="field"><span>{t("proj-task-desc")}</span><textarea class="input" dir="auto" rows="3" disabled={md} value={x().description ?? ""} onInput={(e) => patch({ description: e.currentTarget.value })} /></label>
        <div class="form-grid">
          <label class="field"><span>{t("proj-project")}</span><select class="select" disabled={md} value={x().projectId} onChange={(e) => patch({ projectId: e.currentTarget.value })}><For each={allProjects()}>{(p) => <option value={p.id}>{p.name}</option>}</For></select></label>
          <label class="field"><span>{t("proj-priority")}</span><select class="select" disabled={md} value={x().priority} onChange={(e) => patch({ priority: e.currentTarget.value as Priority })}><For each={PRIORITIES}>{(p) => <option value={p}>{t(`proj-pri-${p}`)}</option>}</For></select></label>
          <label class="field"><span>{t("proj-due")}</span><DatePicker label={t("proj-due")} disabled={md} value={x().dueDate ?? ""} onChange={(v) => patch({ dueDate: v || undefined })} clearable /></label>
          <label class="field"><span>{t("proj-sprint")}</span><select class="select" disabled={md} value={x().sprintId ?? ""} onChange={(e) => patch({ sprintId: e.currentTarget.value || undefined })}><option value="">{t("proj-no-sprint")}</option><For each={projectState.state.sprints.filter((s) => s.projectId === x().projectId)}>{(s) => <option value={s.id}>{s.name}</option>}</For></select></label>
          <label class="field"><span>{t("proj-assignee")}</span><input class="input" dir="auto" disabled={md} value={x().assignee ?? ""} onInput={(e) => patch({ assignee: e.currentTarget.value.trim() || undefined })} /></label>
          <label class="field"><span>{t("proj-tags")}</span><input class="input" disabled={md} value={(x().tags ?? []).join(", ")} onInput={(e) => patch({ tags: e.currentTarget.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean) })} /></label>
        </div>
        <Show when={!md}>
          <BlockerEditor task={x()} onChange={(b) => patch({ blockedBy: b })} />
        </Show>
        <div class="row wrap">
          <button type="button" class="btn sm" onClick={async () => { const v = await askText(t("proj-log-time"), "25", t("action-add")); const n = Number(v); if (n > 0) { await logTime(props.task, n); toast(t("proj-logged", { minutes: n })); } }}><Clock />{t("proj-log-time")}</button>
          <Show when={noteOf(props.task)}><button type="button" class="btn sm" onClick={() => { openBeside(noteOf(props.task)!); props.onClose(); }}><PanelRight />{t("proj-open-beside")}</button></Show>
          <span class="tb-fill" />
          <Show when={!md}><button type="button" class="btn sm danger" onClick={() => { removeTask(props.task.id); props.onClose(); }}><Trash2 />{t("action-delete")}</button></Show>
        </div>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><Show when={!md}><button class="btn primary">{t("action-save")}</button></Show></div>
      </form>
    </Modal>
  );
}

function BlockerEditor(props: { task: ProjectTask; onChange: (ids: string[]) => void }) {
  const others = () => allTasks().filter((o) => o.id !== props.task.id && o.projectId === props.task.projectId && !(props.task.blockedBy ?? []).includes(o.id));
  const title = (id: string) => allTasks().find((o) => o.id === id)?.title ?? id;
  return (
    <div class="field">
      <span>{t("proj-blocked-by")}</span>
      <div class="chip-row">
        <For each={props.task.blockedBy ?? []}>{(id) => <span class="chip"><span dir="auto" class="ellipsis">{plain(title(id))}</span><button type="button" class="icon-btn xs" aria-label={t("action-delete")} onClick={() => props.onChange((props.task.blockedBy ?? []).filter((b) => b !== id))}><X /></button></span>}</For>
        <select class="select sm" value="" aria-label={t("proj-add-blocker")} onChange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ""; if (v) props.onChange([...(props.task.blockedBy ?? []), v]); }}>
          <option value="">{t("proj-add-blocker")}</option>
          <For each={others()}>{(o) => <option value={o.id}>{plain(o.title).slice(0, 60)}</option>}</For>
        </select>
      </div>
    </div>
  );
}

function Badges(props: { x: ProjectTask; blocked: boolean }) {
  const x = () => props.x;
  return (
    <div class="task-meta">
      <span class={`pri ${x().priority}`}>{t(`proj-pri-${x().priority}`)}</span>
      <Show when={x().sourceType === "markdown-checkbox"}><span class="src" title={x().sourcePath}><FileText aria-hidden="true" />{noteTitle(x().sourcePath ?? "")}</span></Show>
      <Show when={x().sourceType === "tag-rule"}><span class="src" title={x().sourcePath}><Hash aria-hidden="true" />{t("proj-from-rule")}</span></Show>
      <Show when={x().dueDate}><span class="src" classList={{ late: !x().done && x().dueDate! < iso() }}><CalendarClock aria-hidden="true" />{fmtDay(x().dueDate!)}</span></Show>
      <Show when={x().timeSpentMinutes}><span class="src"><Clock aria-hidden="true" />{t("proj-minutes", { minutes: x().timeSpentMinutes! })}</span></Show>
      <Show when={x().assignee}><span class="src">@{x().assignee}</span></Show>
      <Show when={props.blocked}><span class="warn">{t("proj-blocked")}</span></Show>
    </div>
  );
}

const isBlocked = (x: ProjectTask) => (x.blockedBy ?? []).some((id) => allTasks().some((y) => y.id === id && !y.done));

function Board(props: { tasks: ProjectTask[]; project: string | null; onEdit: (t: ProjectTask) => void }) {
  const [drag, setDrag] = createSignal<ProjectTask | null>(null);
  const [over, setOver] = createSignal<string | null>(null);
  const add = async (status: ProjectTaskStatus) => {
    const title = await askText(t("proj-add-task"), "", t("action-add"));
    if (!title?.trim()) return;
    upsertTask({ id: newId("task"), projectId: props.project ?? primaryProject()?.id ?? "inbox", title: title.trim(), done: status === "done", status, priority: "medium", sourceType: "manual", createdAt: Date.now() });
  };
  return (
    <div class="kanban-cols proj-board">
      <For each={PROJECT_COLUMNS}>
        {(col) => {
          const list = () => props.tasks.filter((x) => statusOf(x) === col.id);
          return (
            <section class="kanban-col glass-soft" classList={{ over: over() === col.id }} style={{ "--col": col.accent }} aria-label={t(`proj-col-${col.id}`)}
              onDragOver={(e) => { if (drag()) { e.preventDefault(); setOver(col.id); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); const d = drag(); setDrag(null); setOver(null); if (d && statusOf(d) !== col.id) void setTaskStatus(d, col.id); }}>
              <header class="kanban-head"><span class="col-dot" /><strong>{t(`proj-col-${col.id}`)}</strong><span class="count">{num(list().length)}</span>
                <button class="icon-btn sm" aria-label={t("proj-add-task")} title={t("proj-add-task")} onClick={() => void add(col.id)}><Plus /></button></header>
              <ul class="kanban-cards">
                <For each={list()}>
                  {(x) => (
                    <li class="kanban-card task" classList={{ done: x.done, blocked: isBlocked(x), dragging: drag()?.id === x.id }} draggable="true" tabIndex={0}
                      onDragStart={(e) => { setDrag(x); e.dataTransfer?.setData("text/plain", x.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onContextMenu={(e) => taskMenu(e, x, props.onEdit)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter") props.onEdit(x);
                        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); taskMenu({ clientX: r.left + 20, clientY: r.top + 20 } as MouseEvent, x, props.onEdit); }
                        if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); const i = PROJECT_COLUMNS.findIndex((c) => c.id === col.id) + (e.key === "ArrowRight" ? 1 : -1); if (PROJECT_COLUMNS[i]) void setTaskStatus(x, PROJECT_COLUMNS[i].id); }
                      }}>
                      <div>
                        <input type="checkbox" checked={x.done} aria-label={t("kanban-card-done")} onChange={() => void toggleTask(x)} />
                        <TaskTitle title={x.title} onOpen={() => props.onEdit(x)} />
                        <Show when={noteOf(x)}><button class="icon-btn xs" title={t("proj-open-beside")} aria-label={t("proj-open-beside")} onClick={() => openBeside(noteOf(x)!)}><PanelRight /></button></Show>
                      </div>
                      <Show when={x.description && editable(x)}><p class="task-desc" dir="auto">{x.description}</p></Show>
                      <Badges x={x} blocked={isBlocked(x)} />
                    </li>
                  )}
                </For>
              </ul>
            </section>
          );
        }}
      </For>
    </div>
  );
}

function Sprints(props: { project: string | null }) {
  const [name, setName] = createSignal("");
  const [goal, setGoal] = createSignal("");
  const [end, setEnd] = createSignal(addDays(iso(), 14));
  const list = () => projectState.state.sprints.filter((s) => !props.project || s.projectId === props.project);
  const add = () => {
    if (!name().trim()) return;
    projectState.update((s) => { s.sprints.push({ id: newId("spr"), projectId: props.project ?? primaryProject()?.id ?? "", name: name().trim(), startDate: iso(), endDate: end(), goal: goal().trim(), status: "active" }); });
    setName(""); setGoal("");
  };
  return (
    <section class="stack">
      <h2 class="section-title">{t("proj-sprints")}</h2>
      <div class="sprint-grid">
        <For each={list()}>
          {(sp) => {
            const prog = () => computeTaskProgress(allTasks().filter((x) => x.sprintId === sp.id));
            const set = (p: Partial<typeof sp>) => projectState.update((s) => { const x = s.sprints.find((y) => y.id === sp.id); if (x) Object.assign(x, p); });
            const menu = (e: MouseEvent) => openMenu(e, [
              { label: t("action-rename"), icon: <Pencil />, run: async () => { const v = await askText(t("action-rename"), sp.name, t("action-save")); if (v?.trim()) set({ name: v.trim() }); } },
              { label: t("proj-sprint-goal"), icon: <Star />, run: async () => { const v = await askText(t("proj-sprint-goal"), sp.goal, t("action-save")); if (v !== null) set({ goal: v.trim() }); } },
              ...(["planned", "active", "done"] as const).map((st, i) => ({ label: t(`proj-sprint-${st}`), mark: sp.status === st, sep: i === 0, run: () => set({ status: st }) })),
              { label: t("proj-sprint-review"), icon: <FilePlus2 />, sep: true, run: () => void writeReview(sp.startDate, sp.endDate, sp.name) },
              { label: t("action-delete"), icon: <Trash2 />, danger: true, sep: true, run: () => projectState.update((s) => { s.sprints = s.sprints.filter((x) => x.id !== sp.id); }) },
            ]);
            return (
              <article class="sprint card glass-soft" onContextMenu={menu}>
                <div class="row">
                  <strong dir="auto" class="ellipsis">{sp.name}</strong>
                  <span class={`badge ${sp.status}`}>{t(`proj-sprint-${sp.status}`)}</span>
                  <span class="tb-fill" />
                  <button class="icon-btn sm" aria-label={t("more-actions")} onClick={menu}><MoreHorizontal /></button>
                </div>
                <Show when={sp.goal}><p class="muted sm" dir="auto">{sp.goal}</p></Show>
                <div class="meter" role="progressbar" aria-valuenow={prog().percent} aria-valuemin="0" aria-valuemax="100" aria-label={sp.name}><span style={{ width: `${prog().percent}%` }} /></div>
                <div class="row muted sm"><span>{t("proj-progress", { done: prog().done, total: prog().total })}</span><span class="tb-fill" /><span>{fmtDay(sp.startDate)} – {fmtDay(sp.endDate)}</span></div>
              </article>
            );
          }}
        </For>
      </div>
      <form class="quick-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input class="input sm" dir="auto" placeholder={t("proj-new-sprint")} aria-label={t("proj-new-sprint")} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        <input class="input sm" dir="auto" placeholder={t("proj-sprint-goal")} aria-label={t("proj-sprint-goal")} value={goal()} onInput={(e) => setGoal(e.currentTarget.value)} />
        <DatePicker size="sm" label={t("proj-end")} value={end()} onChange={setEnd} clearable />
        <button class="btn sm" disabled={!name().trim()}><Plus />{t("action-add")}</button>
      </form>
    </section>
  );
}

function TaskList(props: { tasks: ProjectTask[]; onEdit: (t: ProjectTask) => void }) {
  const sorted = createMemo(() => [...props.tasks].sort((a, b) => Number(a.done) - Number(b.done) || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")));
  return (
    <section class="stack">
      <h2 class="section-title">{t("proj-tasks-count", { count: props.tasks.length })}</h2>
      <ul class="task-rows">
        <For each={sorted()} fallback={<li class="empty sm">{t("proj-no-tasks")}</li>}>
          {(x) => (
            <li class="task-row" classList={{ done: x.done, blocked: isBlocked(x) }} onContextMenu={(e) => taskMenu(e, x, props.onEdit)}>
              <input type="checkbox" checked={x.done} aria-label={t("kanban-card-done")} onChange={() => void toggleTask(x)} />
              <TaskTitle title={x.title} onOpen={() => props.onEdit(x)} />
              <Badges x={x} blocked={isBlocked(x)} />
              <span class="status-pill">{t(`proj-col-${statusOf(x)}`)}</span>
              <button class="icon-btn sm" aria-label={t("more-actions")} onClick={(e) => taskMenu(e, x, props.onEdit)}><MoreHorizontal /></button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

async function writeReview(from: string, to: string, label: string) {
  await loadAllNotes();
  const md = generateSprintReviewMarkdown({ tasks: allTasks(), notes: corpus(), projects: allProjects(), fromIso: from, toIso: to, periodLabel: label });
  await createNote(`${t("proj-review-note")} ${label}`, "Reviews", md);
}

async function injectDue(day: string) {
  const date = new Date(`${day}T12:00:00`);
  const path = dailyPath(date);
  await openDailyNote(date);
  await ensureLoaded(path);
  const r = injectDueTasksIntoDailyNote(contents[path] ?? "", day, allTasks());
  if (r.injectedCount) setContent(path, r.content);
  toast(t("proj-injected", { count: r.injectedCount }));
}

function TaskTimer(props: { tasks: ProjectTask[] }) {
  const tid = setInterval(() => ui.setTick(Date.now()), 1000);
  onCleanup(() => clearInterval(tid));
  const task = () => allTasks().find((x) => x.id === ui.timerTask()) ?? props.tasks.find((x) => !x.done) ?? null;
  const elapsed = () => { const s = ui.timerStart(); return s ? Math.floor((ui.tick() - s) / 1000) : 0; };
  const fmt = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  const stop = async () => {
    const x = task();
    const mins = Math.max(1, Math.round(elapsed() / 60));
    ui.setTimerStart(null);
    if (x) { await logTime(x, mins); toast(t("proj-logged", { minutes: mins })); }
  };
  return (
    <div class="card glass-soft task-timer">
      <Clock aria-hidden="true" />
      <select class="select sm" value={task()?.id ?? ""} disabled={ui.timerStart() !== null} aria-label={t("proj-timer-task")} onChange={(e) => ui.setTimerTask(e.currentTarget.value)}>
        <For each={props.tasks.filter((x) => !x.done)}>{(x) => <option value={x.id}>{plain(x.title).slice(0, 60)}</option>}</For>
      </select>
      <span class="timer-face" aria-live="off">{fmt(elapsed())}</span>
      <Show when={ui.timerStart() !== null} fallback={<button class="btn sm primary" disabled={!task()} onClick={() => { ui.setTimerTask(task()!.id); ui.setTimerStart(Date.now()); }}><Play />{t("proj-timer-start")}</button>}>
        <button class="btn sm primary" onClick={() => void stop()}><Pause />{t("proj-timer-stop")}</button>
      </Show>
      <button class="btn sm" disabled={!task()} title={t("proj-log-15")} onClick={() => { const x = task(); if (x) void logTime(x, 15).then(() => toast(t("proj-logged", { minutes: 15 }))); }}>+15</button>
    </div>
  );
}

function Timeline(props: { tasks: ProjectTask[] }) {
  const [day, setDay] = createSignal(iso());
  const [from, setFrom] = createSignal(addDays(iso(), -7));
  const [to, setTo] = createSignal(iso());
  const [drag, setDrag] = createSignal<string | null>(null);
  const [hot, setHot] = createSignal<number | null>(null);
  const at = (h: number) => props.tasks.filter((x) => x.timeBlockDate === day() && x.timeBlockStartHour === h);
  const backlog = () => props.tasks.filter((x) => !x.done && !(x.timeBlockDate === day() && x.timeBlockStartHour !== undefined));
  const dueToday = () => props.tasks.filter((x) => x.dueDate === day() && !x.done).length;
  const drop = (h: number) => { const x = allTasks().find((y) => y.id === drag()); setDrag(null); setHot(null); if (x) void scheduleTask(x, day(), h); };
  return (
    <div class="planner stack">
      <div class="planner-bar">
        <div class="row">
          <button class="icon-btn" aria-label={t("proj-prev-day")} onClick={() => setDay(addDays(day(), -1))}><ChevronLeft class="flip-rtl" /></button>
          <DatePicker size="sm" label={t("proj-day")} value={day()} onChange={(v) => v && setDay(v)} />
          <button class="icon-btn" aria-label={t("proj-next-day")} onClick={() => setDay(addDays(day(), 1))}><ChevronRight class="flip-rtl" /></button>
          <button class="btn sm" disabled={day() === iso()} onClick={() => setDay(iso())}>{t("proj-today")}</button>
        </div>
        <button class="btn sm" onClick={() => void injectDue(day())} title={t("proj-inject-daily-help")}><CalendarPlus />{t("proj-inject-daily")}<Show when={dueToday()}><span class="count">{num(dueToday())}</span></Show></button>
        <div class="row review-range">
          <DatePicker size="sm" label={t("proj-start")} value={from()} onChange={setFrom} />
          <DatePicker size="sm" label={t("proj-end")} value={to()} onChange={setTo} />
          <button class="btn sm" onClick={() => void writeReview(from(), to(), `${from()} – ${to()}`)}><FilePlus2 />{t("proj-sprint-review")}</button>
        </div>
      </div>
      <TaskTimer tasks={props.tasks} />
      <div class="planner-grid">
        <section class="card glass-soft planner-backlog" aria-label={t("proj-unscheduled")}>
          <h3 class="section-title">{t("proj-unscheduled")} <span class="count">{num(backlog().length)}</span></h3>
          <ul>
            <For each={backlog()} fallback={<li class="muted sm">{t("proj-all-planned")}</li>}>
              {(x) => (
                <li class="tl-task" draggable="true" onDragStart={(e) => { setDrag(x.id); e.dataTransfer?.setData("text/plain", x.id); }} onDragEnd={() => { setDrag(null); setHot(null); }}>
                  <span dir="auto" class="tl-title">{plain(x.title)}</span>
                  <select class="select xs" value="" aria-label={t("proj-schedule-at", { title: plain(x.title) })} onChange={(e) => { const h = Number(e.currentTarget.value); if (h) void scheduleTask(x, day(), h); }}>
                    <option value="">{t("proj-plan-at")}</option>
                    <For each={HOURS}>{(h) => <option value={h}>{pad(h)}:00</option>}</For>
                  </select>
                </li>
              )}
            </For>
          </ul>
        </section>
        <section class="hours" aria-label={t("proj-time-blocks")}>
          <For each={HOURS}>
            {(h) => (
              <div class="hour" classList={{ hot: hot() === h, now: day() === iso() && new Date().getHours() === h }}
                onDragOver={(e) => { if (drag()) { e.preventDefault(); setHot(h); } }} onDragLeave={() => hot() === h && setHot(null)} onDrop={(e) => { e.preventDefault(); drop(h); }}>
                <span class="hour-label">{pad(h)}:00</span>
                <div class="hour-tasks">
                  <For each={at(h)}>{(x) => <span class="tl-task" classList={{ done: x.done }} draggable="true" onDragStart={() => setDrag(x.id)} dir="auto">{plain(x.title)}</span>}</For>
                </div>
              </div>
            )}
          </For>
        </section>
      </div>
    </div>
  );
}

function DepGraph(props: { tasks: ProjectTask[]; project: string | null; onEdit: (t: ProjectTask) => void }) {
  const [sel, setSel] = createSignal<string | null>(null);
  const g = createMemo(() => {
    const d = buildProjectDependencyGraph(props.tasks, corpus(), allProjects().filter((p) => !props.project || p.id === props.project));
    const cols: Record<string, number> = { project: 0, task: 1, note: 2 };
    const rows = [0, 0, 0];
    const pos = new Map(d.nodes.map((n) => { const c = cols[n.kind]; return [n.id, { x: 20 + c * 320, y: 30 + rows[c]++ * 36 }]; }));
    return { ...d, pos, h: Math.max(1, ...rows) * 36 + 40 };
  });
  const node = () => g().nodes.find((n) => n.id === sel()) ?? null;
  const task = () => { const n = node(); return n?.kind === "task" ? allTasks().find((x) => n.id.endsWith(x.id)) ?? null : null; };
  const near = (id: string) => g().edges.some((e) => (e.from === sel() && e.to === id) || (e.to === sel() && e.from === id));
  return (
    <div class="graph-wrap">
      <Show when={g().nodes.length} fallback={<p class="empty">{t("proj-no-tasks")}</p>}>
        <svg class="dep-graph" viewBox={`0 0 900 ${g().h}`} role="img" aria-label={t("proj-tab-graph")}>
          <For each={g().edges}>{(e) => { const a = g().pos.get(e.from), b = g().pos.get(e.to); return a && b ? <path class={`dep-edge ${e.kind}`} classList={{ lit: e.from === sel() || e.to === sel() }} d={`M${a.x + 240},${a.y} C${a.x + 280},${a.y} ${b.x - 40},${b.y} ${b.x},${b.y}`} /> : null; }}</For>
          <For each={g().nodes}>{(n) => { const p = g().pos.get(n.id)!; return (
            <g class={`dep-node ${n.kind}`} classList={{ done: !!n.done, sel: sel() === n.id, dim: !!sel() && sel() !== n.id && !near(n.id) }} transform={`translate(${p.x} ${p.y - 13})`} tabIndex={0} role="button" aria-label={n.label}
              onClick={() => setSel(sel() === n.id ? null : n.id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(n.id); }}>
              <rect width="240" height="26" rx="8" style={{ stroke: n.color }} /><text x="10" y="17">{plain(n.label).length > 32 ? `${plain(n.label).slice(0, 31)}…` : plain(n.label)}</text>
            </g>); }}</For>
        </svg>
      </Show>
      <Show when={node()}>
        {(n) => (
          <aside class="card glass-soft graph-detail">
            <div class="row"><strong dir="auto" class="ellipsis">{n().label}</strong><span class="tb-fill" /><button class="icon-btn sm" aria-label={t("action-close")} onClick={() => setSel(null)}><X /></button></div>
            <div class="row wrap">
              <Show when={n().notePath}><button class="btn sm" onClick={() => openBeside(n().notePath!)}><PanelRight />{t("proj-open-beside")}</button></Show>
              <Show when={task()}><button class="btn sm" onClick={() => props.onEdit(task()!)}><Pencil />{t("proj-edit-task")}</button></Show>
            </div>
            <Show when={task() && editable(task()!)}>
              <BlockerEditor task={task()!} onChange={(b) => upsertTask({ ...task()!, blockedBy: b })} />
            </Show>
          </aside>
        )}
      </Show>
    </div>
  );
}

function Automation(props: { onTemplate: (id: ProjectTemplateId) => void }) {
  const rules = () => projectState.state.tagRules ?? [];
  const set = (fn: (r: TagWorkflowRule[]) => void) => projectState.update((s) => { s.tagRules ??= []; fn(s.tagRules); });
  return (
    <div class="stack">
      <section class="stack">
        <h2 class="section-title">{t("proj-templates")}</h2>
        <div class="tpl-grid">
          <For each={SMART_PROJECT_TEMPLATES}>{(x) => (
            <button class="card glass-soft tpl-card" onClick={() => props.onTemplate(x.id)}>
              <strong>{t(`proj-tpl-${x.id}`)}</strong><span class="muted sm">{t(`proj-tpl-${x.id}-desc`)}</span>
            </button>
          )}</For>
        </div>
      </section>
      <section class="stack">
        <h2 class="section-title">{t("proj-tab-rules")}</h2>
        <p class="muted sm">{t("proj-rules-help")}</p>
        <ul class="rule-list">
          <For each={rules()}>
            {(r, i) => (
              <li class="rule card glass-soft" classList={{ off: !r.enabled }}>
                <input type="checkbox" checked={r.enabled} aria-label={t("proj-rule-on")} onChange={(e) => { const v = e.currentTarget.checked; set((x) => { x[i()].enabled = v; }); }} />
                <label class="tag-input"><Hash aria-hidden="true" /><input class="input sm" value={r.tag} aria-label={t("proj-tags")} onChange={(e) => { const v = e.currentTarget.value.replace(/^#/, "").trim(); set((x) => { x[i()].tag = v; }); }} /></label>
                <select class="select sm" value={allProjects().some((p) => p.id === r.targetProjectId) ? r.targetProjectId : "proj-main"} aria-label={t("proj-project")} onChange={(e) => { const v = e.currentTarget.value; set((x) => { x[i()].targetProjectId = v; }); }}><option value="proj-main">{t("proj-primary-project")}</option><For each={allProjects()}>{(p) => <option value={p.id}>{p.name}</option>}</For></select>
                <select class="select sm" value={r.targetColumn} aria-label={t("proj-status")} onChange={(e) => { const v = e.currentTarget.value as ProjectTaskStatus; set((x) => { x[i()].targetColumn = v; }); }}><For each={PROJECT_COLUMNS}>{(c) => <option value={c.id}>{t(`proj-col-${c.id}`)}</option>}</For></select>
                <select class="select sm" value={r.priority} aria-label={t("proj-priority")} onChange={(e) => { const v = e.currentTarget.value as Priority; set((x) => { x[i()].priority = v; }); }}><For each={PRIORITIES}>{(p) => <option value={p}>{t(`proj-pri-${p}`)}</option>}</For></select>
                <button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => set((x) => { x.splice(i(), 1); })}><Trash2 /></button>
              </li>
            )}
          </For>
        </ul>
        <button class="btn sm align-start" onClick={() => set((x) => { x.push({ id: newId("rule"), tag: "todo", targetProjectId: "proj-main", targetColumn: "inbox", priority: "medium", enabled: true }); })}><Plus />{t("proj-add-rule")}</button>
      </section>
    </div>
  );
}

function SplitNote(props: { path: string }) {
  return (
    <aside class="proj-split glass-soft" aria-label={noteTitle(props.path)}>
      <header class="row">
        <FileText aria-hidden="true" />
        <strong dir="auto" class="ellipsis">{noteTitle(props.path)}</strong>
        <span class="tb-fill" />
        <button class="icon-btn sm" title={t("proj-open-editor")} aria-label={t("proj-open-editor")} onClick={() => { openNote(props.path); ui.setSplit(null); }}><ExternalLink /></button>
        <button class="icon-btn sm" title={t("action-close")} aria-label={t("action-close")} onClick={() => ui.setSplit(null)}><X /></button>
      </header>
      <div class="proj-split-body"><Reader path={props.path} /></div>
    </aside>
  );
}

export default function Projects() {
  const [tab, setTab] = createSignal<Tab>("board");
  const [project, setProject] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal<ProjectTemplateId | null>(null);
  const [picking, setPicking] = createSignal(false);
  const [editing, setEditing] = createSignal<ProjectTask | null>(null);
  const [filters, setFilters] = createSignal(false);
  const [keyword, setKeyword] = createSignal("");
  const [recent, setRecent] = createSignal<"all" | "24h" | "7d">("all");
  const [source, setSource] = createSignal<"all" | "synced" | "manual">("all");
  const [title, setTitle] = createSignal("");
  const [priority, setPriority] = createSignal<Priority>("medium");
  const [sprint, setSprint] = createSignal("");
  onMount(() => void loadAllNotes());

  const proj = () => allProjects().find((p) => p.id === project()) ?? null;
  const filtered = createMemo(() => {
    const base = allTasks().filter((x) => !project() || x.projectId === project());
    return keyword() || recent() !== "all" || source() !== "all" ? filterTasksWithFileContext(base, corpus(), { keyword: keyword(), recentWindow: recent(), sourceFilter: source() }) : base;
  });
  const filterCount = () => Number(!!keyword()) + Number(recent() !== "all") + Number(source() !== "all");
  const targetProject = () => project() ?? primaryProject()?.id ?? null;
  const sprints = () => projectState.state.sprints.filter((s) => s.projectId === targetProject());
  const addTask = () => {
    const v = title().trim();
    const pid = targetProject();
    if (!v || !pid) return;
    const p = allProjects().find((x) => x.id === pid);
    upsertTask({ id: newId("task"), projectId: pid, sprintId: sprint() || undefined, title: v, done: false, status: "todo", priority: priority(), dueDate: p?.deadline, sourceType: "manual", createdAt: Date.now() });
    setTitle("");
  };
  const hero = createMemo(() => {
    const p = primaryProject();
    if (!p) return null;
    return { p, prog: computeTaskProgress(allTasks().filter((x) => x.projectId === p.id)), c: computeDeadlineCountdown(p.deadline) };
  });
  const countdown = (c: ReturnType<typeof computeDeadlineCountdown>) => c ? (c.expired ? t("dash-overdue", { days: c.days }) : t("dash-countdown", { days: c.days, hours: c.hours })) : "";
  const more = (e: MouseEvent) => openMenu(e, [
    { label: t("proj-weekly-review"), icon: <FilePlus2 />, run: () => void writeReview(addDays(iso(), -7), iso(), iso()) },
    { label: t("proj-inject-daily"), icon: <CalendarPlus />, run: () => void injectDue(iso()) },
    { label: t("proj-from-note"), icon: <Link2 />, disabled: !targetProject(), run: () => setPicking(true) },
    { label: t("proj-show-deadline"), checked: projectState.state.spotlightEnabled, sep: true, run: () => projectState.update((s) => { s.spotlightEnabled = !s.spotlightEnabled; }) },
  ]);

  const content = (): JSX.Element => (
    <Switch>
      <Match when={tab() === "board"}><Board tasks={filtered()} project={project()} onEdit={setEditing} /></Match>
      <Match when={tab() === "list"}><div class="stack"><Sprints project={project()} /><TaskList tasks={filtered()} onEdit={setEditing} /></div></Match>
      <Match when={tab() === "timeline"}><Timeline tasks={filtered()} /></Match>
      <Match when={tab() === "graph"}><DepGraph tasks={filtered()} project={project()} onEdit={setEditing} /></Match>
      <Match when={tab() === "automation"}><Automation onTemplate={(id) => setCreating(id)} /></Match>
    </Switch>
  );

  return (
    <div class="projects page" classList={{ "has-split": !!ui.split() }}>
      <div class="proj-main">
        <header class="page-head">
          <h1>{t("view-projects")}</h1>
          <button class="icon-btn" title={t("more-actions")} aria-label={t("more-actions")} onClick={more}><MoreHorizontal /></button>
          <button class="btn primary" onClick={() => setCreating("blank")}><Plus />{t("proj-new")}</button>
        </header>

        <Show when={hero()}>
          {(h) => (
            <div class="proj-hero" style={{ "--col": h().p.color }}>
              <ProjectIcon p={h().p} />
              <strong dir="auto" class="ellipsis">{h().p.name}</strong>
              <Star class="filled" aria-label={t("proj-primary")} />
              <div class="meter" role="progressbar" aria-valuenow={h().prog.percent} aria-valuemin="0" aria-valuemax="100" aria-label={h().p.name}><span style={{ width: `${h().prog.percent}%` }} /></div>
              <span class="muted sm">{num(h().prog.percent)}% · {t("proj-progress", { done: h().prog.done, total: h().prog.total })}</span>
              <Show when={h().c}><span class="sm" classList={{ late: h().c!.urgency === "overdue" || h().c!.urgency === "critical" }}>{countdown(h().c)}</span></Show>
            </div>
          )}
        </Show>

        <div class="proj-strip" role="tablist" aria-label={t("view-projects")}>
          <button class="chip" role="tab" aria-selected={project() === null} onClick={() => setProject(null)}>{t("proj-all")}<span class="count">{num(allTasks().length)}</span></button>
          <For each={allProjects()}>
            {(p) => {
              const prog = () => computeTaskProgress(allTasks().filter((x) => x.projectId === p.id));
              return (
                <button class="chip proj-chip" role="tab" aria-selected={project() === p.id} style={{ "--col": p.color }} title={countdown(computeDeadlineCountdown(p.deadline))}
                  onClick={() => setProject(p.id)} onContextMenu={(e) => projectMenu(e, p, () => setProject(null))}>
                  <ProjectIcon p={p} />
                  <span dir="auto" class="ellipsis">{p.name}</span>
                  <span class="count">{num(prog().percent)}%</span>
                  <Show when={primaryProject()?.id === p.id}><Star class="filled" aria-label={t("proj-primary")} /></Show>
                </button>
              );
            }}
          </For>
          <Show when={proj()}>{(p) => <button class="icon-btn sm" aria-label={t("more-actions")} title={t("more-actions")} onClick={(e) => projectMenu(e, p(), () => setProject(null))}><MoreHorizontal /></button>}</Show>
        </div>

        <div class="proj-toolbar">
          <div class="segmented" role="tablist">
            <For each={TABS}>{(x) => <button role="tab" aria-selected={tab() === x.id} title={t(`proj-tab-${x.id}`)} onClick={() => setTab(x.id)}><x.icon aria-hidden="true" /><span class="seg-label">{t(`proj-tab-${x.id}`)}</span></button>}</For>
          </div>
          <button class="icon-btn" aria-pressed={filters() || filterCount() > 0} title={t("proj-filter")} aria-label={t("proj-filter")} onClick={() => setFilters(!filters())}><Filter /><Show when={filterCount()}><span class="dot-count">{num(filterCount())}</span></Show></button>
        </div>

        <Show when={filters()}>
          <div class="filter-bar">
            <input class="input sm" type="search" dir="auto" placeholder={t("proj-filter-keyword")} aria-label={t("proj-filter-keyword")} value={keyword()} onInput={(e) => setKeyword(e.currentTarget.value)} />
            <select class="select sm" value={recent()} aria-label={t("proj-filter-recent")} onChange={(e) => setRecent(e.currentTarget.value as "all")}>
              <option value="all">{t("proj-recent-all")}</option><option value="24h">{t("proj-recent-24h")}</option><option value="7d">{t("proj-recent-7d")}</option>
            </select>
            <select class="select sm" value={source()} aria-label={t("proj-filter-source")} onChange={(e) => setSource(e.currentTarget.value as "all")}>
              <option value="all">{t("proj-source-all")}</option><option value="synced">{t("proj-source-notes")}</option><option value="manual">{t("proj-source-manual")}</option>
            </select>
            <Show when={filterCount()}><button class="btn sm" onClick={() => { setKeyword(""); setRecent("all"); setSource("all"); }}>{t("proj-clear-filters")}</button></Show>
          </div>
        </Show>

        <Show when={(tab() === "board" || tab() === "list") && targetProject()}>
          <form class="quick-add" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
            <input class="input" dir="auto" placeholder={t("proj-quick-add")} aria-label={t("proj-add-task")} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
            <select class="select sm" value={priority()} aria-label={t("proj-priority")} onChange={(e) => setPriority(e.currentTarget.value as Priority)}><For each={PRIORITIES}>{(p) => <option value={p}>{t(`proj-pri-${p}`)}</option>}</For></select>
            <Show when={sprints().length}>
              <select class="select sm" value={sprint()} aria-label={t("proj-sprint")} onChange={(e) => setSprint(e.currentTarget.value)}><option value="">{t("proj-no-sprint")}</option><For each={sprints()}>{(s) => <option value={s.id}>{s.name}</option>}</For></select>
            </Show>
            <button class="btn sm primary" disabled={!title().trim()}><Plus />{t("action-add")}</button>
            <button type="button" class="btn sm" title={t("proj-from-note-help")} onClick={() => setPicking(true)}><Link2 />{t("proj-from-note")}</button>
          </form>
        </Show>

        <Show when={allProjects().length} fallback={
          <div class="empty-state"><KanbanSquare /><p>{t("proj-empty")}</p><button class="btn primary" onClick={() => setCreating("blank")}><Plus />{t("proj-new")}</button></div>
        }>{content()}</Show>
      </div>

      <Show when={ui.split()} keyed>{(p) => <SplitNote path={p} />}</Show>
      <Show when={creating()} keyed>{(tpl) => <NewProject template={tpl} onClose={() => setCreating(null)} onCreated={(id) => setProject(id)} />}</Show>
      <Show when={editingProject()} keyed>{(p) => <EditProject p={p} onClose={() => setEditingProject(null)} />}</Show>
      <Show when={picking() && targetProject()}><NotePicker projectId={targetProject()!} onClose={() => setPicking(false)} /></Show>
      <Show when={editing()} keyed>{(x) => <TaskEditor task={x} onClose={() => setEditing(null)} />}</Show>
    </div>
  );
}
