import { describe, expect, it } from "vitest";
import { fuzzy, rank } from "./fuzzy";

describe("fuzzy", () => {
  it("matches subsequences and prefers substrings and word starts", () => {
    expect(fuzzy("xyz", "Rust notes")).toBeNull();
    expect(fuzzy("rn", "Rust notes")?.indices).toEqual([0, 5]);
    const ranked = rank(["Projects/Rust notes.md", "Ruby on rails.md", "Rust.md"], "rust", (x) => x).map((r) => r.item);
    expect(ranked[0]).toBe("Rust.md");
    expect(ranked).not.toContain("Ruby on rails.md");
    expect(rank(["یادداشت روزانه"], "روزانه", (x) => x)).toHaveLength(1);
  });
});
