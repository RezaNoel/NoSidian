// First-launch wizard, in the required order:
// language → experience level → personalization → vault.
import { For, Match, Show, Switch, createEffect, on } from "solid-js";
import { ArrowLeft, ArrowRight, Check } from "lucide-solid";
import { locale, t } from "../i18n";
import { LANGUAGES } from "../i18n/languages";
import { settings, updateSettings } from "../state/settings";
import { THEMES, themeIsNew, type ExperienceLevel, type UseCase } from "../state/types";
import { Choice, GlassPreview, Toggle, changeLanguage, changeTheme } from "./controls";
import { VaultPicker } from "./VaultPicker";
import { Logo } from "./Logo";

const TOTAL = 4;
const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const USE_CASES: { value: UseCase; key: "use-case-study" | "use-case-writing" | "use-case-projects" | "use-case-general" }[] = [
  { value: "study-languages", key: "use-case-study" },
  { value: "writing", key: "use-case-writing" },
  { value: "projects-coding", key: "use-case-projects" },
  { value: "general", key: "use-case-general" },
];

export function Onboarding(props: { onFinish: () => void }) {
  let heading!: HTMLHeadingElement;
  const step = () => Math.min(settings.onboarding.step, TOTAL - 1);
  const go = (n: number) => {
    if (step() === 0 && !settings.language) changeLanguage(locale());
    updateSettings((c) => { c.onboarding.step = Math.max(0, Math.min(TOTAL - 1, n)); });
  };

  // Move focus to the new step's heading so screen readers read it.
  createEffect(on(step, () => queueMicrotask(() => heading?.focus()), { defer: true }));

  const finish = () => {
    updateSettings((c) => { c.onboarding = { completed: true, step: TOTAL - 1 }; });
    props.onFinish();
  };

  const title = () =>
    [t("onboarding-language-title"), t("onboarding-experience-title"), t("onboarding-personal-title"), t("onboarding-vault-title")][step()];

  return (
    <main class="onboarding" id="main">
      <div class="onboarding-card glass-modal" role="region" aria-labelledby="ob-title">
        <div class="ob-top">
          <div class="ob-brand"><Logo size={30} />{t("app-name")}</div>
          <div class="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step() + 1} aria-label={t("onboarding-step", { current: step() + 1, total: TOTAL })}>
            <For each={Array.from({ length: TOTAL }, (_, i) => i)}>{(i) => <span classList={{ done: i < step(), current: i === step() }} />}</For>
          </div>
          <span class="ob-step">{t("onboarding-step", { current: step() + 1, total: TOTAL })}</span>
        </div>
        <h1 id="ob-title" ref={heading} tabIndex={-1}>{title()}</h1>

        <Switch>
          <Match when={step() === 0}>
            <p class="ob-hint">{t("onboarding-language-hint")}</p>
            <div class="lang-grid" role="radiogroup" aria-labelledby="ob-title">
              <For each={LANGUAGES}>
                {(l) => (
                  <button role="radio" aria-checked={locale() === l.code} class="lang-option glass-card" lang={l.code} dir={l.dir} onClick={() => changeLanguage(l.code)}>
                    <span>{l.name}</span>
                    <Show when={locale() === l.code}><Check aria-hidden="true" /></Show>
                  </button>
                )}
              </For>
            </div>
          </Match>
          <Match when={step() === 1}>
            <p class="ob-hint">{t("onboarding-experience-hint")}</p>
            <div class="level-list" role="radiogroup" aria-labelledby="ob-title">
              <For each={LEVELS}>
                {(lv) => (
                  <button role="radio" aria-checked={settings.experienceLevel === lv} class="level-option glass-card" onClick={() => updateSettings((c) => { c.experienceLevel = lv; })}>
                    <strong>{t(`experience-${lv}`)}</strong>
                    <span>{t(`experience-${lv}-desc`)}</span>
                  </button>
                )}
              </For>
            </div>
          </Match>
          <Match when={step() === 2}>
            <div class="personal">
              <Choice<UseCase> legend={t("onboarding-use-case")} value={settings.useCase}
                options={USE_CASES.map((u) => ({ value: u.value, label: t(u.key) }))}
                onChange={(v) => updateSettings((c) => { c.useCase = v; })} />
              <fieldset class="field">
                <legend>{t("field-theme")}</legend>
                <div class="theme-swatches">
                  <For each={THEMES}>
                    {(th) => (
                      <label class="swatch" data-theme={th}>
                        <input type="radio" name="ob-theme" checked={settings.appearance.theme === th} onChange={() => changeTheme(th)} />
                        <span class="swatch-preview" aria-hidden="true"><i /><i /><i /></span>
                        <span class="swatch-name">{t(`theme-${th}`)}</span>
                        <Show when={themeIsNew(th)}><span class="new-badge">{t("theme-new")}</span></Show>
                      </label>
                    )}
                  </For>
                </div>
              </fieldset>
              <div class="field">
                <label for="ob-blur">{`${t("field-glass-blur")} (${settings.appearance.glassBlur}px)`}</label>
                <input id="ob-blur" type="range" min="0" max="40" value={settings.appearance.glassBlur} onInput={(e) => updateSettings((c) => { c.appearance.glassBlur = Number(e.currentTarget.value); })} />
                <GlassPreview />
              </div>
              <Toggle label={t("onboarding-pet")} checked={settings.petEnabled} onChange={(v) => updateSettings((c) => { c.petEnabled = v; })} />
              <Toggle label={t("onboarding-ambient")} checked={settings.ambientEffectsEnabled} onChange={(v) => updateSettings((c) => { c.ambientEffectsEnabled = v; c.appearance.ambientMesh = v; })} />
              <Toggle label={t("field-screen-reader")} hint={`${t("field-screen-reader-hint")} ${t("speech-shortcuts")}`} checked={settings.accessibility.screenReaderMode} onChange={(v) => updateSettings((c) => { c.accessibility.screenReaderMode = v; })} />
            </div>
          </Match>
          <Match when={step() === 3}>
            <p class="ob-hint">{t("vault-welcome-subtitle")}</p>
            <VaultPicker onDone={finish} />
          </Match>
        </Switch>

        <div class="ob-actions">
          <Show when={step() > 0}>
            <button class="btn" onClick={() => go(step() - 1)}><ArrowLeft class="flip-rtl" aria-hidden="true" />{t("action-back")}</button>
          </Show>
          <span class="status-spacer" />
          <Show when={step() < TOTAL - 1}>
            <button class="btn primary" onClick={() => go(step() + 1)}>{t("action-next")}<ArrowRight class="flip-rtl" aria-hidden="true" /></button>
          </Show>
        </div>
      </div>
    </main>
  );
}
