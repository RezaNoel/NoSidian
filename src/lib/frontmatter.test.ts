import { describe, expect, it } from "vitest";
import { getProp, parseProps, setProp, withProps } from "./frontmatter";

describe("front matter", () => {
  const src = "---\ntitle: Hello: world\ntags: [a, \"b c\"]\naliases:\n  - x\n  - y\nempty:\n---\n# Body\n";
  it("parses scalars, inline and block lists", () => {
    expect(parseProps(src)).toEqual([
      { key: "title", value: "Hello: world" },
      { key: "tags", value: ["a", "b c"] },
      { key: "aliases", value: ["x", "y"] },
      { key: "empty", value: "" },
    ]);
  });
  it("round-trips and edits", () => {
    const again = withProps(src, parseProps(src));
    expect(parseProps(again)).toEqual(parseProps(src));
    expect(again.endsWith("# Body\n")).toBe(true);
    const s2 = setProp("# Only body", "status", "done");
    expect(s2).toBe("---\nstatus: done\n---\n# Only body");
    expect(getProp(setProp(s2, "status", undefined), "status")).toBeUndefined();
    expect(setProp(s2, "status", undefined)).toBe("# Only body");
  });
});
