import { describe, expect, it } from "vitest";
import { format, setLocale, t, dir, getBundle } from "./index";
import { MESSAGE_KEYS } from "./keys.gen";
import { LANGUAGES, detectLanguage } from "./languages";

describe("i18n runtime", () => {
  it("formats every key in every language without errors", () => {
    for (const { code } of LANGUAGES) {
      const bundle = getBundle(code);
      for (const key of MESSAGE_KEYS) {
        const msg = bundle.getMessage(key);
        expect(msg?.value, `${code}/${key}`).toBeTruthy();
        const errors: Error[] = [];
        const out = bundle.formatPattern(msg!.value!, { count: 3, language: "x", theme: "y", detail: "z", minutes: 2, name: "n", path: "p", current: 1, total: 4, query: "q", card: "c", code: "x", coins: 5, column: "c", date: "d", days: 2, done: 1, due: 2, fresh: 3, hours: 1, left: 2, level: 3, links: 4, mood: "m", n: 2, next: "n", nodes: 5, page: 1, pct: 50, reward: 3, size: 4, span: 2, url: "u", watched: 1, xp: 10, owner: "o", tier: "t", time: "t", years: 30, months: 2, reps: 4, lapses: 1, goal: 20, title: "t", rank: 2, orphans: 1, type: "t" }, errors);
        expect(errors, `${code}/${key}`).toEqual([]);
        expect(out.trim().length, `${code}/${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("switches language and text direction", () => {
    setLocale("fa");
    expect(dir()).toBe("rtl");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("fa");
    expect(t("ribbon-settings")).toBe("تنظیمات");
    setLocale("de");
    expect(dir()).toBe("ltr");
    expect(t("ribbon-settings")).toBe("Einstellungen");
  });

  it("uses each language's plural rules", () => {
    const strip = (s: string) => s.replace(/[⁨⁩]/g, "");
    expect(strip(format("en", "status-modules-enabled", { count: 1 }))).toBe("1 module enabled");
    expect(strip(format("en", "status-modules-enabled", { count: 5 }))).toBe("5 modules enabled");
    expect(strip(format("ru", "status-modules-enabled", { count: 3 }))).toBe("Включено 3 модуля");
    expect(strip(format("ru", "status-modules-enabled", { count: 5 }))).toBe("Включено 5 модулей");
    expect(strip(format("ar", "status-modules-enabled", { count: 2 }))).toBe("وحدتان مفعّلتان");
  });

  it("isolates arguments for bidi safety", () => {
    expect(format("fa", "announce-theme-changed", { theme: "Nord" })).toContain("⁨Nord⁩");
  });

  it("detects the OS language", () => {
    expect(detectLanguage(["fa-IR"])).toBe("fa");
    expect(detectLanguage(["pt-PT"])).toBe("pt-BR");
    expect(detectLanguage(["zh-CN", "en"])).toBe("zh");
    expect(detectLanguage(["sw"])).toBe("en");
  });
});
