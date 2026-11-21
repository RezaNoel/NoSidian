import { describe, expect, it } from "vitest";
import { keyOf, planSync, type Desired, type RemoteEvent, type SyncMap } from "./googleSync";

const task: Desired = { summary: "Write intro", allDay: false, start: "2026-11-21T09:00:00+03:30", end: "2026-11-21T10:00:00+03:30" };
const remoteOf = (d: Desired, nid: string, id = "e1"): RemoteEvent => ({ ...d, id, nid });

describe("google sync plan", () => {
  it("inserts new items", () => {
    expect(planSync(new Map([["task:1", task]]), [], {})).toEqual([{ op: "insert", nid: "task:1", item: task }]);
  });

  it("does nothing when both sides match, even with another time-zone spelling", () => {
    const r = remoteOf({ ...task, start: "2026-11-21T05:30:00Z", end: "2026-11-21T06:30:00Z" }, "task:1");
    const map: SyncMap = { "task:1": { eventId: "e1", local: keyOf(task), remote: keyOf(task) } };
    expect(planSync(new Map([["task:1", task]]), [r], map)).toEqual([]);
  });

  it("pushes local changes and pulls remote ones", () => {
    const map: SyncMap = { "task:1": { eventId: "e1", local: keyOf(task), remote: keyOf(task) } };
    const moved = { ...task, start: "2026-11-21T11:00:00+03:30", end: "2026-11-21T12:00:00+03:30" };
    expect(planSync(new Map([["task:1", moved]]), [remoteOf(task, "task:1")], map)).toEqual([{ op: "patch", nid: "task:1", eventId: "e1", item: moved }]);
    const r = remoteOf(moved, "task:1");
    expect(planSync(new Map([["task:1", task]]), [r], map)).toEqual([{ op: "pull", nid: "task:1", event: r }]);
  });

  it("lets NoSidian win when both changed", () => {
    const map: SyncMap = { "task:1": { eventId: "e1", local: keyOf(task), remote: keyOf(task) } };
    const local = { ...task, summary: "Local" };
    const r = remoteOf({ ...task, summary: "Remote" }, "task:1");
    expect(planSync(new Map([["task:1", local]]), [r], map)[0].op).toBe("patch");
  });

  it("deletes events for removed items and handles remote deletes", () => {
    const map: SyncMap = { "task:1": { eventId: "e1", local: keyOf(task), remote: keyOf(task) }, "deadline:p": { eventId: "e2", local: "", remote: "" } };
    expect(planSync(new Map(), [remoteOf(task, "task:1")], map)).toEqual([{ op: "delete", nid: "task:1", eventId: "e1" }]);
    const dl: Desired = { summary: "Due", allDay: true, start: "2026-12-01", end: "2026-12-02" };
    expect(planSync(new Map([["task:1", task], ["deadline:p", dl]]), [], map)).toEqual([
      { op: "unschedule", nid: "task:1" },
      { op: "insert", nid: "deadline:p", item: dl },
    ]);
  });

  it("leaves events it never synced alone", () => {
    expect(planSync(new Map(), [remoteOf(task, "task:other")], {})).toEqual([]);
  });
});
