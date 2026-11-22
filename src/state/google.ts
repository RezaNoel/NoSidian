// Google Calendar connection: sign-in state, the events shown in the calendar
// and the two-way sync of scheduled tasks, project deadlines and important
// dates. All network calls go through the desktop app (see src-tauri google.rs).
import { createRoot, createSignal } from "solid-js";
import { locale, t } from "../i18n";
import { keyOf, localIso, nextDay, planSync, type Desired, type RemoteEvent, type SyncMap } from "../core/googleSync";
import { inTauri } from "./backend";
import { appDoc } from "./persist";
import { personal } from "./personal";
import { allProjects, allTasks, newId, projectState, removeTask, scheduleTask, upsertTask } from "./projects";
import type { ProjectTask } from "../core/types";
import { toast } from "./ui";

export interface GoogleStatus { configured: boolean; connected: boolean; account: string | null }
interface ShownEvent { id: string; summary: string; day: string; time?: string; end?: string }

export interface GooglePrefs {
  pushTasks: boolean;
  pushDeadlines: boolean;
  pushDates: boolean;
  lastSync: number;
  map: SyncMap;
  /** Upcoming and recent events, kept so the calendar works offline. */
  events: ShownEvent[];
  /** Turn upcoming Google events into tasks automatically. */
  eventsToTasks?: boolean;
}

export const googlePrefs = appDoc<GooglePrefs>("google", () => ({ pushTasks: true, pushDeadlines: true, pushDates: true, lastSync: 0, map: {}, events: [] }));

const sig = createRoot(() => {
  const [status, setStatus] = createSignal<GoogleStatus>({ configured: false, connected: false, account: null });
  const [busy, setBusy] = createSignal<"" | "connect" | "sync">("");
  return { status, setStatus, busy, setBusy };
});
export const googleStatus = sig.status;
export const googleBusy = sig.busy;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const errorText = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? "";
  const known = ["google-not-configured", "google-signed-out", "google-offline", "google-timeout", "google-denied", "google-busy"];
  return t((known.includes(code) ? `err-${code}` : "err-google-failed") as "err-google-failed");
};

export async function refreshGoogleStatus(): Promise<void> {
  if (!inTauri()) return;
  try { sig.setStatus(await call<GoogleStatus>("google_status")); } catch { /* keep the last known state */ }
}

export async function connectGoogle(): Promise<void> {
  if (sig.busy()) return;
  sig.setBusy("connect");
  try {
    sig.setStatus(await call<GoogleStatus>("google_connect", { doneText: t("cal-google-done") }));
    toast(t("cal-google-connected"));
    void syncGoogle();
  } catch (e) { toast(errorText(e), true); } finally { sig.setBusy(""); }
}

export async function disconnectGoogle(): Promise<void> {
  try {
    sig.setStatus(await call<GoogleStatus>("google_disconnect"));
    googlePrefs.update((g) => { g.map = {}; g.events = []; g.lastSync = 0; });
  } catch (e) { toast(errorText(e), true); }
}

const req = <T>(method: string, path: string, query: [string, string][] = [], body?: unknown) =>
  call<T>("google_request", { method, path, query, body: body ?? null });

// ---------- What NoSidian sends ----------

function desiredItems(): Map<string, Desired> {
  const g = googlePrefs.state;
  const out = new Map<string, Desired>();
  if (g.pushTasks) {
    for (const x of allTasks()) {
      // Tasks made from Google events are already in Google.
      if (!x.timeBlockDate || x.done || x.googleEventId) continue;
      const [y, m, d] = x.timeBlockDate.split("-").map(Number);
      const start = new Date(y, m - 1, d, x.timeBlockStartHour ?? 9, 0);
      const end = new Date(start.getTime() + (x.timeBlockDurationMin ?? 60) * 60_000);
      out.set(`task:${x.id}`, { summary: x.title, allDay: false, start: localIso(start), end: localIso(end) });
    }
  }
  if (g.pushDeadlines) {
    for (const p of allProjects()) {
      if (!p.deadline || p.status === "completed") continue;
      const day = p.deadline.slice(0, 10);
      out.set(`deadline:${p.id}`, { summary: t("cal-mark-deadline", { name: p.name }), allDay: true, start: day, end: nextDay(day) });
    }
  }
  if (g.pushDates) {
    const year = new Date().getFullYear();
    const yearly = (id: string, label: string, mmdd: string) => {
      const day = `${year}-${mmdd}`;
      out.set(`date:${id}`, { summary: label, allDay: true, start: day, end: nextDay(day), yearly: true });
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(personal.state.birthday)) yearly("birthday", t("personal-birthday"), personal.state.birthday.slice(5));
    for (const d of personal.state.dates) {
      if (d.date.length === 5) yearly(d.id, d.label, d.date);
      else out.set(`date:${d.id}`, { summary: d.label, allDay: true, start: d.date, end: nextDay(d.date) });
    }
  }
  return out;
}

interface ApiEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
}

const toRemote = (e: ApiEvent): RemoteEvent => ({
  id: e.id,
  nid: e.extendedProperties?.private?.nid,
  summary: e.summary ?? "",
  allDay: !!e.start?.date,
  start: e.start?.date ?? e.start?.dateTime ?? "",
  end: e.end?.date ?? e.end?.dateTime ?? "",
  yearly: !!e.recurrence?.some((r) => r.includes("FREQ=YEARLY")),
});

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const toApi = (nid: string, d: Desired) => ({
  summary: d.summary,
  start: d.allDay ? { date: d.start } : { dateTime: d.start, timeZone: tz() },
  end: d.allDay ? { date: d.end } : { dateTime: d.end, timeZone: tz() },
  recurrence: d.yearly ? ["RRULE:FREQ=YEARLY"] : [],
  extendedProperties: { private: { nosidian: "1", nid } },
  transparency: d.allDay ? "transparent" : "opaque",
});

/** Copy an event edited in Google back into NoSidian. */
async function pull(nid: string, e: RemoteEvent): Promise<void> {
  const [kind, id] = [nid.slice(0, nid.indexOf(":")), nid.slice(nid.indexOf(":") + 1)];
  if (kind === "task") {
    const task = allTasks().find((x) => x.id === id);
    if (!task || e.allDay) return;
    const start = new Date(e.start), end = new Date(e.end);
    const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    await scheduleTask(task, day, start.getHours());
    if (task.sourceType !== "markdown-checkbox") {
      projectState.update((st) => {
        const x = st.tasks.find((y) => y.id === id);
        if (!x) return;
        x.timeBlockDurationMin = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
        if (e.summary.trim()) x.title = e.summary.trim();
      });
    }
  } else if (kind === "deadline") {
    projectState.update((st) => { const p = st.projects.find((x) => x.id === id); if (p && e.allDay) p.deadline = e.start.slice(0, 10); });
  } else if (kind === "date") {
    personal.update((p) => {
      if (id === "birthday") {
        if (p.birthday) p.birthday = `${p.birthday.slice(0, 4)}-${e.start.slice(5, 10)}`;
        return;
      }
      const d = p.dates.find((x) => x.id === id);
      if (!d) return;
      d.date = d.date.length === 5 ? e.start.slice(5, 10) : e.start.slice(0, 10);
      if (e.summary.trim()) d.label = e.summary.trim();
    });
  }
}

function unschedule(nid: string): void {
  const id = nid.slice(5);
  projectState.update((st) => {
    const x = st.tasks.find((y) => y.id === id);
    if (x && x.sourceType !== "markdown-checkbox") { x.timeBlockDate = undefined; x.timeBlockStartHour = undefined; }
  });
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

let syncing: Promise<void> | null = null;
/** Pull events for the calendar and reconcile NoSidian items both ways. */
export function syncGoogle(quiet = true): Promise<void> {
  if (!inTauri() || !sig.status().connected) return Promise.resolve();
  syncing ??= (async () => {
    sig.setBusy("sync");
    try {
      // 1. Our own events (masters, so yearly dates come back once).
      const ours: ApiEvent[] = [];
      let page: string | undefined;
      do {
        const q: [string, string][] = [["privateExtendedProperty", "nosidian=1"], ["maxResults", "250"], ["showDeleted", "false"]];
        if (page) q.push(["pageToken", page]);
        const res = await req<{ items?: ApiEvent[]; nextPageToken?: string }>("GET", "calendars/primary/events", q);
        ours.push(...(res.items ?? []).filter((e) => e.status !== "cancelled"));
        page = res.nextPageToken;
      } while (page);

      // 2. Reconcile.
      const desired = desiredItems();
      const remote = ours.map(toRemote);
      const ops = planSync(desired, remote, googlePrefs.state.map);
      const map: SyncMap = { ...googlePrefs.state.map };
      for (const nid of Object.keys(map)) if (!desired.has(nid) && !remote.some((r) => r.nid === nid)) delete map[nid];
      const remember = (nid: string, eventId: string, item: Desired) => {
        map[nid] = { eventId, local: keyOf(item), remote: keyOf(item) };
      };
      for (const op of ops) {
        try {
          if (op.op === "insert") {
            const e = await req<ApiEvent>("POST", "calendars/primary/events", [], toApi(op.nid, op.item));
            remember(op.nid, e.id, op.item);
          } else if (op.op === "patch") {
            await req("PATCH", `calendars/primary/events/${encodeURIComponent(op.eventId)}`, [], toApi(op.nid, op.item));
            remember(op.nid, op.eventId, op.item);
          } else if (op.op === "delete") {
            await req("DELETE", `calendars/primary/events/${encodeURIComponent(op.eventId)}`).catch(() => undefined);
            delete map[op.nid];
          } else if (op.op === "pull") {
            await pull(op.nid, op.event);
            map[op.nid] = { eventId: op.event.id, local: keyOf(op.event), remote: keyOf(op.event) };
          } else if (op.op === "unschedule") {
            unschedule(op.nid);
            delete map[op.nid];
          }
        } catch { /* one failed item doesn't stop the rest */ }
      }
      // Unchanged pairs: make sure they are remembered (first sync after a reinstall).
      for (const r of remote) if (r.nid && desired.has(r.nid) && !map[r.nid]) map[r.nid] = { eventId: r.id, local: keyOf(r), remote: keyOf(r) };

      // 3. Events to show: two months back, a year ahead, not our own.
      const from = new Date(); from.setMonth(from.getMonth() - 2);
      const to = new Date(); to.setFullYear(to.getFullYear() + 1);
      const shown: ShownEvent[] = [];
      page = undefined;
      do {
        const q: [string, string][] = [["timeMin", from.toISOString()], ["timeMax", to.toISOString()], ["singleEvents", "true"], ["orderBy", "startTime"], ["maxResults", "2500"]];
        if (page) q.push(["pageToken", page]);
        const res = await req<{ items?: ApiEvent[]; nextPageToken?: string }>("GET", "calendars/primary/events", q);
        for (const e of res.items ?? []) {
          if (e.status === "cancelled" || e.extendedProperties?.private?.nosidian === "1") continue;
          if (e.start?.date) shown.push({ id: e.id, summary: e.summary ?? "", day: e.start.date });
          else if (e.start?.dateTime) {
            const d = new Date(e.start.dateTime);
            shown.push({ id: e.id, summary: e.summary ?? "", day: ymdOf(d), time: d.toISOString(), end: e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : undefined });
          }
        }
        page = res.nextPageToken;
      } while (page && shown.length < 5000);

      googlePrefs.update((g) => { g.map = map; g.events = shown; g.lastSync = Date.now(); });
      if (googlePrefs.state.eventsToTasks !== false) importEventsAsTasks(shown);
      if (!quiet) toast(t("cal-google-synced"));
    } catch (e) {
      if (!quiet) toast(errorText(e), true);
      if ((e as { code?: string })?.code === "google-signed-out") await refreshGoogleStatus();
    } finally {
      sig.setBusy("");
      syncing = null;
    }
  })();
  return syncing;
}


/** Add a simple event to Google from the calendar (all-day, or at an hour). */
export async function addGoogleEvent(day: string, summary: string, hour?: number): Promise<void> {
  const body = hour === undefined
    ? { summary, start: { date: day }, end: { date: nextDay(day) } }
    : (() => {
        const [y, m, d] = day.split("-").map(Number);
        const s = new Date(y, m - 1, d, hour, 0);
        return { summary, start: { dateTime: localIso(s), timeZone: tz() }, end: { dateTime: localIso(new Date(s.getTime() + 3_600_000)), timeZone: tz() } };
      })();
  try {
    await req("POST", "calendars/primary/events", [], body);
    await syncGoogle();
  } catch (e) { toast(errorText(e), true); }
}

/** Event titles on a day (YYYY-MM-DD), for the calendar. */
export function googleEventsOn(day: string): { id: string; label: string }[] {
  if (!sig.status().connected) return [];
  return googlePrefs.state.events.filter((e) => e.day === day).map((e) => ({ id: e.id, label: e.time ? `${new Date(e.time).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" })} ${e.summary}` : e.summary }));
}

// ---------- Google events as tasks ----------

/** The task that mirrors a Google event, as it should look now. */
function taskFor(e: ShownEvent, existing?: ProjectTask): ProjectTask {
  const start = e.time ? new Date(e.time) : null;
  const end = e.end ? new Date(e.end) : null;
  return {
    ...(existing ?? { id: newId("task"), projectId: "inbox", done: false, status: "todo" as const, priority: "medium" as const, sourceType: "manual" as const, createdAt: Date.now() }),
    title: e.summary.trim() || t("cal-google"),
    dueDate: e.day,
    timeBlockDate: start ? e.day : undefined,
    timeBlockStartHour: start ? start.getHours() : undefined,
    timeBlockDurationMin: start && end ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)) : undefined,
    googleEventId: e.id,
  };
}

/** Add one Google event to tasks (from the calendar), or update the one already made. */
export function addEventToTasks(eventId: string): boolean {
  const e = googlePrefs.state.events.find((x) => x.id === eventId);
  if (!e) return false;
  const cur = projectState.state.tasks.find((x) => x.googleEventId === eventId);
  upsertTask(taskFor(e, cur));
  return !cur;
}

/** Keep tasks for the next two weeks of Google events: add new ones, follow moves, drop cancelled. */
function importEventsAsTasks(shown: ShownEvent[]): void {
  const today = ymdOf(new Date());
  const horizon = ymdOf(new Date(Date.now() + 14 * 86_400_000));
  const upcoming = shown.filter((e) => e.day >= today && e.day <= horizon);
  const byId = new Map(shown.map((e) => [e.id, e]));
  for (const e of upcoming) {
    const cur = projectState.state.tasks.find((x) => x.googleEventId === e.id);
    const next = taskFor(e, cur);
    if (!cur || cur.title !== next.title || cur.timeBlockDate !== next.timeBlockDate || cur.timeBlockStartHour !== next.timeBlockStartHour || cur.dueDate !== next.dueDate) upsertTask(next);
  }
  // Events deleted in Google: remove their open tasks (finished ones stay as a record).
  for (const x of projectState.state.tasks) {
    if (x.googleEventId && !x.done && (x.dueDate ?? "") >= today && !byId.has(x.googleEventId)) removeTask(x.id);
  }
}

let started = false;
/** Learn the sign-in state and sync now, then every ten minutes and when the app comes back to the front. */
export function startGoogleSync(): void {
  if (started || typeof window === "undefined" || !inTauri()) return;
  started = true;
  void refreshGoogleStatus().then(() => syncGoogle());
  setInterval(() => void syncGoogle(), 10 * 60_000);
  window.addEventListener("focus", () => { if (Date.now() - googlePrefs.state.lastSync > 5 * 60_000) void syncGoogle(); });
}
