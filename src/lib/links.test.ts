import { describe, expect, it } from "vitest";
import { backlinks, outgoing, unlinkedMentions } from "./links";

const contents = {
  "A.md": "# A\nSee [[B]] and [[Missing]].",
  "Dir/B.md": "# B\nBack to [[A|alpha]].",
  "C.md": "Talks about Dir but not B. The A note is plain here, also mentions Alpha Beta.",
  "D.md": "Mentions dir/b? no. mentions A.md? no link. [[A#Intro]]",
};
const paths = Object.keys(contents);

describe("links", () => {
  it("finds backlinks through aliases and heading links", () => {
    expect(backlinks("A.md", contents, paths).map((m) => m.path)).toEqual(["Dir/B.md", "D.md"]);
    expect(backlinks("Dir/B.md", contents, paths)[0]).toEqual({ path: "A.md", snippet: "See [[B]] and [[Missing]]." });
  });
  it("resolves outgoing links and keeps unresolved ones", () => {
    expect(outgoing("A.md", contents, paths)).toEqual([{ target: "B", path: "Dir/B.md" }, { target: "Missing", path: null }]);
  });
  it("finds unlinked mentions of longer titles only", () => {
    const c = { ...contents, "Long Title.md": "x", "E.md": "I like the long title idea" };
    expect(unlinkedMentions("Long Title.md", c, Object.keys(c)).map((m) => m.path)).toEqual(["E.md"]);
    expect(unlinkedMentions("A.md", contents, paths)).toEqual([]);
  });
});

describe("code is ignored", () => {
  it("skips links inside inline code and fences", () => {
    const c = { "A.md": "Use `[[B]]` syntax\n```\n[[B]]\n```\nreal [[C]]", "B.md": "", "C.md": "" };
    expect(outgoing("A.md", c, Object.keys(c))).toEqual([{ target: "C", path: "C.md" }]);
    expect(backlinks("B.md", c, Object.keys(c))).toEqual([]);
  });
});
