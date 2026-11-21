// Personal details the user may fill in (all optional, stored only on this
// computer): name for greetings, birthday, and important dates that show in
// the calendar and the countdown widget.
import { t } from "../i18n";
import { appDoc } from "./persist";

export interface ImportantDate { id: string; label: string; /** MM-DD for yearly dates, YYYY-MM-DD for one-off. */ date: string; icon?: string }

export interface Personal {
  name: string;
  /** YYYY-MM-DD, or "" when not set. */
  birthday: string;
  dates: ImportantDate[];
  /** Play the start sound when the app opens. */
  startupSound: boolean;
  /** Show (and announce) the welcome greeting when the app opens. */
  greet: boolean;
}

export const personal = appDoc<Personal>("personal", () => ({ name: "", birthday: "", dates: [], startupSound: true, greet: true }));

const pad = (n: number) => String(n).padStart(2, "0");
const md = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymd = (d: Date) => `${d.getFullYear()}-${md(d)}`;

export function isBirthday(day: Date): boolean {
  const b = personal.state.birthday;
  return !!b && b.slice(5) === md(day);
}

/** Important dates (and the birthday) falling on a given day. */
export function datesOn(day: Date): ImportantDate[] {
  const out = personal.state.dates.filter((x) => (x.date.length === 5 ? x.date === md(day) : x.date === ymd(day)));
  if (isBirthday(day)) out.unshift({ id: "birthday", label: t("personal-birthday"), date: personal.state.birthday.slice(5), icon: "cake" });
  return out;
}

/** Whole days until the next occurrence of a MM-DD date (0 = today). */
export function daysUntil(mmdd: string, from = new Date()): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const [m, d] = mmdd.split("-").map(Number);
  let next = new Date(start.getFullYear(), m - 1, d);
  if (next < start) next = new Date(start.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

/** Age in years, months and days on a given day. */
export function ageOn(birthday: string, day = new Date()): { years: number; months: number; days: number; totalDays: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const [y, m, d] = birthday.split("-").map(Number);
  const b = new Date(y, m - 1, d);
  if (b > day) return null;
  let years = day.getFullYear() - y;
  let months = day.getMonth() - (m - 1);
  let days = day.getDate() - d;
  if (days < 0) { months -= 1; days += new Date(day.getFullYear(), day.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  const totalDays = Math.floor((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - b.getTime()) / 86_400_000);
  return { years, months, days, totalDays };
}

/** Greeting for the start page and the welcome toast. */
export function greeting(now = new Date()): string {
  const name = personal.state.name.trim();
  if (isBirthday(now)) return name ? t("greet-birthday-name", { name }) : t("greet-birthday");
  const h = now.getHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : h < 22 ? "evening" : "night";
  return name ? t(`greet-${part}-name` as "greet-morning-name", { name }) : t(`greet-${part}` as "greet-morning");
}

let welcomed = false;
/** Play the start sound and show the greeting once per app launch. */
export async function welcome(toast: (msg: string) => void, announce?: (msg: string) => void): Promise<void> {
  if (welcomed) return;
  welcomed = true;
  for (let i = 0; i < 40 && !personal.ready(); i++) await new Promise((r) => setTimeout(r, 50));
  if (personal.state.startupSound) {
    const a = new Audio("sounds/startup.wav");
    a.volume = 0.7;
    void a.play().catch(() => undefined);
  }
  if (personal.state.greet) {
    const msg = greeting();
    toast(msg);
    announce?.(msg);
  }
}
