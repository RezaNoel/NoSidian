// Project mode: projects (manual or folders with a project note), a task
// board fed by Markdown checkboxes and tag rules, sprints with reviews, a
// timeline with time blocks, a dependency graph and tag workflow rules.
import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";
import { CalendarClock, FileText, Plus, Star, Trash2 } from "lucide-solid";
import { t } from "../../i18n";
import { PROJECT_COLUMNS, SMART_PROJECT_TEMPLATES, buildProjectDependencyGraph, generateSmartProjectFiles, generateSprintReviewMarkdown, injectDueTasksIntoDailyNote } from "../../core/projectEngine";
import { computeDeadlineCountdown, computeTaskProgress } from "../../core/projects";
import type { ProjectItem, ProjectTask, ProjectTaskStatus, ProjectTemplateId, TagWorkflowRule } from "../../core/types";
import { allProjects, allTasks, logTime, newId, primaryProject, projectState, removeTask, scheduleTask, setTaskStatus, toggleTask, upsertTask } from "../../state/projects";
import { corpus, loadAllNotes } from "../../state/corpus";
import { backend } from "../../backend";
import { contents, createNote, ensureLoaded, openNote, refresh, setContent, tree } from "../../state/vault";
import { dailyPath, openDailyNote } from "../../state/daily";
import { askText, toast } from "../../state/ui";
import { noteTitle } from "../../lib/markdown";
import { Modal } from "../Modal";
import { revealLine } from "../Editor";

type Tab = "board" | "sprints" | "timeline" | "graph" | "rules";
const iso = (d = new Date()) => d.toISOString().slice(0, 10);

function NewProject(props: { onClose: () => void }) {
  const [name, setName] = createSignal("");
  const [deadline, setDeadline] = createSignal(iso(new Date(Date.now() + 21 * 864e5)));
  const [tpl, setTpl] = createSignal<ProjectTemplateId>("blank");
  const [color, setColor] = createSignal("#8b7cf6");
  const create = async () => {
    const n = name().trim();
    if (!n) return;
    const files = generateSmartProjectFiles(n, tpl(), deadline());
    for (const f of files) {
      const folder = f.path.slice(0, f.path.lastIndexOf("/"));
      if (!tree.folders.includes(folder)) await backend.createFolder(folder).catch(() => undefined);
      await backend.createNote(f.path, f.content).catch(() => undefined);
    }
    await refresh();
    projectState.update((s) => { s.projects.push({ id: newId("proj"), name: n, description: "", color: color(), deadline: deadline(), isPrimary: !s.projects.length, status: "active", createdAt: Date.now(), folderPath: files[0]?.path.slice(0, files[0].path.lastIndexOf("/")), templateId: tpl() }); });
    if (files[0]) openNote(files[0].path);
    props.onClose();
  };
  return (
    <Modal title={t("proj-new")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label class="field"><span>{t("proj-name")}</span><input class="input" data-autofocus dir="auto" value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <div class="row">
          <label class="field"><span>{t("proj-deadline")}</span><input class="input" type="date" value={deadline()} onInput={(e) => setDeadline(e.currentTarget.value)} /></label>
          <label class="field"><span>{t("proj-color")}</span><input class="input color" type="color" value={color()} onInput={(e) => setColor(e.currentTarget.value)} /></label>
        </div>
        <fieldset class="choice-grid">
          <legend>{t("dash-template")}</legend>
          <For each={SMART_PROJECT_TEMPLATES}>{(x) => <label class="choice-card"><input type="radio" name="ptpl" checked={tpl() === x.id} onChange={() => setTpl(x.id)} /><strong>{t(`proj-tpl-${x.id}`)}</strong><span>{t(`proj-tpl-${x.id}-desc`)}</span></label>}</For>
        </fieldset>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!name().trim()}>{t("action-create")}</button></div>
      </form>
    </Modal>
  );
}

function TaskEditor(props: { task: ProjectTask; onClose: () => void }) {
  const [x, setX] = createSignal<ProjectTask>({ ...props.task, tags: [...(props.task.tags ?? [])], blockedBy: [...(props.task.blockedBy ?? [])] });
  const md = props.task.sourceType === "markdown-checkbox" || props.task.sourceType === "tag-rule";
  const patch = (p: Partial<ProjectTask>) => setX((v) => ({ ...v, ...p }));
  const save = () => { if (!md) upsertTask(x()); props.onClose(); };
  return (
    <Modal title={t("proj-edit-task")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Show when={md}><p class="muted sm">{t("proj-md-task-hint")}</p></Show>
        <label class="field"><span>{t("proj-task-title")}</span><input class="input" dir="auto" disabled={md} value={x().title} onInput={(e) => patch({ title: e.currentTarget.value })} /></label>
        <label class="field"><span>{t("proj-task-desc")}</span><textarea class="input" dir="auto" disabled={md} value={x().description ?? ""} onInput={(e) => patch({ description: e.currentTarget.value })} /></label>
        <div class="row wrap">
          <label class="field"><span>{t("proj-project")}</span><select class="select" disabled={md} value={x().projectId} onChange={(e) => patch({ projectId: e.currentTarget.value })}><For each={allProjects()}>{(p) => <option value={p.id}>{p.name}</option>}</For></select></label>
          <label class="field"><span>{t("proj-priority")}</span><select class="select" disabled={md} value={x().priority} onChange={(e) => patch({ priority: e.currentTarget.value as ProjectTask["priority"] })}><For each={["low", "medium", "high"] as const}>{(p) => <option value={p}>{t(`proj-pri-${p}`)}</option>}</For></select></label>
          <label class="field"><span>{t("proj-due")}</span><input class="input" type="date" disabled={md} value={x().dueDate ?? ""} onInput={(e) => patch({ dueDate: e.currentTarget.value || undefined })} /></label>
          <label class="field"><span>{t("proj-sprint")}</span><select class="select" disabled={md} value={x().sprintId ?? ""} onChange={(e) => patch({ sprintId: e.currentTarget.value || undefined })}><option value="">—</option><For each={projectState.state.sprints}>{(s) => <option value={s.id}>{s.name}</option>}</For></select></label>
        </div>
        <label class="field"><span>{t("proj-tags")}</span><input class="input" disabled={md} value={(x().tags ?? []).join(", ")} onInput={(e) => patch({ tags: e.currentTarget.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean) })} /></label>
        <label class="field"><span>{t("proj-blocked-by")}</span>
          <select class="select" multiple disabled={md} size="4" onChange={(e) => patch({ blockedBy: [...e.currentTarget.selectedOptions].map((o) => o.value) })}>
            <For each={allTasks().filter((o) => o.id !== x().id && o.projectId === x().projectId)}>{(o) => <option value={o.id} selected={x().blockedBy?.includes(o.id)}>{o.title}</option>}</For>
          </select>
        </label>
        <div class="row">
          <button type="button" class="btn sm" onClick={async () => { const v = await askText(t("proj-log-time"), "25", t("action-add")); const n = Number(v); if (n > 0) { await logTime(props.task, n); toast(t("proj-logged", { minutes: n })); } }}>{t("proj-log-time")}</button>
          <button type="button" class="btn sm" onClick={async () => { const v = await askText(t("proj-schedule"), `${iso()} 9`, t("action-add")); const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2})$/.exec(v?.trim() ?? ""); if (m) await scheduleTask(props.task, m[1], Number(m[2])); }}><CalendarClock />{t("proj-schedule")}</button>
          <Show when={props.task.sourcePath}><button type="button" class="btn sm" onClick={() => { openNote(props.task.sourcePath!); if (props.task.sourceLine !== undefined) revealLine(props.task.sourcePath!, props.task.sourceLine); props.onClose(); }}><FileText />{t("srs-open-source")}</button></Show>
          <span class="tb-fill" />
          <Show when={!md}><button type="button" class="btn sm danger" onClick={() => { removeTask(props.task.id); props.onClose(); }}><Trash2 />{t("action-delete")}</button></Show>
        </div>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><Show when={!md}><button class="btn primary">{t("action-save")}</button></Show></div>
      </form>
    </Modal>
  );
}

function Board(props: { project: string | null; onEdit: (t: ProjectTask) => void }) {
  const [drag, setDrag] = createSignal<ProjectTask | null>(null);
  const [q, setQ] = createSignal("");
  const tasks = createMemo(() => allTasks().filter((x) => (!props.project || x.projectId === props.project) && (!q() || x.title.toLowerCase().includes(q().toLowerCase()) || x.tags?.some((tg) => tg.includes(q().replace(/^#/, ""))))));
  const add = async (status: ProjectTaskStatus) => {
    const title = await askText(t("proj-add-task"), "", t("action-add"));
    if (!title?.trim()) return;
    upsertTask({ id: newId("task"), projectId: props.project ?? primaryProject()?.id ?? "inbox", title: title.trim(), done: status === "done", status, priority: "medium", sourceType: "manual", createdAt: Date.now() });
  };
  const blocked = (x: ProjectTask) => (x.blockedBy ?? []).some((id) => allTasks().find((y) => y.id === id && !y.done));
  return (
    <div class="stack">
      <input class="input sm" type="search" placeholder={t("proj-filter")} aria-label={t("proj-filter")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
      <div class="kanban-cols">
        <For each={PROJECT_COLUMNS}>
          {(col) => {
            const list = () => tasks().filter((x) => (x.status ?? (x.done ? "done" : "todo")) === col.id);
            return (
              <section class="kanban-col glass-soft" style={{ "--col": col.accent }} aria-label={t(`proj-col-${col.id}`)}
                onDragOver={(e) => { if (drag()) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const d = drag(); setDrag(null); if (d) void setTaskStatus(d, col.id); }}>
                <header class="kanban-head"><span class="col-dot" /><strong>{t(`proj-col-${col.id}`)}</strong><span class="count">{list().length}</span>
                  <button class="icon-btn sm" aria-label={t("proj-add-task")} title={t("proj-add-task")} onClick={() => void add(col.id)}><Plus /></button></header>
                <ul class="kanban-cards">
                  <For each={list()}>
                    {(x) => (
                      <li class="kanban-card task" classList={{ done: x.done, blocked: blocked(x) }} draggable="true" tabIndex={0} onDragStart={() => setDrag(x)} onDragEnd={() => setDrag(null)}
                        onKeyDown={(e) => { if (e.key === "Enter") props.onEdit(x); if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); const i = PROJECT_COLUMNS.findIndex((c) => c.id === col.id) + (e.key === "ArrowRight" ? 1 : -1); if (PROJECT_COLUMNS[i]) void setTaskStatus(x, PROJECT_COLUMNS[i].id); } }}>
                        <input type="checkbox" checked={x.done} aria-label={t("kanban-card-done")} onChange={() => void toggleTask(x)} />
                        <button class="task-title" dir="auto" onClick={() => props.onEdit(x)}>{x.title}</button>
                        <div class="task-meta">
                          <span class={`pri ${x.priority}`}>{t(`proj-pri-${x.priority}`)}</span>
                          <Show when={x.dueDate}><span class="muted">{x.dueDate}</span></Show>
                          <Show when={x.sourceType === "markdown-checkbox"}><span class="muted" title={x.sourcePath}>{noteTitle(x.sourcePath ?? "")}</span></Show>
                          <Show when={blocked(x)}><span class="warn">{t("proj-blocked")}</span></Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function Sprints(props: { project: string | null }) {
  const list = () => projectState.state.sprints.filter((s) => !props.project || s.projectId === props.project);
  const add = async () => {
    const name = await askText(t("proj-new-sprint"), t("proj-sprint-default", { n: projectState.state.sprints.length + 1 }), t("action-create"));
    if (!name) return;
    projectState.update((s) => { s.sprints.push({ id: newId("spr"), projectId: props.project ?? primaryProject()?.id ?? "", name, startDate: iso(), endDate: iso(new Date(Date.now() + 14 * 864e5)), goal: "", status: "planned" }); });
  };
  const review = async (from: string, to: string, label: string) => {
    await loadAllNotes();
    const md = generateSprintReviewMarkdown({ tasks: allTasks(), notes: corpus(), projects: allProjects(), fromIso: from, toIso: to, periodLabel: label });
    await createNote(`Sprint Review ${label}`, "Reviews", md);
  };
  return (
    <div class="stack">
      <div class="row"><button class="btn sm" onClick={() => void add()}><Plus />{t("proj-new-sprint")}</button>
        <button class="btn sm" onClick={() => void review(iso(new Date(Date.now() - 7 * 864e5)), iso(), iso())}>{t("proj-weekly-review")}</button></div>
      <For each={list()} fallback={<p class="empty sm">{t("proj-no-sprints")}</p>}>
        {(sp) => {
          const tasks = () => allTasks().filter((x) => x.sprintId === sp.id);
          const prog = () => computeTaskProgress(tasks());
          const set = (p: Partial<typeof sp>) => projectState.update((s) => { const x = s.sprints.find((y) => y.id === sp.id); if (x) Object.assign(x, p); });
          return (
            <article class="card glass-soft stack">
              <div class="row wrap">
                <input class="input sm" dir="auto" value={sp.name} aria-label={t("proj-sprint")} onChange={(e) => set({ name: e.currentTarget.value })} />
                <input class="input sm" type="date" value={sp.startDate} aria-label={t("proj-start")} onChange={(e) => set({ startDate: e.currentTarget.value })} />
                <input class="input sm" type="date" value={sp.endDate} aria-label={t("proj-end")} onChange={(e) => set({ endDate: e.currentTarget.value })} />
                <select class="select sm" value={sp.status} aria-label={t("proj-status")} onChange={(e) => set({ status: e.currentTarget.value as typeof sp.status })}><For each={["planned", "active", "done"] as const}>{(x) => <option value={x}>{t(`proj-sprint-${x}`)}</option>}</For></select>
                <button class="btn sm" onClick={() => void review(sp.startDate, sp.endDate, sp.name)}>{t("proj-sprint-review")}</button>
                <button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => projectState.update((s) => { s.sprints = s.sprints.filter((x) => x.id !== sp.id); })}><Trash2 /></button>
              </div>
              <input class="input sm" dir="auto" placeholder={t("proj-sprint-goal")} value={sp.goal} onChange={(e) => set({ goal: e.currentTarget.value })} />
              <div class="meter" role="progressbar" aria-valuenow={prog().percent} aria-valuemin="0" aria-valuemax="100" aria-label={sp.name}><span style={{ width: `${prog().percent}%` }} /></div>
              <span class="muted sm">{t("proj-progress", { done: prog().done, total: prog().total })}</span>
            </article>
          );
        }}
      </For>
    </div>
  );
}

function Timeline(props: { project: string | null }) {
  const [start, setStart] = createSignal(new Date(new Date().setHours(0, 0, 0, 0) - 3 * 864e5));
  const days = () => Array.from({ length: 21 }, (_, i) => new Date(start().getTime() + i * 864e5));
  const tasks = () => allTasks().filter((x) => (!props.project || x.projectId === props.project) && (x.dueDate || x.timeBlockDate));
  return (
    <div class="timeline">
      <div class="row"><button class="btn sm" onClick={() => setStart(new Date(start().getTime() - 7 * 864e5))}>‹</button><button class="btn sm" onClick={() => setStart(new Date(new Date().setHours(0, 0, 0, 0) - 3 * 864e5))}>{t("proj-today")}</button><button class="btn sm" onClick={() => setStart(new Date(start().getTime() + 7 * 864e5))}>›</button></div>
      <div class="tl-grid" style={{ "--days": days().length }}>
        <For each={days()}>{(d) => <div class="tl-day" classList={{ today: iso(d) === iso() }}><span>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</span>
          <For each={tasks().filter((x) => x.dueDate === iso(d) || x.timeBlockDate === iso(d))}>{(x) => <div class="tl-task" classList={{ done: x.done }} title={x.title} dir="auto">{x.timeBlockDate === iso(d) && x.timeBlockStartHour !== undefined ? `${x.timeBlockStartHour}:00 ` : ""}{x.title}</div>}</For>
        </div>}</For>
      </div>
      <button class="btn sm" onClick={async () => {
        const path = dailyPath(new Date());
        await openDailyNote(new Date());
        await ensureLoaded(path);
        const r = injectDueTasksIntoDailyNote(contents[path] ?? "", iso(), allTasks());
        if (r.injectedCount) setContent(path, r.content);
        toast(t("proj-injected", { count: r.injectedCount }));
      }}>{t("proj-inject-daily")}</button>
    </div>
  );
}

function DepGraph(props: { project: string | null }) {
  const g = createMemo(() => {
    const d = buildProjectDependencyGraph(allTasks().filter((x) => !props.project || x.projectId === props.project), corpus(), allProjects().filter((p) => !props.project || p.id === props.project));
    const cols: Record<string, number> = { project: 0, task: 1, note: 2 };
    const rows = [0, 0, 0];
    const pos = new Map(d.nodes.map((n) => { const c = cols[n.kind]; return [n.id, { x: 40 + c * 300, y: 30 + rows[c]++ * 34 }]; }));
    return { ...d, pos, h: Math.max(...rows) * 34 + 60 };
  });
  return (
    <svg class="dep-graph" viewBox={`0 0 980 ${g().h}`} role="img" aria-label={t("proj-tab-graph")}>
      <For each={g().edges}>{(e) => { const a = g().pos.get(e.from), b = g().pos.get(e.to); return a && b ? <path class={`dep-edge ${e.kind}`} d={`M${a.x + 220},${a.y} C${a.x + 260},${a.y} ${b.x - 40},${b.y} ${b.x},${b.y}`} /> : null; }}</For>
      <For each={g().nodes}>{(n) => { const p = g().pos.get(n.id)!; return (
        <g class={`dep-node ${n.kind}`} classList={{ done: !!n.done }} transform={`translate(${p.x} ${p.y - 12})`} onClick={() => n.notePath && openNote(n.notePath)}>
          <rect width="220" height="24" rx="8" style={{ stroke: n.color }} /><text x="10" y="16">{n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label}</text>
        </g>); }}</For>
    </svg>
  );
}

function Rules() {
  const rules = () => projectState.state.tagRules ?? [];
  const set = (fn: (r: TagWorkflowRule[]) => void) => projectState.update((s) => { s.tagRules ??= []; fn(s.tagRules); });
  return (
    <div class="stack">
      <p class="muted">{t("proj-rules-help")}</p>
      <For each={rules()}>
        {(r, i) => (
          <div class="row wrap">
            <label class="check"><input type="checkbox" checked={r.enabled} onChange={(e) => { const v = e.currentTarget.checked; set((x) => { x[i()].enabled = v; }); }} />#</label>
            <input class="input sm" value={r.tag} aria-label={t("proj-tags")} onChange={(e) => { const v = e.currentTarget.value.replace(/^#/, ""); set((x) => { x[i()].tag = v; }); }} />
            <select class="select sm" value={r.targetProjectId} aria-label={t("proj-project")} onChange={(e) => { const v = e.currentTarget.value; set((x) => { x[i()].targetProjectId = v; }); }}><For each={allProjects()}>{(p) => <option value={p.id}>{p.name}</option>}</For></select>
            <select class="select sm" value={r.targetColumn} aria-label={t("proj-status")} onChange={(e) => { const v = e.currentTarget.value as ProjectTaskStatus; set((x) => { x[i()].targetColumn = v; }); }}><For each={PROJECT_COLUMNS}>{(c) => <option value={c.id}>{t(`proj-col-${c.id}`)}</option>}</For></select>
            <button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => set((x) => { x.splice(i(), 1); })}><Trash2 /></button>
          </div>
        )}
      </For>
      <button class="btn sm" onClick={() => set((x) => { x.push({ id: newId("rule"), tag: "todo", targetProjectId: primaryProject()?.id ?? "", targetColumn: "inbox", priority: "medium", enabled: true }); })}><Plus />{t("proj-add-rule")}</button>
    </div>
  );
}

export default function Projects() {
  const [tab, setTab] = createSignal<Tab>("board");
  const [project, setProject] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [editing, setEditing] = createSignal<ProjectTask | null>(null);
  onMount(() => void loadAllNotes());
  const proj = () => allProjects().find((p) => p.id === project()) ?? null;
  const setPrimary = (p: ProjectItem) => projectState.update((s) => { s.spotlightProjectId = p.id; s.projects.forEach((x) => { x.isPrimary = x.id === p.id; }); });
  return (
    <div class="projects page">
      <header class="page-head">
        <h1>{t("view-projects")}</h1>
        <button class="btn primary sm" onClick={() => setCreating(true)}><Plus />{t("proj-new")}</button>
      </header>
      <div class="proj-strip">
        <button class="chip" aria-pressed={project() === null} onClick={() => setProject(null)}>{t("proj-all")}</button>
        <For each={allProjects()}>
          {(p) => {
            const c = () => computeDeadlineCountdown(p.deadline);
            const prog = () => computeTaskProgress(allTasks().filter((x) => x.projectId === p.id));
            return (
              <button class="proj-chip glass-soft" aria-pressed={project() === p.id} style={{ "--col": p.color }} onClick={() => setProject(p.id)}>
                <strong dir="auto">{p.name}</strong>
                <span class="muted sm">{prog().percent}% · {c() ? (c()!.expired ? t("dash-overdue", { days: c()!.days }) : t("dash-countdown", { days: c()!.days, hours: c()!.hours })) : ""}</span>
                <Show when={primaryProject()?.id === p.id}><Star class="filled" aria-label={t("proj-primary")} /></Show>
              </button>
            );
          }}
        </For>
      </div>
      <Show when={proj()}>
        {(p) => (
          <div class="row wrap proj-meta">
            <button class="btn sm" disabled={primaryProject()?.id === p().id} onClick={() => setPrimary(p())}><Star />{t("proj-make-primary")}</button>
            <Show when={!p().fromFolderProject}>
              <label class="field inline"><span>{t("proj-deadline")}</span><input class="input sm" type="date" value={p().deadline} onChange={(e) => { const v = e.currentTarget.value; projectState.update((s) => { const x = s.projects.find((y) => y.id === p().id); if (x) x.deadline = v; }); }} /></label>
              <button class="btn sm danger" onClick={() => { projectState.update((s) => { s.projects = s.projects.filter((x) => x.id !== p().id); }); setProject(null); }}><Trash2 />{t("proj-remove")}</button>
            </Show>
            <Show when={p().folderPath}><span class="muted sm">{p().folderPath}</span></Show>
          </div>
        )}
      </Show>
      <div class="segmented" role="tablist">
        <For each={["board", "sprints", "timeline", "graph", "rules"] as Tab[]}>{(x) => <button role="tab" aria-selected={tab() === x} onClick={() => setTab(x)}>{t(`proj-tab-${x}`)}</button>}</For>
      </div>
      <Switch>
        <Match when={tab() === "board"}><Board project={project()} onEdit={setEditing} /></Match>
        <Match when={tab() === "sprints"}><Sprints project={project()} /></Match>
        <Match when={tab() === "timeline"}><Timeline project={project()} /></Match>
        <Match when={tab() === "graph"}><DepGraph project={project()} /></Match>
        <Match when={tab() === "rules"}><Rules /></Match>
      </Switch>
      <Show when={creating()}><NewProject onClose={() => setCreating(false)} /></Show>
      <Show when={editing()} keyed>{(x) => <TaskEditor task={x} onClose={() => setEditing(null)} />}</Show>
    </div>
  );
}
