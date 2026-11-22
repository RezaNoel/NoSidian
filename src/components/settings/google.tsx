// Google Calendar connection: sign in, choose what NoSidian sends, sync now.
import { Show, onMount } from "solid-js";
import { CalendarCheck, LogOut, RefreshCw } from "lucide-solid";
import { locale, t } from "../../i18n";
import { inTauri } from "../../state/backend";
import { connectGoogle, disconnectGoogle, googleBusy, googlePrefs, googleStatus, refreshGoogleStatus, syncGoogle } from "../../state/google";
import { Toggle } from "../controls";

export function GoogleCalendarSettings() {
  onMount(() => void refreshGoogleStatus());
  const last = () => (googlePrefs.state.lastSync ? new Date(googlePrefs.state.lastSync).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) : "");
  return (
    <Show when={inTauri()} fallback={<p class="hint">{t("cal-google-desktop")}</p>}>
      <Show when={googleStatus().configured} fallback={<p class="hint">{t("cal-google-unavailable")}</p>}>
        <Show
          when={googleStatus().connected}
          fallback={
            <div class="stack">
              <p class="hint">{t("cal-google-about")}</p>
              <div><button class="btn primary" disabled={!!googleBusy()} onClick={() => void connectGoogle()}><CalendarCheck />{googleBusy() === "connect" ? t("cal-google-waiting") : t("cal-google-connect")}</button></div>
            </div>
          }
        >
          <div class="stack">
            <div class="row wrap">
              <span dir="auto"><strong>{googleStatus().account ?? t("cal-google")}</strong></span>
              <span class="tb-fill" />
              <button class="btn sm" disabled={!!googleBusy()} onClick={() => void syncGoogle(false)}><RefreshCw classList={{ spin: googleBusy() === "sync" }} />{t("cal-google-sync")}</button>
              <button class="btn sm" onClick={() => void disconnectGoogle()}><LogOut />{t("cal-google-disconnect")}</button>
            </div>
            <Show when={last()}><p class="hint">{t("cal-google-last", { time: last() })}</p></Show>
            <Toggle label={t("cal-google-push-tasks")} checked={googlePrefs.state.pushTasks} onChange={(v) => googlePrefs.update((g) => { g.pushTasks = v; })} />
            <Toggle label={t("cal-google-push-deadlines")} checked={googlePrefs.state.pushDeadlines} onChange={(v) => googlePrefs.update((g) => { g.pushDeadlines = v; })} />
            <Toggle label={t("cal-google-push-dates")} checked={googlePrefs.state.pushDates} onChange={(v) => googlePrefs.update((g) => { g.pushDates = v; })} />
            <Toggle label={t("cal-google-to-tasks")} hint={t("cal-google-to-tasks-help")} checked={googlePrefs.state.eventsToTasks !== false} onChange={(v) => googlePrefs.update((g) => { g.eventsToTasks = v; })} />
          </div>
        </Show>
      </Show>
    </Show>
  );
}
