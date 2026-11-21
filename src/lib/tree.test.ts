import { describe, expect, it } from "vitest";
import { buildTree, visibleNodes } from "./tree";
import type { NoteMeta } from "../state/types";

const note = (path: string, modified: number): NoteMeta => ({ path, kind: path.endsWith(".pdf") ? "pdf" : "markdown", size: 1, modified, created: modified });

describe("buildTree", () => {
  const notes = [note("b.md", 1), note("A.md", 5), note("Projects/x.md", 9), note("Projects/Deep/y.pdf", 2)];
  it("puts folders first and sorts by name", () => {
    const t = buildTree(notes, ["Empty"], "name-asc");
    expect(t.map((n) => n.name)).toEqual(["Empty", "Projects", "A.md", "b.md"]);
    expect(t[1].children.map((n) => n.name)).toEqual(["Deep", "x.md"]);
    expect(t[1].children[0].children[0].depth).toBe(2);
  });
  it("sorts by modified using folder descendants", () => {
    const t = buildTree(notes, [], "modified-new");
    expect(t[0].modified).toBe(9);
    expect(t.slice(1).map((n) => n.name)).toEqual(["A.md", "b.md"]);
  });
  it("hides children of collapsed folders", () => {
    const t = buildTree(notes, [], "name-asc");
    expect(visibleNodes(t, new Set(["Projects"])).map((n) => n.path)).toEqual(["Projects", "A.md", "b.md"]);
  });
});
