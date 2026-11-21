import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("pairs changed lines and keeps equal ones", () => {
    const rows = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(rows.map((r) => r.kind)).toEqual(["same", "change", "same", "add"]);
    expect(rows[1]).toMatchObject({ left: "b", right: "B", ln: 2, rn: 2 });
    expect(rows[3]).toMatchObject({ left: null, right: "d", rn: 4 });
  });
  it("handles deletions", () => {
    expect(diffLines("x\ny", "y").map((r) => r.kind)).toEqual(["del", "same"]);
  });
});
