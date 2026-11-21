// Every setting as a searchable entry: the tab it lives on, the message keys it
// can be found by, and how to render it.
import { For, Show, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import { Image, RotateCcw, Vault as VaultIcon, Volume2, VolumeX, RefreshCw } from "lucide-solid";
import { t, type MessageKey } from "../../i18n";
import { LANGUAGES, type LanguageCode } from "../../i18n/languages";
import { readOpenNote } from "../../a11y/voice";
import { stopSpeaking } from "../../a11y/speech";
import { formatDailyName } from "../../lib/dates";
import { MODULE_MIN_LEVEL, enabledModules } from "../../state/modules";
import { settings, updateSettings } from "../../state/settings";
import { pref, setPref, type DefaultMode, type StartupScreen } from "../../state/prefs";
import { COMMANDS, comboOf, conflictFor, formatCombo, keyFor, setKey, setRecording, commandById } from "../../state/commands";
import { profile, updateProfile } from "../../state/workspace";
import { setOverlay } from "../../state/ui";
import { tree } from "../../state/vault";
import { THEMES, type Density, type ExperienceLevel, type FocusProfile, type ModuleId, type RadiusScale, type SortMode, type ThemeId } from "../../state/types";
import { Choice, Field, GlassPreview, Toggle, changeLanguage, changeTheme } from "../controls";

export type TabId =
  | "general" | "workspace" | "editor" | "files" | "appearance" | "daily" | "hotkeys"
  | "pet" | "mcp" | "modules" | "developer" | "vault" | "sync";

export interface Entry { tab: TabId; keys: MessageKey[]; render: () => JSX.Element }

const e = (tab: TabId, keys: MessageKey[], render: () => JSX.Element): Entry => ({ tab, keys, render });

function Select<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <Field label={props.label} hint={props.hint}>
      {(id) => (
        <select id={id} class="input" value={props.value} onChange={(ev) => props.onChange(ev.currentTarget.value as T)}>
          <For each={props.options}>{(o) => <option value={o.value}>{o.label}</option>}</For>
        </select>
      )}
    </Field>
  );
}

function Range(props: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <Field label={`${props.label} (${props.show(props.value)})`}>
      {(id) => <input id={id} type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(ev) => props.onChange(Number(ev.currentTarget.value))} />}
    </Field>
  );
}

function SoonCard(props: { title: string; desc?: string }) {
  return (
    <div class="soon-card">
      <strong>{props.title}</strong>
      <span class="badge">{t("coming-soon")}</span>
      <Show when={props.desc}><p class="hint">{props.desc}</p></Show>
    </div>
  );
}

// ---------- Modules ----------

const MODULE_LABEL: Record<ModuleId, MessageKey> = {
  "daily-calendar": "module-daily-calendar",
  "recent-files": "module-recent-files",
  "pdf-support": "module-pdf-support",
  "zen-focus": "ribbon-focus",
  "ambient-effects": "module-ambient-effects",
  "companion-pet": "module-companion-pet",
  dashboard: "ribbon-dashboard",
  flashcards: "ribbon-flashcards",
  "media-shelf": "ribbon-media",
  "knowledge-graph": "ribbon-graph",
  mindmap: "ribbon-mindmap",
  kanban: "ribbon-kanban",
  slides: "ribbon-slides",
  "project-mode": "ribbon-projects",
  "dependency-graph": "module-dependency-graph",
  "integrated-terminal": "ribbon-terminal",
  "mcp-bridge": "module-mcp-bridge",
  "developer-extensions": "module-developer-extensions",
  "advanced-ribbon-tools": "module-advanced-ribbon-tools",
};

function ModuleToggle(props: { id: ModuleId }) {
  const on = () => enabledModules(settings.experienceLevel, settings.moduleOverrides).has(props.id);
  return (
    <Toggle
      label={t(MODULE_LABEL[props.id])}
      hint={t(`experience-${MODULE_MIN_LEVEL[props.id]}`)}
      checked={on()}
      onChange={(v) => updateSettings((c) => {
        const byLevel = enabledModules(c.experienceLevel, {}).has(props.id);
        if (v === byLevel) delete c.moduleOverrides[props.id];
        else c.moduleOverrides[props.id] = v;
      })}
    />
  );
}

const moduleEntry = (tab: TabId, id: ModuleId) => e(tab, [MODULE_LABEL[id]], () => <ModuleToggle id={id} />);

// ---------- Hotkeys ----------

function Hotkeys() {
  const [filter, setFilter] = createSignal("");
  const [recording, setRec] = createSignal<string | null>(null);
  const [problem, setProblem] = createSignal<{ id: string; text: string } | null>(null);
  const rows = createMemo(() => {
    const q = filter().trim().toLocaleLowerCase();
    return COMMANDS.filter((c) => !q || t(c.label).toLocaleLowerCase().includes(q) || formatCombo(keyFor(c.id)).toLocaleLowerCase().includes(q));
  });
  const stop = () => { setRec(null); setRecording(false); };
  onCleanup(() => setRecording(false));
  const onKey = (id: string, ev: KeyboardEvent) => {
    if (recording() !== id) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.key === "Escape") return stop();
    if (ev.key === "Backspace" || ev.key === "Delete") {
      setKey(id, "");
      setProblem(null);
      return stop();
    }
    const combo = comboOf(ev);
    if (!combo) return;
    const other = conflictFor(combo, id);
    if (other) {
      setProblem({ id, text: t("hotkeys-conflict", { name: t(other.label) }) });
      return;
    }
    setKey(id, combo);
    setProblem(null);
    stop();
  };
  return (
    <div class="hotkeys">
      <input class="input" type="search" placeholder={t("hotkeys-filter")} aria-label={t("hotkeys-filter")} value={filter()} onInput={(ev) => setFilter(ev.currentTarget.value)} dir="auto" />
      <p class="hint">{t("hotkeys-record-hint")}</p>
      <ul class="hotkey-list">
        <For each={rows()}>
          {(c) => {
            const isCustom = () => keyFor(c.id) !== (commandById(c.id)?.defaultKey ?? "");
            return (
              <li class="hotkey-row">
                <span class="hotkey-name" id={`hk-${c.id}`}>{t(c.label)}</span>
                <button
                  class="kbd-btn"
                  classList={{ recording: recording() === c.id }}
                  aria-describedby={`hk-${c.id}`}
                  aria-label={`${t(c.label)}: ${recording() === c.id ? t("hotkeys-record") : formatCombo(keyFor(c.id)) || t("hotkey-none")}`}
                  onClick={() => { setRec(c.id); setRecording(true); setProblem(null); }}
                  onKeyDown={(ev) => onKey(c.id, ev)}
                  onBlur={() => recording() === c.id && stop()}
                >
                  {recording() === c.id ? t("hotkeys-record") : formatCombo(keyFor(c.id)) || t("hotkey-none")}
                </button>
                <button class="icon-btn" disabled={!isCustom()} title={t("hotkeys-reset")} aria-label={`${t("hotkeys-reset")}: ${t(c.label)}`} onClick={() => setKey(c.id, commandById(c.id)?.defaultKey ?? "")}>
                  <RotateCcw />
                </button>
                <Show when={problem()?.id === c.id}><p class="field-error" role="alert">{problem()!.text}</p></Show>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

// ---------- Entries ----------

export const ENTRIES: Entry[] = [
  // General
  e("general", ["field-language"], () => (
    <Field label={t("field-language")}>
      {(id) => (
        <select id={id} class="input" value={settings.language ?? "en"} onChange={(ev) => changeLanguage(ev.currentTarget.value as LanguageCode)}>
          <For each={LANGUAGES}>{(l) => <option value={l.code} lang={l.code}>{l.name}</option>}</For>
        </select>
      )}
    </Field>
  )),
  e("general", ["field-experience", "experience-beginner", "experience-intermediate", "experience-advanced"], () => (
    <Select<ExperienceLevel> label={t("field-experience")} value={settings.experienceLevel} hint={t("modules-hint")}
      options={(["beginner", "intermediate", "advanced"] as const).map((v) => ({ value: v, label: t(`experience-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.experienceLevel = v; })} />
  )),
  e("general", ["startup-screen", "startup-last", "startup-empty", "startup-daily"], () => (
    <Select<StartupScreen> label={t("startup-screen")} value={pref("startup")}
      options={(["last", "empty", "daily"] as const).map((v) => ({ value: v, label: t(`startup-${v}`) }))}
      onChange={(v) => setPref("startup", v)} />
  )),

  // Workspace
  e("workspace", ["focus-profile", "focus-clean-minimal", "focus-deep-writing", "focus-review-quiz", "focus-full-studio"], () => (
    <Choice<FocusProfile> legend={t("focus-profile")} value={profile.focusProfile}
      options={(["clean-minimal", "deep-writing", "review-quiz", "full-studio"] as const).map((v) => ({ value: v, label: t(`focus-${v}`) }))}
      onChange={(v) => applyFocusProfile(v)} />
  )),
  e("workspace", ["shell-ribbon-label"], () => <Toggle label={t("shell-ribbon-label")} checked={profile.panels.ribbon} onChange={(v) => updateProfile((p) => { p.panels.ribbon = v; })} />),
  e("workspace", ["shell-left-sidebar-label"], () => <Toggle label={t("shell-left-sidebar-label")} checked={profile.panels.left} onChange={(v) => updateProfile((p) => { p.panels.left = v; })} />),
  e("workspace", ["shell-right-sidebar-label"], () => <Toggle label={t("shell-right-sidebar-label")} checked={profile.panels.right} onChange={(v) => updateProfile((p) => { p.panels.right = v; })} />),
  e("workspace", ["shell-status-bar-label"], () => <Toggle label={t("shell-status-bar-label")} checked={profile.panels.statusBar} onChange={(v) => updateProfile((p) => { p.panels.statusBar = v; })} />),

  // Editor
  e("editor", ["editor-default-mode", "mode-editor", "mode-split", "mode-reader"], () => (
    <Select<DefaultMode> label={t("editor-default-mode")} value={pref("editorDefaultMode")}
      options={(["editor", "split", "reader"] as const).map((v) => ({ value: v, label: t(`mode-${v}`) }))}
      onChange={(v) => setPref("editorDefaultMode", v)} />
  )),
  e("editor", ["editor-font-size"], () => <Range label={t("editor-font-size")} value={pref("fontSize")} min={11} max={26} step={1} show={(v) => `${v}px`} onChange={(v) => setPref("fontSize", v)} />),
  e("editor", ["editor-line-height"], () => <Range label={t("editor-line-height")} value={pref("lineHeight")} min={1.2} max={2.4} step={0.1} show={(v) => v.toFixed(1)} onChange={(v) => setPref("lineHeight", v)} />),
  e("editor", ["editor-tab-size"], () => (
    <Select<string> label={t("editor-tab-size")} value={String(pref("tabSize"))} options={["2", "4", "8"].map((v) => ({ value: v, label: v }))} onChange={(v) => setPref("tabSize", Number(v))} />
  )),
  e("editor", ["editor-readable"], () => <Toggle label={t("editor-readable")} checked={pref("readableLine")} onChange={(v) => setPref("readableLine", v)} />),
  e("editor", ["editor-line-numbers"], () => <Toggle label={t("editor-line-numbers")} checked={pref("lineNumbers")} onChange={(v) => setPref("lineNumbers", v)} />),
  e("editor", ["editor-autopair"], () => <Toggle label={t("editor-autopair")} checked={pref("autopair")} onChange={(v) => setPref("autopair", v)} />),
  e("editor", ["editor-spellcheck"], () => <Toggle label={t("editor-spellcheck")} checked={pref("spellcheck")} onChange={(v) => setPref("spellcheck", v)} />),
  e("editor", ["editor-strict-breaks"], () => <Toggle label={t("editor-strict-breaks")} checked={pref("strictBreaks")} onChange={(v) => setPref("strictBreaks", v)} />),

  // Files and links
  e("files", ["files-new-note-folder", "files-root"], () => (
    <Select<string> label={t("files-new-note-folder")} value={pref("newNoteFolder")}
      options={[{ value: "", label: t("files-root") }, ...[...tree.folders].sort().map((f) => ({ value: f, label: f }))]}
      onChange={(v) => setPref("newNoteFolder", v)} />
  )),
  e("files", ["action-sort", "sort-name-asc", "sort-modified-new", "sort-created-new"], () => (
    <Select<SortMode> label={t("action-sort")} value={profile.sort}
      options={(["name-asc", "name-desc", "modified-new", "modified-old", "created-new", "created-old"] as const).map((v) => ({ value: v, label: t(`sort-${v}`) }))}
      onChange={(v) => updateProfile((p) => { p.sort = v; })} />
  )),
  e("files", ["files-confirm-delete"], () => <Toggle label={t("files-confirm-delete")} checked={pref("confirmDelete")} onChange={(v) => setPref("confirmDelete", v)} />),
  moduleEntry("files", "pdf-support"),
  moduleEntry("files", "recent-files"),

  // Appearance
  e("appearance", ["field-theme", ...THEMES.map((x) => `theme-${x}` as MessageKey)], () => (
    <Select<ThemeId> label={t("field-theme")} value={settings.appearance.theme} options={THEMES.map((v) => ({ value: v, label: t(`theme-${v}`) }))} onChange={changeTheme} />
  )),
  e("appearance", ["field-accent"], () => (
    <Field label={t("field-accent")}>
      {(id) => <input id={id} type="color" class="color-input" value={settings.appearance.accent} onInput={(ev) => updateSettings((c) => { c.appearance.accent = ev.currentTarget.value; })} />}
    </Field>
  )),
  e("appearance", ["field-glass-blur", "field-glass-opacity", "glass-preview-label"], () => (
    <>
      <Range label={t("field-glass-blur")} value={settings.appearance.glassBlur} min={0} max={40} step={1} show={(v) => `${v}px`} onChange={(v) => updateSettings((c) => { c.appearance.glassBlur = v; })} />
      <Range label={t("field-glass-opacity")} value={settings.appearance.glassOpacity} min={0.2} max={0.95} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings((c) => { c.appearance.glassOpacity = v; })} />
      <GlassPreview />
    </>
  )),
  e("appearance", ["field-radius", "radius-sharp", "radius-balanced", "radius-soft"], () => (
    <Choice<RadiusScale> legend={t("field-radius")} value={settings.appearance.radius}
      options={(["sharp", "balanced", "soft"] as const).map((v) => ({ value: v, label: t(`radius-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.appearance.radius = v; })} />
  )),
  e("appearance", ["field-density", "density-compact", "density-comfortable"], () => (
    <Choice<Density> legend={t("field-density")} value={settings.appearance.density}
      options={(["compact", "comfortable"] as const).map((v) => ({ value: v, label: t(`density-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.appearance.density = v; })} />
  )),
  e("appearance", ["field-ambient-mesh"], () => <Toggle label={t("field-ambient-mesh")} checked={settings.appearance.ambientMesh} onChange={(v) => updateSettings((c) => { c.appearance.ambientMesh = v; })} />),
  e("appearance", ["banner-title", "banner-toggle"], () => (
    <button class="btn" onClick={() => setOverlay("banner")}><Image aria-hidden="true" />{t("banner-title")}</button>
  )),

  // Daily notes
  moduleEntry("daily", "daily-calendar"),
  e("daily", ["daily-folder"], () => (
    <Field label={t("daily-folder")}>
      {(id) => <input id={id} class="input" value={pref("dailyFolder")} dir="auto" onChange={(ev) => setPref("dailyFolder", ev.currentTarget.value.trim())} />}
    </Field>
  )),
  e("daily", ["daily-format"], () => (
    <Field label={t("daily-format")} hint={`YYYY · MM · DD → ${formatDailyName(new Date(), pref("dailyFormat"))}.md`}>
      {(id) => <input id={id} class="input" dir="ltr" value={pref("dailyFormat")} onInput={(ev) => setPref("dailyFormat", ev.currentTarget.value)} />}
    </Field>
  )),
  e("daily", ["daily-template", "daily-template-none"], () => (
    <Select<string> label={t("daily-template")} value={pref("dailyTemplate")}
      hint="{{date}} · {{title}} · {{time}}"
      options={[{ value: "", label: t("daily-template-none") }, ...tree.notes.filter((n) => n.kind === "markdown").map((n) => ({ value: n.path, label: n.path.replace(/\.md$/i, "") }))]}
      onChange={(v) => setPref("dailyTemplate", v)} />
  )),
  e("daily", ["daily-open-startup"], () => <Toggle label={t("daily-open-startup")} checked={pref("dailyOnStartup")} onChange={(v) => setPref("dailyOnStartup", v)} />),

  // Hotkeys
  e("hotkeys", ["settings-tab-hotkeys", "hotkeys-filter", ...COMMANDS.map((c) => c.label)], () => <Hotkeys />),

  // Pet
  e("pet", ["onboarding-pet"], () => <Toggle label={t("onboarding-pet")} checked={settings.petEnabled} onChange={(v) => updateSettings((c) => { c.petEnabled = v; })} />),
  e("pet", ["module-companion-pet"], () => <SoonCard title={t("module-companion-pet")} />),

  // MCP
  moduleEntry("mcp", "mcp-bridge"),
  e("mcp", ["settings-tab-mcp"], () => <SoonCard title={t("settings-tab-mcp")} />),

  // Modules and accessibility
  e("modules", ["field-screen-reader", "field-screen-reader-hint", "speech-rate", "speech-read-note"], () => (
    <>
      <Toggle label={t("field-screen-reader")} hint={`${t("field-screen-reader-hint")} ${t("speech-shortcuts")}`} checked={settings.accessibility.screenReaderMode} onChange={(v) => updateSettings((c) => { c.accessibility.screenReaderMode = v; })} />
      <Show when={settings.accessibility.screenReaderMode}>
        <Range label={t("speech-rate")} value={settings.accessibility.speechRate} min={0.5} max={2} step={0.1} show={(v) => `${v.toFixed(1)}×`} onChange={(v) => updateSettings((c) => { c.accessibility.speechRate = v; })} />
        <div class="inline-actions">
          <button class="btn" onClick={() => readOpenNote()}><Volume2 aria-hidden="true" />{t("speech-read-note")}</button>
          <button class="btn" onClick={() => stopSpeaking()}><VolumeX aria-hidden="true" />{t("speech-stop")}</button>
        </div>
      </Show>
    </>
  )),
  e("modules", ["field-reduce-motion"], () => <Toggle label={t("field-reduce-motion")} checked={settings.accessibility.reduceMotion} onChange={(v) => updateSettings((c) => { c.accessibility.reduceMotion = v; })} />),
  e("modules", ["modules-hint"], () => <p class="hint">{t("modules-hint")}</p>),
  ...(Object.keys(MODULE_LABEL) as ModuleId[])
    .filter((id) => !["mcp-bridge", "developer-extensions", "advanced-ribbon-tools", "integrated-terminal", "daily-calendar", "pdf-support", "recent-files"].includes(id))
    .map((id) => moduleEntry("modules", id)),

  // Developer
  moduleEntry("developer", "developer-extensions"),
  moduleEntry("developer", "integrated-terminal"),
  moduleEntry("developer", "advanced-ribbon-tools"),
  e("developer", ["cmd-rebuild-index"], () => <RebuildButton />),

  // Vault and backup
  e("vault", ["vault-switcher-title"], () => <button class="btn" onClick={() => setOverlay("vaults")}><VaultIcon aria-hidden="true" />{t("vault-switcher-title")}</button>),
  e("vault", ["banner-title"], () => <button class="btn" onClick={() => setOverlay("banner")}><Image aria-hidden="true" />{t("banner-title")}</button>),
  e("vault", ["cmd-rebuild-index"], () => <RebuildButton />),

  // Device sync
  e("sync", ["settings-tab-sync", "sync-desc"], () => <SoonCard title={t("settings-tab-sync")} desc={t("sync-desc")} />),
];

function RebuildButton() {
  return (
    <button class="btn" onClick={() => void commandById("rebuild-index")?.run()}>
      <RefreshCw aria-hidden="true" />{t("cmd-rebuild-index")}
    </button>
  );
}

/** Focus profiles show or hide panels to fit the kind of work. */
export function applyFocusProfile(v: FocusProfile): void {
  updateProfile((p) => {
    p.focusProfile = v;
    const layout: Record<FocusProfile, typeof p.panels> = {
      "clean-minimal": { ribbon: false, left: false, right: false, statusBar: false },
      "deep-writing": { ribbon: false, left: true, right: false, statusBar: true },
      "review-quiz": { ribbon: true, left: false, right: true, statusBar: true },
      "full-studio": { ribbon: true, left: true, right: true, statusBar: true },
    };
    p.panels = { ...layout[v] };
  });
}

