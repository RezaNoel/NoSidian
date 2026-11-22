// Themed date field used across the app instead of the browser's date input.
// Shows the date in the user's language and calendar (Jalali for Persian);
// the value is always an ISO date (YYYY-MM-DD) or "".
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-solid";
import { locale, t } from "../i18n";
import { calendarFor, intlLocale, isoDate, monthGrid, monthOf, sameDay, shiftMonth, weekStartFor, type MonthRef } from "../lib/dates";

const parse = (v: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

export function DatePicker(props: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  clearable?: boolean;
  size?: "sm";
  /** Hide the year (birthdays and yearly dates). */
  noYear?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  let btn!: HTMLButtonElement;
  const text = createMemo(() => {
    const d = parse(props.value);
    if (!d) return "";
    const opts: Intl.DateTimeFormatOptions = props.noYear ? { month: "long", day: "numeric" } : { dateStyle: "medium" };
    return new Intl.DateTimeFormat(intlLocale(locale()), opts).format(d);
  });
  return (
    <span class="date-field" classList={{ sm: props.size === "sm" }}>
      <button
        ref={btn}
        id={props.id}
        type="button"
        class="input date-btn"
        classList={{ sm: props.size === "sm", empty: !text() }}
        disabled={props.disabled}
        aria-label={props.label ? `${props.label}: ${text() || t("date-none")}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarDays aria-hidden="true" />
        <span dir="auto">{text() || t("date-pick")}</span>
      </button>
      <Show when={props.clearable && props.value && !props.disabled}>
        <button type="button" class="icon-btn date-clear" aria-label={t("date-clear")} title={t("date-clear")} onClick={() => props.onChange("")}><X /></button>
      </Show>
      <Show when={open()}>
        <DatePopover anchor={btn} value={props.value} noYear={props.noYear} onPick={(v) => { props.onChange(v); setOpen(false); btn.focus(); }} onClose={() => { setOpen(false); btn.focus(); }} />
      </Show>
    </span>
  );
}

function DatePopover(props: { anchor: HTMLElement; value: string; noYear?: boolean; onPick: (v: string) => void; onClose: () => void }) {
  const today = new Date();
  const kind = () => calendarFor(locale());
  const start = parse(props.value) ?? today;
  const [month, setMonth] = createSignal<MonthRef>(monthOf(start, kind()));
  const [focus, setFocus] = createSignal<Date>(start);
  const weekStart = () => weekStartFor(locale());
  const weeks = createMemo(() => monthGrid(month(), weekStart()));
  const title = createMemo(() => {
    const mid = weeks().flat().find((d) => d)!;
    return new Intl.DateTimeFormat(intlLocale(locale()), props.noYear ? { month: "long" } : { month: "long", year: "numeric" }).format(mid);
  });
  const weekdays = createMemo(() => {
    const f = new Intl.DateTimeFormat(locale(), { weekday: "narrow" });
    const long = new Intl.DateTimeFormat(locale(), { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2023, 0, 1 + ((i + weekStart()) % 7));
      return { short: f.format(d), long: long.format(d) };
    });
  });
  const dayNum = createMemo(() => new Intl.DateTimeFormat(intlLocale(locale()), { day: "numeric" }));
  const full = createMemo(() => new Intl.DateTimeFormat(intlLocale(locale()), { dateStyle: "full" }));
  const selected = () => parse(props.value);

  // Place below the field, or above when there is no room; keep inside the window.
  const [pos, setPos] = createSignal({ left: 0, top: 0 });
  let box!: HTMLDivElement;
  const place = () => {
    const r = props.anchor.getBoundingClientRect();
    const w = box?.offsetWidth || 280, h = box?.offsetHeight || 320;
    const rtl = getComputedStyle(props.anchor).direction === "rtl";
    let left = rtl ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    setPos({ left, top });
  };
  const outside = (e: PointerEvent) => {
    const n = e.target as Node;
    if (!box.contains(n) && !props.anchor.contains(n)) props.onClose();
  };
  onMount(() => {
    place();
    requestAnimationFrame(() => { place(); box.querySelector<HTMLElement>('[tabindex="0"]')?.focus(); });
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  });
  onCleanup(() => {
    window.removeEventListener("pointerdown", outside, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
  });

  const move = (by: number) => {
    const m = shiftMonth(month(), by);
    setMonth(m);
    const days = monthGrid(m, weekStart()).flat().filter((d): d is Date => !!d);
    setFocus(days.find((d) => d.getDate() === focus().getDate()) ?? days[0]);
  };
  let grid!: HTMLTableElement;
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); props.onClose(); return; }
    if (!(e.target as HTMLElement).closest(".cal-grid")) return;
    const rtl = getComputedStyle(grid).direction === "rtl";
    const step: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 };
    let next: Date | null = null;
    if (step[e.key] !== undefined) next = new Date(focus().getFullYear(), focus().getMonth(), focus().getDate() + step[e.key]);
    else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); move(e.key === "PageUp" ? -1 : 1); refocus(); return; }
    else if (e.key === "Home") next = today;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onPick(isoDate(focus())); return; }
    if (!next) return;
    e.preventDefault();
    setFocus(next);
    const m = monthOf(next, kind());
    if (m.year !== month().year || m.month !== month().month) setMonth(m);
    refocus();
  };
  const refocus = () => requestAnimationFrame(() => grid.querySelector<HTMLElement>('[tabindex="0"]')?.focus());

  return (
    <Portal>
      <div ref={box} class="date-pop glass-modal" role="dialog" aria-label={title()} style={{ left: `${pos().left}px`, top: `${pos().top}px` }} onKeyDown={key}>
        <div class="date-pop-head">
          <button type="button" class="icon-btn" aria-label={t("calendar-prev")} title={t("calendar-prev")} onClick={() => move(-1)}><ChevronLeft class="flip-rtl" /></button>
          <strong aria-live="polite">{title()}</strong>
          <button type="button" class="icon-btn" aria-label={t("calendar-next")} title={t("calendar-next")} onClick={() => move(1)}><ChevronRight class="flip-rtl" /></button>
        </div>
        <table ref={grid} class="cal-grid date-grid" role="grid" aria-label={title()}>
          <thead><tr><For each={weekdays()}>{(w) => <th scope="col" abbr={w.long}>{w.short}</th>}</For></tr></thead>
          <tbody>
            <For each={weeks()}>
              {(week) => (
                <tr>
                  <For each={week}>
                    {(d) => (
                      <td>
                        <Show when={d}>
                          {(day) => (
                            <button
                              type="button"
                              class="date-day"
                              classList={{ today: sameDay(day(), today), sel: !!selected() && sameDay(day(), selected()!) }}
                              tabIndex={sameDay(day(), focus()) ? 0 : -1}
                              aria-label={full().format(day())}
                              aria-pressed={!!selected() && sameDay(day(), selected()!)}
                              onClick={() => props.onPick(isoDate(day()))}
                            >{dayNum().format(day())}</button>
                          )}
                        </Show>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <div class="date-pop-foot">
          <button type="button" class="btn sm" onClick={() => props.onPick(isoDate(today))}>{t("calendar-today")}</button>
        </div>
      </div>
    </Portal>
  );
}
