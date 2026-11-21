// Quick settings (language, appearance, accessibility). The full 13-tab
// settings window with search replaces this in Phase 2.
import { For, Show } from "solid-js";
import { Volume2, VolumeX } from "lucide-solid";
import { readOpenNote } from "../a11y/voice";
import { stopSpeaking } from "../a11y/speech";
import { t } from "../i18n";
import { LANGUAGES, type LanguageCode } from "../i18n/languages";
import { resetSettings, settings, updateSettings } from "../state/settings";
import { setOverlay } from "../state/ui";
import { THEMES, type Density, type ExperienceLevel, type RadiusScale, type ThemeId } from "../state/types";
import { Modal } from "./Modal";
import { Choice, Field, GlassPreview, Toggle, changeLanguage, changeTheme } from "./controls";

export function SettingsOverlay() {
  const a = () => settings.appearance;
  return (
    <Modal title={t("footer-settings")} onClose={() => setOverlay("none")} class="modal-lg settings">
      <div class="settings-body">
        <section aria-labelledby="set-lang">
          <h3 id="set-lang" class="section-title">{t("preview-section-language")}</h3>
          <Field label={t("field-language")}>
            {(id) => (
              <select id={id} class="input" value={settings.language ?? "en"} onChange={(e) => changeLanguage(e.currentTarget.value as LanguageCode)}>
                <For each={LANGUAGES}>{(l) => <option value={l.code} lang={l.code}>{l.name}</option>}</For>
              </select>
            )}
          </Field>
          <Field label={t("field-experience")}>
            {(id) => (
              <select id={id} class="input" value={settings.experienceLevel} onChange={(e) => updateSettings((c) => { c.experienceLevel = e.currentTarget.value as ExperienceLevel; })}>
                <option value="beginner">{t("experience-beginner")}</option>
                <option value="intermediate">{t("experience-intermediate")}</option>
                <option value="advanced">{t("experience-advanced")}</option>
              </select>
            )}
          </Field>
        </section>
        <section aria-labelledby="set-look">
          <h3 id="set-look" class="section-title">{t("preview-section-appearance")}</h3>
          <Field label={t("field-theme")}>
            {(id) => (
              <select id={id} class="input" value={a().theme} onChange={(e) => changeTheme(e.currentTarget.value as ThemeId)}>
                <For each={THEMES}>{(th) => <option value={th}>{t(`theme-${th}`)}</option>}</For>
              </select>
            )}
          </Field>
          <Field label={t("field-accent")}>
            {(id) => <input id={id} type="color" class="color-input" value={a().accent} onInput={(e) => updateSettings((c) => { c.appearance.accent = e.currentTarget.value; })} />}
          </Field>
          <Field label={`${t("field-glass-blur")} (${a().glassBlur}px)`}>
            {(id) => <input id={id} type="range" min="0" max="40" step="1" value={a().glassBlur} onInput={(e) => updateSettings((c) => { c.appearance.glassBlur = Number(e.currentTarget.value); })} />}
          </Field>
          <Field label={`${t("field-glass-opacity")} (${Math.round(a().glassOpacity * 100)}%)`}>
            {(id) => <input id={id} type="range" min="0.2" max="0.95" step="0.01" value={a().glassOpacity} onInput={(e) => updateSettings((c) => { c.appearance.glassOpacity = Number(e.currentTarget.value); })} />}
          </Field>
          <GlassPreview />
          <Choice<RadiusScale> legend={t("field-radius")} value={a().radius}
            options={(["sharp", "balanced", "soft"] as const).map((v) => ({ value: v, label: t(`radius-${v}`) }))}
            onChange={(v) => updateSettings((c) => { c.appearance.radius = v; })} />
          <Choice<Density> legend={t("field-density")} value={a().density}
            options={(["compact", "comfortable"] as const).map((v) => ({ value: v, label: t(`density-${v}`) }))}
            onChange={(v) => updateSettings((c) => { c.appearance.density = v; })} />
          <Toggle label={t("field-ambient-mesh")} checked={a().ambientMesh} onChange={(v) => updateSettings((c) => { c.appearance.ambientMesh = v; })} />
        </section>
        <section aria-labelledby="set-a11y">
          <h3 id="set-a11y" class="section-title">{t("preview-section-accessibility")}</h3>
          <Toggle label={t("field-screen-reader")} hint={`${t("field-screen-reader-hint")} ${t("speech-shortcuts")}`} checked={settings.accessibility.screenReaderMode} onChange={(v) => updateSettings((c) => { c.accessibility.screenReaderMode = v; })} />
          <Show when={settings.accessibility.screenReaderMode}>
            <Field label={`${t("speech-rate")} (${settings.accessibility.speechRate.toFixed(1)}×)`}>
              {(id) => <input id={id} type="range" min="0.5" max="2" step="0.1" value={settings.accessibility.speechRate} onChange={(e) => updateSettings((c) => { c.accessibility.speechRate = Number(e.currentTarget.value); })} />}
            </Field>
            <div class="inline-actions">
              <button class="btn" onClick={() => readOpenNote()}><Volume2 aria-hidden="true" />{t("speech-read-note")}</button>
              <button class="btn" onClick={() => stopSpeaking()}><VolumeX aria-hidden="true" />{t("speech-stop")}</button>
            </div>
          </Show>
          <Toggle label={t("field-reduce-motion")} checked={settings.accessibility.reduceMotion} onChange={(v) => updateSettings((c) => { c.accessibility.reduceMotion = v; })} />
        </section>
      </div>
      <div class="dialog-actions">
        <button class="btn" onClick={() => resetSettings()}>{t("action-reset-defaults")}</button>
        <button class="btn primary" onClick={() => setOverlay("none")}>{t("action-close")}</button>
      </div>
    </Modal>
  );
}
