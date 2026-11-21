// Calendar panel: month grid with dots on days that have a daily note. Uses
// the Persian (Jalali) calendar when the UI language is Persian. Arrow keys
// move between days; Enter opens or creates that day's note.
import { For, Show, createMemo, createSignal } from "solid-js";
import { ChevronLeft, ChevronRight } from "lucide-solid";
import { locale, t } from "../i18n";
import { calendarFor, intlLocale, monthGrid, monthOf, sameDay, shiftMonth, weekStartFor, type MonthRef } from "../lib/dates";
import { dailyPath, existingPaths, openDailyNote } from "../state/daily";
import { isMobile, setDrawer } from "../state/ui";

export function CalendarPanel() {
  const today = new Date();
  const kind = () => calendarFor(locale());
  const [shown, setShown] = createSignal<MonthRef>(monthOf(today, kind()));
  const [focus, setFocus] = createSignal<Date>(today);
  // Re-anchor when the language (and so the calendar) changes.
  const month = createMemo(() => (shown().kind === kind() ? shown() : monthOf(focus(), kind())));
  const weekStart = () => weekStartFor(locale());
  const weeks = createMemo(() => monthGrid(month(), weekStart()));
  const existing = createMemo(() => existingPaths());

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
                          const has = () => existing().has(dailyPath(day()));
                          const isFocus = () => sameDay(day(), focus());
                          return (
                            <button
                              class="cal-day"
                              classList={{ today: sameDay(day(), today), has: has(), focus: isFocus() }}
                              tabIndex={isFocus() ? 0 : -1}
                              aria-current={sameDay(day(), today) ? "date" : undefined}
                              aria-label={`${fullDate().format(day())}${has() ? `, ${t("calendar-has-note")}` : ""}`}
                              onClick={() => { setFocus(day()); open(day()); }}
                            >
                              {dayNum().format(day())}
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
    </div>
  );
}
