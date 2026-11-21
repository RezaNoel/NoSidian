// Phase 0 foundation preview: exercises language/RTL, themes, glass and
// accessibility settings. Replaced by onboarding and the real workspace in Phase 1.
import { For, type JSX } from "solid-js";
import { t, format, type MessageKey } from "../i18n";
import { LANGUAGES, type LanguageCode } from "../i18n/languages";
import { announce } from "../a11y/announcer";
import { settings, updateSettings, resetSettings } from "../state/settings";
import { THEMES, type Density, type ExperienceLevel, type RadiusScale, type ThemeId } from "../state/types";

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

function Field(props: { label: string; hint?: string; children: (id: string) => JSX.Element }) {
  const id = nextId("f");
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      {props.children(id)}
      {props.hint && <span class="hint">{props.hint}</span>}
    </div>
  );
}

function Segmented<T extends string>(props: {
  legend: string;
  name: string;
  options: { value: T; label: MessageKey }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <fieldset>
        <legend>{props.legend}</legend>
        <div class="segmented">
          <For each={props.options}>
            {(o) => (
              <label>
                <input type="radio" name={props.name} value={o.value}
                  checked={props.value === o.value}
                  onChange={() => { props.onChange(o.value); announce(t("announce-setting-saved")); }} />
                <span>{t(o.label)}</span>
              </label>
            )}
          </For>
        </div>
      </fieldset>
    </div>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={props.checked}
        onChange={(e) => { props.onChange(e.currentTarget.checked); announce(t("announce-setting-saved")); }} />
      <span>
        <strong>{props.label}</strong>
        {props.hint && <><br /><span class="hint">{props.hint}</span></>}
      </span>
    </label>
  );
}

export function Preview() {
  const a = () => settings.appearance;

  const changeLanguage = (code: LanguageCode) => {
    updateSettings((c) => { c.language = code; });
    const name = LANGUAGES.find((l) => l.code === code)?.name ?? code;
    // Announce in the new language so the screen reader switches voice too.
    announce(format(code, "announce-language-changed", { language: name }));
  };

  const changeTheme = (theme: ThemeId) => {
    updateSettings((c) => { c.appearance.theme = theme; });
    announce(t("announce-theme-changed", { theme: t(`theme-${theme}` as MessageKey) }));
  };

  return (
    <div class="preview">
      <header>
        <h1>{t("app-name")}: {t("preview-title")}</h1>
        <p>{t("app-tagline")}</p>
        <p>{t("preview-intro")}</p>
      </header>

      <section class="glass" aria-labelledby="sec-lang">
        <h2 id="sec-lang">{t("preview-section-language")}</h2>
        <div class="fields">
          <Field label={t("field-language")}>
            {(id) => (
              <select id={id} value={settings.language ?? "en"}
                onChange={(e) => changeLanguage(e.currentTarget.value as LanguageCode)}>
                <For each={LANGUAGES}>
                  {(l) => <option value={l.code} lang={l.code} dir={l.dir}>{l.name}</option>}
                </For>
              </select>
            )}
          </Field>
          <Field label={t("field-experience")}>
            {(id) => (
              <select id={id} value={settings.experienceLevel}
                onChange={(e) => updateSettings((c) => { c.experienceLevel = e.currentTarget.value as ExperienceLevel; })}>
                <option value="beginner">{t("experience-beginner")}</option>
                <option value="intermediate">{t("experience-intermediate")}</option>
                <option value="advanced">{t("experience-advanced")}</option>
              </select>
            )}
          </Field>
        </div>
      </section>

      <section class="glass" aria-labelledby="sec-look">
        <h2 id="sec-look">{t("preview-section-appearance")}</h2>
        <div class="fields">
          <Field label={t("field-theme")}>
            {(id) => (
              <select id={id} value={a().theme} onChange={(e) => changeTheme(e.currentTarget.value as ThemeId)}>
                <For each={THEMES}>{(th) => <option value={th}>{t(`theme-${th}` as MessageKey)}</option>}</For>
              </select>
            )}
          </Field>
          <Field label={t("field-accent")}>
            {(id) => (
              <input id={id} type="color" value={a().accent}
                onInput={(e) => updateSettings((c) => { c.appearance.accent = e.currentTarget.value; })} />
            )}
          </Field>
          <Field label={`${t("field-glass-blur")} (${a().glassBlur}px)`}>
            {(id) => (
              <input id={id} type="range" min="0" max="40" step="1" value={a().glassBlur}
                onInput={(e) => updateSettings((c) => { c.appearance.glassBlur = Number(e.currentTarget.value); })} />
            )}
          </Field>
          <Field label={`${t("field-glass-opacity")} (${Math.round(a().glassOpacity * 100)}%)`}>
            {(id) => (
              <input id={id} type="range" min="0.2" max="0.95" step="0.01" value={a().glassOpacity}
                onInput={(e) => updateSettings((c) => { c.appearance.glassOpacity = Number(e.currentTarget.value); })} />
            )}
          </Field>
          <Segmented<RadiusScale> legend={t("field-radius")} name="radius" value={a().radius}
            options={[
              { value: "sharp", label: "radius-sharp" },
              { value: "balanced", label: "radius-balanced" },
              { value: "soft", label: "radius-soft" },
            ]}
            onChange={(v) => updateSettings((c) => { c.appearance.radius = v; })} />
          <Segmented<Density> legend={t("field-density")} name="density" value={a().density}
            options={[
              { value: "compact", label: "density-compact" },
              { value: "comfortable", label: "density-comfortable" },
            ]}
            onChange={(v) => updateSettings((c) => { c.appearance.density = v; })} />
          <Toggle label={t("field-ambient-mesh")} checked={a().ambientMesh}
            onChange={(v) => updateSettings((c) => { c.appearance.ambientMesh = v; })} />
        </div>
        <div class="sample glass" style={{ "margin-block-start": "16px" }}>
          <h3>{t("preview-sample-heading")}</h3>
          <p>{t("preview-sample-body")}</p>
        </div>
      </section>

      <section class="glass" aria-labelledby="sec-a11y">
        <h2 id="sec-a11y">{t("preview-section-accessibility")}</h2>
        <div class="fields">
          <Toggle label={t("field-screen-reader")} hint={t("field-screen-reader-hint")}
            checked={settings.accessibility.screenReaderMode}
            onChange={(v) => updateSettings((c) => { c.accessibility.screenReaderMode = v; })} />
          <Toggle label={t("field-reduce-motion")} checked={settings.accessibility.reduceMotion}
            onChange={(v) => updateSettings((c) => { c.accessibility.reduceMotion = v; })} />
        </div>
      </section>

      <button type="button" class="btn" onClick={() => { resetSettings(); announce(t("announce-setting-saved")); }}>
        {t("action-reset-defaults")}
      </button>
    </div>
  );
}
