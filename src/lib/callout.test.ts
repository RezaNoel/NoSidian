import { it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
it("callout with breaks", () => { const h = renderMarkdown("> [!tip]+ Open\n> Use **x** more.\n", { breaks: true }); expect(h).toContain('callout-tip'); expect(h).toContain('<p dir="auto">Use'); });
