// What the calendar marks on each day. Each source can be switched off in
// Settings › Calendar.
import { appDoc } from "./persist";

export const CAL_SOURCES = ["daily", "tasks", "deadlines", "flashcards", "focus", "dates", "google"] as const;
export type CalSource = (typeof CAL_SOURCES)[number];

export interface CalendarPrefs { show: Partial<Record<CalSource, boolean>> }

export const calPrefs = appDoc<CalendarPrefs>("calendar", () => ({ show: {} }));
export const calShows = (s: CalSource) => calPrefs.state.show[s] !== false;
