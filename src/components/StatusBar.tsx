// Status bar: language, theme, backlinks, counts and save state.
import { Show, createMemo, createResource } from "solid-js";
import { Check, Globe, LoaderCircle, Palette } from "lucide-solid";
import { t } from "../i18n";
import { languageInfo } from "../i18n/languages";
import { stats } from "../lib/markdown";
import { backend } from "../backend";
import { activePath, contents, indexRev, saving } from "../state/vault";
import { settings } from "../state/settings";
import { openSettings } from "./settings/SettingsWindow";

export function StatusBar() {
  const s = createMemo(() => (activePath() ? stats(contents[activePath()!] ?? "") : null));
  const [back] = createResource(
    () => (activePath() ? { path: activePath()!, rev: indexRev() } : false),
    async ({ path }) => (await backend.links(path)).backlinks.length,
    { initialValue: 0 },
  );
  return (
    <footer class="statusbar glass" aria-label={t("shell-status-bar-label")}>
      <button class="status-item" onClick={() => openSettings("you")} title={t("field-language")}>
        <Globe aria-hidden="true" />{languageInfo(settings.language ?? "en").name}
      </button>
      <button class="status-item" onClick={() => openSettings("appearance")} title={t("field-theme")}>
        <Palette aria-hidden="true" />{t(`theme-${settings.appearance.theme}`)}
      </button>
      <span class="status-spacer" />
      <Show when={s()}>
        {(st) => (
          <>
            <span class="status-item">{t("status-backlinks", { count: back() })}</span>
            <span class="status-item">{t("status-words", { count: st().words })}</span>
            <span class="status-item hide-sm">{t("status-chars", { count: st().chars })}</span>
            <span class="status-item hide-sm">{t("status-read-time", { minutes: st().minutes })}</span>
          </>
        )}
      </Show>
      <span class="status-item save-state" aria-live="off">
        {saving() ? <><LoaderCircle class="spin" aria-hidden="true" />{t("status-saving")}</> : <><Check aria-hidden="true" />{t("status-saved")}</>}
      </span>
    </footer>
  );
}
