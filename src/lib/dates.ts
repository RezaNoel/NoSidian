// Calendar helpers: Gregorian/Jalali (Solar Hijri) conversion, month grids
// and daily-note file names. Daily-note names always use Gregorian dates so a
// vault stays portable; only the calendar display follows the UI language.

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

// Jalali algorithm from jalaali-js (MIT), valid for years -61..3177.
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(y: number, m: number, d: number) {
  return d2j(g2d(y, m, d));
}

export function fromJalali(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

export type CalendarKind = "gregorian" | "persian";

export const calendarFor = (lang: string): CalendarKind => (lang === "fa" ? "persian" : "gregorian");

/** First day of the week: 0 = Sunday, 1 = Monday, 6 = Saturday. */
export function weekStartFor(lang: string): number {
  if (lang === "fa" || lang === "ar") return 6;
  if (["en", "ja", "ko", "zh", "hi", "pt-BR"].includes(lang)) return 0;
  return 1;
}

/** A month in the display calendar: `year`/`month` (1-based) are in that calendar. */
export interface MonthRef { kind: CalendarKind; year: number; month: number }

export function monthOf(date: Date, kind: CalendarKind): MonthRef {
  if (kind === "persian") {
    const j = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return { kind, year: j.jy, month: j.jm };
  }
  return { kind, year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function shiftMonth(m: MonthRef, by: number): MonthRef {
  const idx = m.year * 12 + (m.month - 1) + by;
  return { kind: m.kind, year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Local dates of every day in the month, in order. */
export function daysOf(m: MonthRef): Date[] {
  const out: Date[] = [];
  if (m.kind === "persian") {
    const len = jalaliMonthLength(m.year, m.month);
    for (let d = 1; d <= len; d++) {
      const g = fromJalali(m.year, m.month, d);
      out.push(new Date(g.gy, g.gm - 1, g.gd));
    }
  } else {
    const len = new Date(m.year, m.month, 0).getDate();
    for (let d = 1; d <= len; d++) out.push(new Date(m.year, m.month - 1, d));
  }
  return out;
}

/** Month grid as weeks of 7 cells; null cells pad the first and last week. */
export function monthGrid(m: MonthRef, weekStart: number): (Date | null)[][] {
  const days = daysOf(m);
  const lead = (days[0].getDay() - weekStart + 7) % 7;
  const cells: (Date | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Format a date with YYYY, YY, MM, M, DD, D tokens; anything else is literal. */
export function formatDailyName(date: Date, pattern: string): string {
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  const tokens: Record<string, string> = { YYYY: String(y), YY: pad(y % 100), MM: pad(mo), M: String(mo), DD: pad(d), D: String(d) };
  const out = (pattern || "YYYY-MM-DD").replace(/YYYY|YY|MM|M|DD|D/g, (tok) => tokens[tok]);
  // Never let a format produce path separators or reserved characters.
  return out.replace(/[\\/:*?"<>|]/g, "-").trim() || `${y}-${pad(mo)}-${pad(d)}`;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Intl locale tag that renders the display calendar (Persian months for fa). */
export function intlLocale(lang: string): string {
  return calendarFor(lang) === "persian" ? `${lang}-u-ca-persian` : lang;
}
