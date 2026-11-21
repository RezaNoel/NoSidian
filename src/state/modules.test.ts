import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULE_MIN_LEVEL, enabledModules } from "./modules";

describe("experience presets", () => {
  it("are nested and hide power tools for beginners", () => {
    const b = enabledModules("beginner", {});
    const i = enabledModules("intermediate", {});
    const a = enabledModules("advanced", {});
    for (const m of b) expect(i.has(m)).toBe(true);
    for (const m of i) expect(a.has(m)).toBe(true);
    expect(b.has("mcp-bridge")).toBe(false);
    expect(b.has("integrated-terminal")).toBe(false);
    expect(a.size).toBe(Object.keys(MODULE_MIN_LEVEL).length);
  });

  it("lets overrides win", () => {
    const e = enabledModules("beginner", { "integrated-terminal": true, "companion-pet": false });
    expect(e.has("integrated-terminal")).toBe(true);
    expect(e.has("companion-pet")).toBe(false);
  });

  it("lists the same modules as the Rust core", () => {
    const rust = readFileSync("crates/nosidian-core/src/modules.rs", "utf8");
    const variants = rust.match(/pub enum ModuleId \{([\s\S]*?)\}/)![1]
      .split(",").map((s) => s.trim()).filter(Boolean)
      .map((v) => v.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    expect(new Set(variants)).toEqual(new Set(Object.keys(MODULE_MIN_LEVEL)));
  });
});
