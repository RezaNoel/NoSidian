// What the calendar marks on a day: special dates, deadlines, scheduled tasks,
// days with reviews or focus, daily notes and Google events. Only things that
// make a day different are marked; routine goals (the daily card goal, for
// example) are never repeated on every day.
import { createMemo, createRoot } from "solid-js";
import { t } from "../i18n";
import { calShows, type CalSource } from "./calendarPrefs";
import { dailyPath, existingPaths } from "./daily";
import { datesOn } from "./personal";
import { allProjects, allTasks } from "./projects";
import { srs } from "./srs";
import { focusLog } from "./focus";
import { googleEventsOn } from "./google";

export type MarkKind = "birthday" | "date" | "deadline" | "task" | "cards" | "focus" | "daily" | "google";
export interface Mark { kind: MarkKind; source: CalSource; label: string; icon?: string }

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const index = createRoot(() => ({
  deadlines: createMemo(() => {
    const m = new Map<string, string[]>();
    const add = (k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
    for (const p of allProjects()) if (p.deadline && p.status !== "completed") add(p.deadline.slice(0, 10), p.name);
    for (const x of allTasks()) if (x.dueDate && !x.done) add(x.dueDate.slice(0, 10), x.title);
    return m;
  }),
  blocks: createMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of allTasks()) if (x.timeBlockDate && !x.done) m.set(x.timeBlockDate, [...(m.get(x.timeBlockDate) ?? []), x.title]);
    return m;
  }),
  reviews: createMemo(() => {
    const m = new Map<string, number>();
    for (const l of srs.state.logs) { const k = ymd(new Date(l.timestamp)); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }),
  notes: createMemo(() => existingPaths()),
}));

/** Marks for one day, most important first. */
export function marksOn(day: Date): Mark[] {
  const key = ymd(day);
  const out: Mark[] = [];
  if (calShows("dates")) {
    for (const d of datesOn(day)) out.push({ kind: d.id === "birthday" ? "birthday" : "date", source: "dates", label: d.label, icon: d.icon });
  }
  if (calShows("deadlines")) for (const name of index.deadlines().get(key) ?? []) out.push({ kind: "deadline", source: "deadlines", label: t("cal-mark-deadline", { name }) });
  if (calShows("tasks")) {
    const b = index.blocks().get(key);
    if (b?.length) out.push({ kind: "task", source: "tasks", label: b.length === 1 ? b[0] : t("cal-mark-tasks", { count: b.length }) });
  }
  if (calShows("google")) for (const e of googleEventsOn(key)) out.push({ kind: "google", source: "google", label: e });
  if (calShows("flashcards")) {
    const n = index.reviews().get(key);
    if (n) out.push({ kind: "cards", source: "flashcards", label: t("cal-mark-reviews", { count: n }) });
  }
  if (calShows("focus")) {
    const m = focusLog.state.days[key];
    if (m) out.push({ kind: "focus", source: "focus", label: t("cal-mark-focus", { minutes: m }) });
  }
  if (calShows("daily") && index.notes().has(dailyPath(day))) out.push({ kind: "daily", source: "daily", label: t("calendar-has-note") });
  return out;
}
