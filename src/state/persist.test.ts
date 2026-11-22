import { describe, expect, it } from "vitest";
import { backend } from "../backend";
import { appDoc } from "./persist";
import { flushAll } from "./flush";

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("persisted documents", () => {
  it("keeps a change made before the saved document was read, without overwriting it", async () => {
    await backend.appStoreWrite("persist-test", { a: 1, b: 2 });
    const doc = appDoc("persist-test", () => ({ a: 0, b: 0, c: 0 }));
    doc.update((d) => { d.c = 5; });
    for (let i = 0; i < 50 && !doc.ready(); i++) await tick();
    expect(doc.state).toEqual({ a: 1, b: 2, c: 5 });
    await flushAll();
    expect(await backend.appStoreRead("persist-test")).toEqual({ a: 1, b: 2, c: 5 });
  });

  it("writes pending changes at once when flushed", async () => {
    const doc = appDoc("persist-flush", () => ({ n: 0 }));
    for (let i = 0; i < 50 && !doc.ready(); i++) await tick();
    doc.update((d) => { d.n = 7; });
    await flushAll();
    expect(await backend.appStoreRead("persist-flush")).toEqual({ n: 7 });
  });
});
