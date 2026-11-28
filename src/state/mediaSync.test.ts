import { describe, expect, it } from "vitest";
import { __test } from "./mediaSync";
const { parseQuotes, readSection, writeSection, quotesText } = __test;

describe("media note sections", () => {
  it("round-trips book highlights", () => {
    const e = { highlights: [{ id: "a", quote: "One", page: 4, note: "n" }, { id: "b", quote: "Two" }] } as never;
    const text = quotesText("book", e);
    expect(parseQuotes(text)).toEqual([{ quote: "One", page: 4, note: "n" }, { quote: "Two", page: undefined, note: undefined }]);
  });
  it("reads and replaces a section, ignoring placeholders", () => {
    const body = "# T\n\n## Takeaways & Review\nWrite your spoiler-free reflections, cinematography notes, and key themes here.\n\n## Connections\n- x";
    expect(readSection(body, ["Takeaways & Review"])).toBe("");
    const next = writeSection(body, ["Takeaways & Review"], "Great film");
    expect(readSection(next, ["Takeaways & Review"])).toBe("Great film");
    expect(next).toContain("## Connections\n- x");
    expect(writeSection("# T", ["Notes"], "hi")).toBe("# T\n\n## Notes\n\nhi\n");
  });
  it("splits quotes on blank lines", () => {
    expect(parseQuotes('> "A"\n\n> "B"').map((q) => q.quote)).toEqual(["A", "B"]);
  });
});
