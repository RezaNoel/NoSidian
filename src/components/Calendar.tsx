// Calendar panel: month grid with small symbols on days that stand out
// (birthday, important dates, deadlines, scheduled tasks, Google events,
// review and focus days, daily notes) and the focused day's agenda below.
// Uses the Persian (Jalali) calendar when the UI language is Persian. Arrow
// keys move between days; Enter opens or creates that day's note.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Brain, CalendarDays, Cake, ChevronLeft, ChevronRight, Clock, FileText, Flag, ListChecks, ListPlus, Plus, Star, Timer } from "lucide-solid";
import { marksOn, ymd, type Mark, type MarkKind } from "../state/calendarMarks";
import { addEventToTasks, addGoogleEvent, googleStatus } from "../state/google";
import { projectState } from "../state/projects";
import { askText, toast } from "../state/ui";
import { locale, t } from "../i18n";
import { calendarFor, intlLocale, monthGrid, monthOf, sameDay, shiftMonth, weekStartFor, type MonthRef } from "../lib/dates";
import { openDailyNote } from "../state/daily";
import { dayMenu } from "./itemMenus";
import { isMobile, setDrawer } from "../state/ui";

const ICONS: Record<MarkKind, typeof Star> = { birthday: Cake, date: Star, deadline: Flag, task: Clock, google: CalendarDays, cards: Brain, focus: Timer, daily: FileText };

/** Up to three distinct symbols for a day; the daily note shows as a dot. */
function DayMarks(props: { marks: Mark[] }) {
  const kinds = () => [...new Set(props.marks.map((m) => m.kind).filter((k) => k !== "daily"))].slice(0, 3);
  return (
    <Show when={kinds().length}>
      <span class="cal-marks" aria-hidden="true">
        <For each={kinds()}>{(k) => { const I = ICONS[k]; return <I class={`cal-mark mk-${k}`} />; }}</For>
      </span>
    </Show>
  );
}

export function CalendarPanel() {
  const today = new Date();
  const kind = () => calendarFor(locale());
  const [shown, setShown] = createSignal<MonthRef>(monthOf(today, kind()));
  const [focus, setFocus] = createSignal<Date>(today);
  // Re-anchor when the language (and so the calendar) changes.
  const month = createMemo(() => (shown().kind === kind() ? shown() : monthOf(focus(), kind())));
  const weekStart = () => weekStartFor(locale());
  const weeks = createMemo(() => monthGrid(month(), weekStart()));
  const agenda = createMemo(() => marksOn(focus()));
  const addEvent = async () => {
    const v = await askText(t("cal-add-event"), "", t("action-add"));
    if (v?.trim()) await addGoogleEvent(ymd(focus()), v.trim());
  };

  const title = createMemo(() => {
    const mid = weeks().flat().find((d) => d)!;
    return new Intl.DateTimeFormat(intlLocale(locale()), { month: "long", year: "numeric" }).format(mid);
  });
  const weekdays = createMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
    const long = new Intl.DateTimeFormat(locale(), { weekday: "long" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2023, 0, 1 + ((i + weekStart()) % 7));
      return { short: fmt.format(d), long: long.format(d) };
    });
  });
  const dayNum = createMemo(() => new Intl.DateTimeFormat(intlLocale(locale()), { day: "numeric" }));
  const fullDate = createMemo(() => new Intl.DateTimeFormat(intlLocale(locale()), { dateStyle: "full" }));

  const move = (by: number) => {
    setShown(shiftMonth(month(), by));
    const days = weeks().flat().filter((d): d is Date => !!d);
    setFocus(days.find((d) => sameDay(d, today)) ?? days[0]);
  };
  const open = (d: Date) => {
    void openDailyNote(d);
    if (isMobile()) setDrawer("none");
  };
  const goToday = () => {
    setShown(monthOf(today, kind()));
    setFocus(today);
  };

  let grid!: HTMLTableElement;
  const onKey = (e: KeyboardEvent) => {
    const rtl = getComputedStyle(grid).direction === "rtl";
    const step: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 };
    let next: Date | null = null;
    if (step[e.key] !== undefined) next = new Date(focus().getFullYear(), focus().getMonth(), focus().getDate() + step[e.key]);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      move(e.key === "PageUp" ? -1 : 1);
      next = weeks().flat().find((d) => d)!;
    } else if (e.key === "Home") next = today;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return open(focus());
    }
    if (!next) return;
    e.preventDefault();
    setFocus(next);
    const m = monthOf(next, kind());
    if (m.year !== month().year || m.month !== month().month) setShown(m);
    requestAnimationFrame(() => grid.querySelector<HTMLElement>('[tabindex="0"]')?.focus());
  };

  return (
    <div class="panel calendar">
      <div class="panel-head cal-head">
        <h2 class="section-title" aria-live="polite">{title()}</h2>
        <div class="cal-nav">
          <button class="icon-btn" title={t("calendar-prev")} aria-label={t("calendar-prev")} onClick={() => move(-1)}><ChevronLeft class="flip-rtl" /></button>
          <button class="btn sm" onClick={goToday}>{t("calendar-today")}</button>
          <button class="icon-btn" title={t("calendar-next")} aria-label={t("calendar-next")} onClick={() => move(1)}><ChevronRight class="flip-rtl" /></button>
        </div>
      </div>
      <table ref={grid} class="cal-grid" role="grid" aria-label={title()} onKeyDown={onKey}>
        <thead>
          <tr><For each={weekdays()}>{(w) => <th scope="col" abbr={w.long}>{w.short}</th>}</For></tr>
        </thead>
        <tbody>
          <For each={weeks()}>
            {(week) => (
              <tr>
                <For each={week}>
                  {(d) => (
                    <td>
                      <Show when={d}>
                        {(day) => {
                          const marks = createMemo(() => marksOn(day()));
                          const has = () => marks().some((m) => m.kind === "daily");
                          const special = () => marks().some((m) => m.kind === "birthday" || m.kind === "date");
                          const isFocus = () => sameDay(day(), focus());
                          return (
                            <button
                              class="cal-day"
                              classList={{ today: sameDay(day(), today), has: has(), special: special(), focus: isFocus() }}
                              tabIndex={isFocus() ? 0 : -1}
                              aria-current={sameDay(day(), today) ? "date" : undefined}
                              aria-label={[fullDate().format(day()), ...marks().map((m) => m.label)].join(", ")}
                              title={marks().map((m) => m.label).join("\n") || undefined}
                              onClick={() => { if (isFocus()) open(day()); else setFocus(day()); }}
                              onDblClick={() => open(day())}
                              onContextMenu={(e) => { setFocus(day()); dayMenu(e, day()); }}
                            >
                              <span class="cal-num">{dayNum().format(day())}</span>
                              <DayMarks marks={marks()} />
                            </button>
                          );
                        }}
                      </Show>
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <section class="cal-agenda" aria-label={fullDate().format(focus())}>
        <div class="cal-agenda-head">
          <span class="cal-agenda-date">{fullDate().format(focus())}</span>
          <button class="icon-btn sm" title={t("calendar-open-note")} aria-label={t("calendar-open-note")} onClick={() => open(focus())}><FileText /></button>
          <Show when={googleStatus().connected}>
            <button class="icon-btn sm" title={t("cal-add-event")} aria-label={t("cal-add-event")} onClick={() => void addEvent()}><Plus /></button>
          </Show>
        </div>
        <Show when={agenda().filter((m) => m.kind !== "daily").length} fallback={<p class="cal-agenda-empty">{t("cal-agenda-empty")}</p>}>
          <ul>
            <For each={agenda().filter((m) => m.kind !== "daily")}>
              {(m) => {
                const I = ICONS[m.kind];
                const inTasks = () => !!m.eventId && projectState.state.tasks.some((x) => x.googleEventId === m.eventId);
                return (
                  <li>
                    <I class={`cal-mark mk-${m.kind}`} aria-hidden="true" />
                    <span dir="auto">{m.label}</span>
                    <Show when={m.eventId}>
                      <button class="icon-btn xs cal-to-task" disabled={inTasks()} title={inTasks() ? t("cal-in-tasks") : t("cal-to-task")} aria-label={inTasks() ? t("cal-in-tasks") : t("cal-to-task")}
                        onClick={() => { if (addEventToTasks(m.eventId!)) toast(t("cal-added-task")); }}>
                        <Show when={inTasks()} fallback={<ListPlus />}><ListChecks /></Show>
                      </button>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
