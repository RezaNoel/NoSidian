// Two-way sync between NoSidian items and Google Calendar events, as a pure
// function so it can be tested without the network.
//
// Each synced item has a stable id (`task:…`, `deadline:…`, `date:…`) stored
// on the event as a private extended property. The last synced form of both
// sides is remembered, so on the next run we can tell which side changed:
// - only NoSidian changed (or both): update the event (NoSidian wins a tie);
// - only Google changed: copy the change back into NoSidian;
// - deleted in NoSidian: delete the event;
// - deleted in Google: unschedule a task, re-create anything else.

export interface Desired {
  summary: string;
  allDay: boolean;
  /** YYYY-MM-DD for all-day items, otherwise an ISO date-time. */
  start: string;
  end: string;
  yearly?: boolean;
}

export interface RemoteEvent {
  id: string;
  nid?: string;
  summary: string;
  allDay: boolean;
  start: string;
  end: string;
  yearly?: boolean;
}

export interface SyncEntry { eventId: string; local: string; remote: string }
export type SyncMap = Record<string, SyncEntry>;

export type SyncOp =
  | { op: "insert"; nid: string; item: Desired }
  | { op: "patch"; nid: string; eventId: string; item: Desired }
  | { op: "delete"; nid: string; eventId: string }
  | { op: "pull"; nid: string; event: RemoteEvent }
  | { op: "unschedule"; nid: string };

/** Comparable key: date-times by instant, so time-zone spelling doesn't matter. */
export function keyOf(x: Desired | RemoteEvent): string {
  const at = (s: string) => (x.allDay ? s.slice(0, 10) : String(Date.parse(s)));
  return JSON.stringify([x.summary.trim(), x.allDay, at(x.start), at(x.end), !!x.yearly]);
}

export function planSync(desired: Map<string, Desired>, remote: RemoteEvent[], map: SyncMap): SyncOp[] {
  const ops: SyncOp[] = [];
  const byNid = new Map<string, RemoteEvent>();
  for (const r of remote) if (r.nid && !byNid.has(r.nid)) byNid.set(r.nid, r);

  for (const [nid, item] of desired) {
    const r = byNid.get(nid);
    const prev = map[nid];
    if (!r) {
      if (prev && nid.startsWith("task:")) ops.push({ op: "unschedule", nid });
      else ops.push({ op: "insert", nid, item });
      continue;
    }
    const localKey = keyOf(item), remoteKey = keyOf(r);
    if (localKey === remoteKey) continue;
    if (!prev) { ops.push({ op: "patch", nid, eventId: r.id, item }); continue; }
    const localChanged = localKey !== prev.local;
    const remoteChanged = remoteKey !== prev.remote;
    if (localChanged || !remoteChanged) ops.push({ op: "patch", nid, eventId: r.id, item });
    else ops.push({ op: "pull", nid, event: r });
  }
  // Items removed in NoSidian: remove the events we created for them. Events
  // we never synced (another vault or computer) are left alone.
  for (const [nid, r] of byNid) if (!desired.has(nid) && map[nid]) ops.push({ op: "delete", nid, eventId: r.id });
  return ops;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local ISO date-time with offset, e.g. 2026-11-21T09:00:00+03:30. */
export function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
