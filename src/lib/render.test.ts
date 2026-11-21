import { describe, expect, it } from "vitest";
import { renderMarkdown, splitSlides, taskLines, toggleTask } from "./markdown";

describe("rich rendering", () => {
  it("renders math, callouts, code, marks and tasks", () => {
    const html = renderMarkdown([
      "Inline $a^2$ and ==hi== and ++u++ #tag",
      "",
      "$$",
      "x = 1",
      "$$",
      "",
      "> [!tip]+ Title here",
      "> Body **bold**",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "```mermaid",
      "graph TD; A-->B",
      "```",
      "",
      "- [ ] one",
      "- [x] two",
      "",
      "![[pic.png]]",
    ].join("\n"));
    expect(html).toContain('class="katex"');
    expect(html).toContain("math-block");
    expect(html).toContain("<mark>hi</mark>");
    expect(html).toContain("<u>u</u>");
    expect(html).toContain('data-tag="tag"');
    expect(html).toMatch(/<details class="callout callout-tip"[^>]*open/);
    expect(html).toContain("Title here");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("data-mermaid");
    expect(html).toContain('data-task="1" checked');
    expect(html).toContain('data-embed="pic.png"');
  });
  it("does not mark text inside code", () => {
    expect(renderMarkdown("`==x==`")).not.toContain("<mark>");
  });
  it("finds and toggles tasks, splits slides", () => {
    const src = "---\na: 1\n---\n- [ ] a\n```\n- [ ] no\n```\n> - [x] b";
    expect(taskLines(src)).toEqual([3, 7]);
    expect(toggleTask(src, 1, false)).toContain("> - [ ] b");
    expect(splitSlides("# A\n---\n# B\n```\n---\n```")).toHaveLength(2);
  });
});
