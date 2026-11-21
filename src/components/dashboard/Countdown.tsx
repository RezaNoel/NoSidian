// Dashboard widget: days until the next birthday, age today, and the next
// important dates. Asks for a birthday when none is set.
import { For, Show, createMemo } from "solid-js";
import { Cake, Settings2, Star } from "lucide-solid";
import { locale, t } from "../../i18n";
import { ageOn, daysUntil, personal } from "../../state/personal";
import { openSettings } from "../settings/SettingsWindow";

export function CountdownWidget() {
  const num = (n: number) => n.toLocaleString(locale());
  const b = () => personal.state.birthday;
  const toBirthday = createMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(b()) ? daysUntil(b().slice(5)) : null));
  const age = createMemo(() => ageOn(b()));
  const upcoming = createMemo(() =>
    personal.state.dates
      .map((d) => ({ d, days: d.date.length === 5 ? daysUntil(d.date) : Math.round((new Date(`${d.date}T00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) }))
      .filter((x) => x.days >= 0)
      .sort((a, z) => a.days - z.days)
      .slice(0, 3),
  );
  return (
    <div class="w-countdown">
      <Show
        when={toBirthday() !== null}
        fallback={
          <button class="w-countdown-empty" onClick={() => openSettings("you")}>
            <Cake aria-hidden="true" />
            <span>{t("countdown-set-birthday")}</span>
            <Settings2 aria-hidden="true" class="muted" />
          </button>
        }
      >
        <div class="w-countdown-hero">
          <Cake aria-hidden="true" />
          <Show when={toBirthday() === 0} fallback={<><strong>{num(toBirthday()!)}</strong><span>{t("countdown-days-to-birthday", { days: toBirthday()! })}</span></>}>
            <strong>{t("countdown-today")}</strong>
          </Show>
        </div>
        <Show when={age()}>
          {(a) => (
            <p class="w-countdown-age">
              {t("countdown-age", { years: a().years, months: a().months, days: a().days })}
              <span class="muted"> · {t("countdown-lived", { days: num(a().totalDays) })}</span>
            </p>
          )}
        </Show>
      </Show>
      <Show when={upcoming().length}>
        <ul class="w-countdown-list">
          <For each={upcoming()}>
            {(x) => (
              <li>
                <Star aria-hidden="true" />
                <span dir="auto">{x.d.label}</span>
                <span class="muted">{x.days === 0 ? t("countdown-today-short") : t("countdown-in-days", { days: x.days })}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
