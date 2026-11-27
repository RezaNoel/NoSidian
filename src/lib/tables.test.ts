import { describe, expect, it } from "vitest";
import { editTable, findTables, splitRow } from "./tables";

const note = "---\ntitle: x\n---\n# T\n\n| A | B |\n| --- | :-: |\n| 1 | a \\| b |\n| 2 | `x|y` |\n\n```\n| no | table |\n| --- | --- |\n```\n";

describe("tables", () => {
  it("splits rows with escaped pipes and code", () => {
    expect(splitRow("| a | b \\| c | `d|e` |")).toEqual(["a", "b \\| c", "`d|e`"]);
  });
  it("finds tables outside code", () => {
    const t = findTables(note);
    expect(t.length).toBe(1);
    expect(t[0].header).toEqual(["A", "B"]);
    expect(t[0].align).toEqual(["", "center"]);
    expect(t[0].rows.length).toBe(2);
  });
  it("adds a column and a row", () => {
    const out = editTable(note, 0, (t) => { t.header.push("C"); t.rows.push(["3", "c", "z"]); return t; });
    const t = findTables(out)[0];
    expect(t.header).toEqual(["A", "B", "C"]);
    expect(t.rows[2]).toEqual(["3", "c", "z"]);
    expect(out).toContain("```\n| no | table |");
  });
});
