// Project mode: manual projects/sprints/tasks in `.nosidian/projects.json`,
// plus live tasks from `- [ ]` checkboxes in project folders and tag rules.
// Markdown tasks are edited in their notes, so the files stay the truth.
import { createMemo, createRoot } from "solid-js";
import { vaultDoc } from "./persist";
import { DEFAULT_TAG_WORKFLOW_RULES, buildAllProjectTasks, mergeVaultAndManualProjects, moveMarkdownTaskColumnInNote, toggleMarkdownTaskInNote, appendTaskTimeLogToNote, scheduleMarkdownTaskSlotInNote } from "../core/projectEngine";
import type { ProjectModeState, ProjectTask, ProjectTaskStatus } from "../core/types";
import { corpus } from "./corpus";
import { contents, ensureLoaded, setContent } from "./vault";

export const projectState = vaultDoc<ProjectModeState>("projects", () => ({ projects: [], sprints: [], tasks: [], spotlightEnabled: true, spotlightProjectId: null, tagRules: DEFAULT_TAG_WORKFLOW_RULES }));

const memo = createRoot(() => {
  const projects = createMemo(() => mergeVaultAndManualProjects(projectState.state.projects.map((p) => ({ ...p })), corpus()));
  const tasks = createMemo(() => buildAllProjectTasks(projectState.state.tasks.map((x) => ({ ...x })), corpus(), projects(), (projectState.state.tagRules ?? DEFAULT_TAG_WORKFLOW_RULES).map((r) => ({ ...r }))));
  return { projects, tasks };
});
export const allProjects = memo.projects;
export const allTasks = memo.tasks;

export const primaryProject = () => allProjects().find((p) => p.id === projectState.state.spotlightProjectId) ?? allProjects().find((p) => p.isPrimary) ?? allProjects()[0] ?? null;

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newId = uid;

async function editSource(task: ProjectTask, fn: (text: string, line: number) => string) {
  if (!task.sourcePath || task.sourceLine === undefined) return false;
  await ensureLoaded(task.sourcePath);
  const before = contents[task.sourcePath] ?? "";
  const after = fn(before, task.sourceLine);
  if (after !== before) setContent(task.sourcePath, after);
  return true;
}

export async function setTaskStatus(task: ProjectTask, status: ProjectTaskStatus): Promise<void> {
  const wasDone = task.done;
  if (task.sourceType === "markdown-checkbox") await editSource(task, (s, l) => moveMarkdownTaskColumnInNote(s, l, status));
  else projectState.update((st) => { const x = st.tasks.find((y) => y.id === task.id); if (x) { x.status = status; x.done = status === "done"; } });
  if (!wasDone && status === "done") window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "complete-task" }));
}

export async function toggleTask(task: ProjectTask): Promise<void> {
  if (task.sourceType === "markdown-checkbox") {
    await editSource(task, (s, l) => toggleMarkdownTaskInNote(s, l, !task.done));
    if (!task.done) window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "complete-task" }));
  } else await setTaskStatus(task, task.done ? "todo" : "done");
}

export async function logTime(task: ProjectTask, minutes: number): Promise<void> {
  if (task.sourceType === "markdown-checkbox") await editSource(task, (s, l) => appendTaskTimeLogToNote(s, l, minutes));
  else projectState.update((st) => { const x = st.tasks.find((y) => y.id === task.id); if (x) x.timeSpentMinutes = (x.timeSpentMinutes ?? 0) + minutes; });
}

export async function scheduleTask(task: ProjectTask, date: string, hour: number): Promise<void> {
  if (task.sourceType === "markdown-checkbox") await editSource(task, (s, l) => scheduleMarkdownTaskSlotInNote(s, l, date, hour));
  else projectState.update((st) => { const x = st.tasks.find((y) => y.id === task.id); if (x) { x.timeBlockDate = date; x.timeBlockStartHour = hour; x.timeBlockDurationMin = x.timeBlockDurationMin ?? 60; } });
}

export function upsertTask(task: ProjectTask): void {
  projectState.update((st) => {
    const i = st.tasks.findIndex((x) => x.id === task.id);
    if (i >= 0) st.tasks[i] = task;
    else st.tasks.push(task);
  });
}

export function removeTask(id: string): void {
  projectState.update((st) => { st.tasks = st.tasks.filter((x) => x.id !== id); });
}
