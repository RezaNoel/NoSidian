// Form controls shared by settings and onboarding.
import { For, createUniqueId, type JSX } from "solid-js";
import { announce } from "../a11y/announcer";
import { format, t } from "../i18n";
import { LANGUAGES, type LanguageCode } from "../i18n/languages";
import { settings, updateSettings } from "../state/settings";
import type { ThemeId } from "../state/types";

export function Field(props: { label: string; hint?: string; children: (id: string) => JSX.Element }) {
  const id = createUniqueId();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      {props.children(id)}
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

export function Choice<T extends string>(props: { legend: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const name = createUniqueId();
  return (
    <fieldset class="field">
      <legend>{props.legend}</legend>
      <div class="choice">
        <For each={props.options}>
          {(o) => (
            <label>
              <input type="radio" name={name} value={o.value} checked={props.value === o.value} onChange={() => { props.onChange(o.value); announce(t("announce-setting-saved")); }} />
              <span>{o.label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}

export function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <span class="toggle-text">
        <strong>{props.label}</strong>
        {props.hint && <span class="hint">{props.hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => { props.onChange(e.currentTarget.checked); announce(t("announce-setting-saved")); }} />
    </label>
  );
}

export function changeLanguage(code: LanguageCode): void {
  updateSettings((c) => { c.language = code; });
  const name = LANGUAGES.find((l) => l.code === code)?.name ?? code;
  // Announced in the new language so the screen reader switches voice too.
  announce(format(code, "announce-language-changed", { language: name }));
}

export function changeTheme(theme: ThemeId): void {
  updateSettings((c) => { c.appearance.theme = theme; });
  announce(t("announce-theme-changed", { theme: t(`theme-${theme}`) }));
}

/** Live sample of the glass material: shapes behind a frosted card, so blur changes are visible. Not selectable. */
export function GlassPreview() {
  return (
    <div class="glass-preview" role="img" aria-label={`${t("glass-preview-badge")}: ${t("field-glass-blur")} ${settings.appearance.glassBlur}px`}>
      <span class="gp-badge" aria-hidden="true">{t("glass-preview-badge")}</span>
      <div class="gp-scene" aria-hidden="true">
        <span class="gp-dot a" /><span class="gp-dot b" /><span class="gp-dot c" />
        <span class="gp-bar" /><span class="gp-bar short" />
      </div>
      <div class="gp-pane glass" aria-hidden="true">
        <i /><i /><i class="short" />
      </div>
    </div>
  );
}
