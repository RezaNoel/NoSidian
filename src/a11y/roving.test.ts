import { describe, expect, it } from "vitest";
import { nextIndex } from "./roving";

describe("roving tabindex", () => {
  it("moves and wraps vertically", () => {
    expect(nextIndex(0, "ArrowDown", 3, "vertical")).toBe(1);
    expect(nextIndex(2, "ArrowDown", 3, "vertical")).toBe(0);
    expect(nextIndex(0, "ArrowUp", 3, "vertical")).toBe(2);
    expect(nextIndex(1, "Home", 3, "vertical")).toBe(0);
    expect(nextIndex(1, "End", 3, "vertical")).toBe(2);
    expect(nextIndex(1, "ArrowLeft", 3, "vertical")).toBeNull();
  });

  it("mirrors horizontal arrows in RTL", () => {
    expect(nextIndex(0, "ArrowRight", 3, "horizontal", false)).toBe(1);
    expect(nextIndex(0, "ArrowLeft", 3, "horizontal", true)).toBe(1);
    expect(nextIndex(1, "ArrowRight", 3, "horizontal", true)).toBe(0);
  });
});
