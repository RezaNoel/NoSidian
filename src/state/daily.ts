// Daily notes: one note per day in the daily folder, named with the chosen
// format and created from an optional template note.
import { backend } from "../backend";
import { formatDailyName, isoDate } from "../lib/dates";
import { pref } from "./prefs";
import { contents, createNote, ensureLoaded, openNote, setContent, tree } from "./vault";
import { updateProfile } from "./workspace";

export function dailyPath(date: Date): string {
  const folder = pref("dailyFolder").replace(/^\/+|\/+$/g, "");
  const name = `${formatDailyName(date, pref("dailyFormat"))}.md`;
  return folder ? `${folder}/${name}` : name;
}

/** Set of daily-note paths that exist, for the calendar dots. */
export const existingPaths = () => new Set(tree.notes.map((n) => n.path));

/** Fill `{{date}}`, `{{title}}` and `{{time}}` in a template. */
export function fillTemplate(src: string, date: Date, title: string): string {
  const time = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
  return src.replace(/\{\{\s*date\s*\}\}/g, isoDate(date)).replace(/\{\{\s*title\s*\}\}/g, title).replace(/\{\{\s*time\s*\}\}/g, time);
}

export async function openDailyNote(date: Date): Promise<void> {
  const path = dailyPath(date);
  if (existingPaths().has(path)) {
    openNote(path);
    if (pref("dailyTasks")) void addDayTasks(date, path);
    return;
  }
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : undefined;
  const title = path.slice(slash + 1, -3);
  let body = `# ${title}\n\n`;
  const tpl = pref("dailyTemplate");
  if (tpl && existingPaths().has(tpl)) {
    const src = contents[tpl] ?? (await backend.read(tpl).catch(() => ""));
    body = fillTemplate(src, date, title);
  }
  const made = await createNote(title, folder, body);
  if (made && pref("dailyTasks")) void addDayTasks(date, made);
}

/** Put the day's tasks (due or scheduled that day) into its daily note, once each. */
async function addDayTasks(date: Date, path: string): Promise<void> {
  const [{ allTasks }, { injectDueTasksIntoDailyNote }, { t }] = await Promise.all([import("./projects"), import("../core/projectEngine"), import("../i18n")]);
  await ensureLoaded(path);
  const r = injectDueTasksIntoDailyNote(contents[path] ?? "", isoDate(date), allTasks(), t("daily-tasks-heading"));
  if (r.injectedCount) setContent(path, r.content);
}

/** Apply the startup preference after a vault opens. */
export async function applyStartup(): Promise<void> {
  const screen = pref("startup");
  if (screen === "daily" || pref("dailyOnStartup")) return openDailyNote(new Date());
  if (screen === "empty") updateProfile((p) => { p.activeTab = null; });
  if (screen === "dashboard") { const { openView } = await import("./views"); await openView("dashboard"); }
}
