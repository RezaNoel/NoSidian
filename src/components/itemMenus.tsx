// Right-click menus shared by the lists that show notes, tags and days:
// recent, starred, search results, links, the start page and the calendar.
import { CalendarHeart, CalendarPlus, Copy, ExternalLink, FileText, FolderSearch, Hash, Link, Search, Star, Trash2, X } from "lucide-solid";
import { openMenu, type MenuItem } from "./ContextMenu";
import { revealInFiles } from "./FileTree";
import { t } from "../i18n";
import { openNote, toggleStar } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { askText, toast } from "../state/ui";
import { openDailyNote } from "../state/daily";
import { personal } from "../state/personal";
import { addGoogleEvent, googleStatus } from "../state/google";
import { ymd } from "../state/calendarMarks";

const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(t("copied")), () => toast(t("menu-failed")));

/** Menu for a note shown in a list. `extra` items go after the common ones. */
export function noteItemMenu(e: MouseEvent, path: string, extra: MenuItem[] = []): void {
  const starred = profile.starred.includes(path);
  openMenu(e, [
    { label: t("menu-open"), icon: <ExternalLink />, run: () => openNote(path) },
    { label: starred ? t("action-unstar") : t("action-star"), icon: <Star />, run: () => toggleStar(path) },
    { label: t("menu-copy-link"), icon: <Link />, sep: true, run: () => copy(`[[${path.replace(/\.md$/i, "")}]]`) },
    { label: t("tab-copy-path"), icon: <Copy />, run: () => copy(path) },
    { label: t("tab-show-in-files"), icon: <FolderSearch />, run: () => revealInFiles(path) },
    ...extra.map((x, i) => (i === 0 ? { ...x, sep: true } : x)),
  ]);
}

/** Extra items for the recent list. */
export const recentExtras = (path: string): MenuItem[] => [
  { label: t("menu-remove-recent"), icon: <X />, run: () => updateProfile((p) => { p.recent = p.recent.filter((r) => r.path !== path); }) },
  { label: t("menu-clear-recent"), icon: <Trash2 />, danger: true, run: () => updateProfile((p) => { p.recent = []; }) },
];

export function tagMenu(e: MouseEvent, tag: string): void {
  openMenu(e, [
    { label: t("tag-search"), icon: <Search />, run: () => window.dispatchEvent(new CustomEvent("nosidian:search", { detail: `#${tag}` })) },
    { label: t("tag-copy"), icon: <Hash />, run: () => copy(`#${tag}`) },
  ]);
}

/** Menu for a day in the calendar. */
export function dayMenu(e: MouseEvent, day: Date): void {
  const key = ymd(day);
  const mmdd = key.slice(5);
  const onDay = personal.state.dates.filter((x) => x.date === key || x.date === mmdd);
  const addDate = async (yearly: boolean) => {
    const label = (await askText(t("personal-date-label"), "", t("action-add")))?.trim();
    if (!label) return;
    personal.update((p) => { p.dates.push({ id: `d${Date.now().toString(36)}`, label, date: yearly ? mmdd : key }); });
  };
  openMenu(e, [
    { label: t("calendar-open-note"), icon: <FileText />, run: () => void openDailyNote(day) },
    { label: t("cal-add-yearly"), icon: <CalendarHeart />, sep: true, run: () => void addDate(true) },
    { label: t("cal-add-once"), icon: <CalendarPlus />, run: () => void addDate(false) },
    ...(googleStatus().connected ? [{ label: t("cal-add-event"), icon: <CalendarPlus />, run: async () => {
      const v = (await askText(t("cal-add-event"), "", t("action-add")))?.trim();
      if (v) await addGoogleEvent(key, v);
    } }] : []),
    ...onDay.map((d, i) => ({ label: t("cal-remove-date", { name: d.label }), icon: <Trash2 />, danger: true, sep: i === 0, run: () => personal.update((p) => { p.dates = p.dates.filter((x) => x.id !== d.id); }) })),
  ]);
}
