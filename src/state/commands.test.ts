import { describe, expect, it } from "vitest";
import { COMMANDS, comboOf, formatCombo } from "./commands";
import { sanitizePref } from "./prefs";

const ev = (key: string, code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) =>
  ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("hotkeys", () => {
  it("normalizes key events using physical keys", () => {
    expect(comboOf(ev("k", "KeyK", { ctrlKey: true }), false)).toBe("Mod+K");
    // Persian layout: the K key types "ن" but the shortcut is still Mod+K.
    expect(comboOf(ev("ن", "KeyK", { ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+K");
    expect(comboOf(ev("Control", "ControlLeft", { ctrlKey: true }), false)).toBe("");
    expect(comboOf(ev("k", "KeyK", { metaKey: true }), true)).toBe("Mod+K");
    expect(comboOf(ev(",", "Comma", { ctrlKey: true }), false)).toBe("Mod+,");
  });
  it("formats for display", () => {
    expect(formatCombo("Mod+Shift+K", false)).toBe("Ctrl+Shift+K");
    expect(formatCombo("Mod+Shift+K", true)).toBe("⌘⇧K");
  });
  it("has unique ids and default shortcuts", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = COMMANDS.map((c) => c.defaultKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("prefs", () => {
  it("falls back on bad values and clamps numbers", () => {
    expect(sanitizePref("fontSize", 99)).toBe(26);
    expect(sanitizePref("fontSize", "x")).toBe(15);
    expect(sanitizePref("startup", "nope")).toBe("last");
    expect(sanitizePref("confirmDelete", "yes")).toBe(true);
    expect(sanitizePref("hotkeys", { a: "Mod+A", b: 3 })).toEqual({ a: "Mod+A" });
  });
});
