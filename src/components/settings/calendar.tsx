// Calendar settings: what the calendar marks on each day, and the Google
// Calendar connection.
import { For } from "solid-js";
import { t, type MessageKey } from "../../i18n";
import { calPrefs, CAL_SOURCES } from "../../state/calendarPrefs";
import { Toggle } from "../controls";
import { GoogleCalendarSettings } from "./google";

export function CalendarSettings() {
  return (
    <div class="stack">
      <h3 class="set-sub">{t("cal-show")}</h3>
      <For each={CAL_SOURCES}>
        {(s) => <Toggle label={t(`cal-src-${s}` as MessageKey)} checked={calPrefs.state.show[s] !== false} onChange={(v) => calPrefs.update((c) => { c.show[s] = v; })} />}
      </For>
      <h3 class="set-sub">{t("cal-google")}</h3>
      <GoogleCalendarSettings />
    </div>
  );
}
