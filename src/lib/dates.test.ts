import { describe, expect, it } from "vitest";
import { formatDailyName, fromJalali, jalaliMonthLength, monthGrid, shiftMonth, toJalali } from "./dates";

describe("jalali", () => {
  it("converts known dates both ways", () => {
    expect(toJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(toJalali(2026, 11, 21)).toEqual({ jy: 1405, jm: 8, jd: 30 });
    expect(fromJalali(1403, 12, 30)).toEqual({ gy: 2025, gm: 3, gd: 20 });
    for (let i = 0; i < 800; i += 7) {
      const d = new Date(2024, 0, 1 + i);
      const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      expect(fromJalali(j.jy, j.jm, j.jd)).toEqual({ gy: d.getFullYear(), gm: d.getMonth() + 1, gd: d.getDate() });
    }
  });
  it("knows month lengths and leap Esfand", () => {
    expect(jalaliMonthLength(1403, 1)).toBe(31);
    expect(jalaliMonthLength(1403, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
});

describe("month grid", () => {
  it("pads to whole weeks starting on the given weekday", () => {
    const g = monthGrid({ kind: "gregorian", year: 2026, month: 11 }, 0);
    // 1 Nov 2026 is a Sunday: no lead when weeks start on Sunday, six on Monday.
    expect(g[0][0]?.getDate()).toBe(1);
    const mon = monthGrid({ kind: "gregorian", year: 2026, month: 11 }, 1);
    expect(mon[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(mon.every((w) => w.length === 7)).toBe(true);
  });
  it("wraps months across years", () => {
    expect(shiftMonth({ kind: "persian", year: 1405, month: 12 }, 1)).toEqual({ kind: "persian", year: 1406, month: 1 });
    expect(shiftMonth({ kind: "gregorian", year: 2026, month: 1 }, -1)).toEqual({ kind: "gregorian", year: 2025, month: 12 });
  });
});

describe("daily names", () => {
  it("formats tokens and strips separators", () => {
    const d = new Date(2026, 0, 5);
    expect(formatDailyName(d, "YYYY-MM-DD")).toBe("2026-01-05");
    expect(formatDailyName(d, "DD.MM.YY")).toBe("05.01.26");
    expect(formatDailyName(d, "YYYY/MM/DD")).toBe("2026-01-05");
  });
});
