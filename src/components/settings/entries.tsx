// Every setting as a searchable entry: its tab, an icon, the message keys and
// extra English words it can be found by, and how to render it. Settings are
// rows: icon and label at the start, the control at the end.
import { DatePicker } from "../DatePicker";
import { FontPicker } from "./FontPicker";
import { For, Index, Show, type JSX } from "solid-js";
import {
  AlignJustify, ArrowDownUp, Blocks, BookOpenCheck, Brush, CalendarDays, CaseSensitive, Columns2, Contrast, Droplets,
  Eye, FileClock, FilePlus, FileText, FolderOpen, Gauge, Hand, Image, Keyboard, Languages, LayoutPanelLeft, ListOrdered,
  MessageSquareText, Monitor, Music2, Palette, PanelTop, PartyPopper, Play, Plus, Rocket, RotateCcw, Ruler, ScanEye,
  Sparkles, SpellCheck, SquareRadical, Trash2, User, Vault as VaultIcon, Volume2, VolumeX, RefreshCw, Brackets, Type, Cake,
  ListChecks, Paperclip, Film, Link2, Users, Network,
} from "lucide-solid";
import { t, type MessageKey } from "../../i18n";
import { LANGUAGES, type LanguageCode } from "../../i18n/languages";
import { readOpenNote } from "../../a11y/voice";
import { stopSpeaking } from "../../a11y/speech";
import { formatDailyName } from "../../lib/dates";
import { MODULE_MIN_LEVEL, enabledModules } from "../../state/modules";
import { settings, updateSettings } from "../../state/settings";
import { setupPara } from "../../state/pkm";
import { pref, setPref, type DefaultMode, type StartupScreen } from "../../state/prefs";
import { commandById } from "../../state/commands";
import { profile, updateProfile } from "../../state/workspace";
import { setOverlay } from "../../state/ui";
import { tree } from "../../state/vault";
import { personal } from "../../state/personal";
import { THEMES, themeIsNew, type Density, type ExperienceLevel, type FocusProfile, type ModuleId, type RadiusScale, type ThemeId } from "../../state/types";
import { Toggle, changeLanguage, changeTheme } from "../controls";
import { CssSettings, McpSettings, PetSettings, PluginSettings, PrefToggle, ShellSettings, VaultTools } from "./advanced";
import { Hotkeys } from "./hotkeys";
import { CalendarSettings } from "./calendar";

export type TabId =
  | "you" | "appearance" | "editor" | "files" | "features" | "calendar" | "companion"
  | "hotkeys" | "ai" | "advanced" | "access" | "vault";

type Icon = typeof User;
export interface Entry { tab: TabId; icon?: Icon; keys: MessageKey[]; tags?: string; wide?: boolean; render: () => JSX.Element }

const e = (tab: TabId, icon: Icon | undefined, keys: MessageKey[], render: () => JSX.Element, extra: { tags?: string; wide?: boolean } = {}): Entry =>
  ({ tab, icon, keys, render, ...extra });

// ---------- Row building blocks ----------

let rowId = 0;
/** Label at the start, control at the end. */
function Row(props: { label: string; hint?: string; children: (id: string) => JSX.Element }) {
  const id = `set-${++rowId}`;
  return (
    <div class="set-row">
      <label class="set-label" for={id}>
        <span>{props.label}</span>
        <Show when={props.hint}><small>{props.hint}</small></Show>
      </label>
      <div class="set-control">{props.children(id)}</div>
    </div>
  );
}

function Select<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <Row label={props.label} hint={props.hint}>
      {(id) => (
        <select id={id} class="select" value={props.value} onChange={(ev) => props.onChange(ev.currentTarget.value as T)}>
          <For each={props.options}>{(o) => <option value={o.value}>{o.label}</option>}</For>
        </select>
      )}
    </Row>
  );
}

function Range(props: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <Row label={props.label}>
      {(id) => (
        <div class="set-range">
          <input id={id} type="range" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(ev) => props.onChange(Number(ev.currentTarget.value))} />
          <output for={id}>{props.show(props.value)}</output>
        </div>
      )}
    </Row>
  );
}

/** Icon buttons for a small set of choices. */
function Segmented<T extends string>(props: { label: string; value: T; options: { value: T; label: string; icon?: Icon }[]; onChange: (v: T) => void }) {
  return (
    <div class="set-row">
      <span class="set-label" id={`seg-${props.label}`}><span>{props.label}</span></span>
      <div class="set-control">
        <div class="segmented" role="radiogroup" aria-labelledby={`seg-${props.label}`}>
          <For each={props.options}>
            {(o) => (
              <button role="radio" aria-checked={props.value === o.value} title={o.label} onClick={() => props.onChange(o.value)}>
                <Show when={o.icon}>{(() => { const I = o.icon!; return <I aria-hidden="true" />; })()}</Show>
                <span class="seg-label">{o.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>
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
  people: "ribbon-people",
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

const moduleOn = (id: ModuleId) => enabledModules(settings.experienceLevel, settings.moduleOverrides).has(id);
const setModule = (id: ModuleId, v: boolean) => updateSettings((c) => {
  const byLevel = enabledModules(c.experienceLevel, {}).has(id);
  if (v === byLevel) delete c.moduleOverrides[id];
  else c.moduleOverrides[id] = v;
});

function ModuleToggle(props: { id: ModuleId }) {
  return <Toggle label={t(MODULE_LABEL[props.id])} checked={moduleOn(props.id)} onChange={(v) => setModule(props.id, v)} />;
}

/** All optional features as a grid of switch tiles. */
function ModuleGrid() {
  const ids = (Object.keys(MODULE_LABEL) as ModuleId[]).filter((id) => id !== "advanced-ribbon-tools");
  return (
    <div class="module-grid" role="group" aria-label={t("stab-features")}>
      <For each={ids}>
        {(id) => (
          <label class="module-tile" classList={{ on: moduleOn(id) }} title={t(`experience-${MODULE_MIN_LEVEL[id]}`)}>
            <input type="checkbox" role="switch" checked={moduleOn(id)} onChange={(ev) => setModule(id, ev.currentTarget.checked)} />
            <span>{t(MODULE_LABEL[id])}</span>
          </label>
        )}
      </For>
    </div>
  );
}

/** Folder choices for a setting: the vault's folders plus the current value (even before it exists). */
function folderOptions(current: string, withRoot = true): { value: string; label: string }[] {
  const folders = new Set([...tree.folders]);
  if (current) folders.add(current);
  return [...(withRoot ? [{ value: "", label: t("files-root") }] : []), ...[...folders].sort().map((f) => ({ value: f, label: f }))];
}

// ---------- Appearance ----------

export const ACCENTS = ["#3b7ddd", "#1f9e8a", "#3f9b4f", "#c98a1c", "#d9566b", "#7c5cdb", "#64748b"];

const THEME_SWATCH: Record<ThemeId, [string, string, string]> = {
  "obsidian-slate": ["#0f1219", "#202534", "#eef0f6"],
  "midnight-carbon": ["#06070b", "#141722", "#f5f6fa"],
  "nord-arctic": ["#1f2530", "#384153", "#eceff4"],
  "catppuccin-mocha": ["#151522", "#2b2c44", "#cdd6f4"],
  "paper-daylight": ["#edf1f8", "#ffffff", "#141720"],
  "warm-parchment": ["#f2ead8", "#fcf7ec", "#31261b"],
  christmas: ["#0c1d15", "#b3122e", "#f6f0e4"],
  matrix: ["#020803", "#0b3a14", "#00ff41"],
};

function ThemePicker() {
  return (
    <div class="theme-grid" role="radiogroup" aria-label={t("field-theme")}>
      <For each={THEMES}>
        {(id) => (
          <button role="radio" aria-checked={settings.appearance.theme === id} class="theme-tile" onClick={() => changeTheme(id)}>
            <span class="theme-swatch" style={{ background: THEME_SWATCH[id][0] }} aria-hidden="true">
              <span style={{ background: THEME_SWATCH[id][1] }} />
              <span style={{ background: settings.appearance.accent }} />
              <i style={{ background: THEME_SWATCH[id][2] }} />
            </span>
            <span class="theme-name">{t(`theme-${id}`)}</span>
            <Show when={themeIsNew(id)}><span class="new-badge">{t("theme-new")}</span></Show>
          </button>
        )}
      </For>
    </div>
  );
}

function AccentPicker() {
  return (
    <div class="set-row">
      <span class="set-label"><span>{t("field-accent")}</span></span>
      <div class="set-control accent-row" role="radiogroup" aria-label={t("field-accent")}>
        <For each={ACCENTS}>
          {(c) => (
            <button role="radio" class="accent-dot" aria-checked={settings.appearance.accent.toLowerCase() === c} aria-label={c} title={c}
              style={{ background: c }} onClick={() => updateSettings((x) => { x.appearance.accent = c; })} />
          )}
        </For>
        <label class="accent-dot custom" title={t("accent-custom")}>
          <input type="color" aria-label={t("accent-custom")} value={settings.appearance.accent} onInput={(ev) => updateSettings((c) => { c.appearance.accent = ev.currentTarget.value; })} />
          <Plus aria-hidden="true" />
        </label>
      </div>
    </div>
  );
}

// ---------- You ----------

function ImportantDates() {
  const add = () => personal.update((p) => { p.dates.push({ id: `d${Date.now().toString(36)}`, label: "", date: "" }); });
  return (
    <div class="set-block">
      <div class="set-block-head">
        <PartyPopper aria-hidden="true" /><span>{t("personal-dates")}</span>
        <button class="icon-btn sm" title={t("personal-date-add")} aria-label={t("personal-date-add")} onClick={add}><Plus /></button>
      </div>
      <ul class="dates-list">
        <Index each={personal.state.dates}>
          {(d, i) => (
            <li>
              <input class="input sm" dir="auto" placeholder={t("personal-date-label")} aria-label={t("personal-date-label")} value={d().label}
                onChange={(ev) => { const v = ev.currentTarget.value; personal.update((p) => { p.dates[i].label = v; }); }} />
              <DatePicker size="sm" noYear label={t("personal-date-when")} value={d().date.length === 5 ? `2000-${d().date}` : d().date}
                onChange={(v) => { if (v) personal.update((p) => { p.dates[i].date = v.slice(5); }); }} />
              <button class="icon-btn sm" title={t("action-delete")} aria-label={t("action-delete")} onClick={() => personal.update((p) => { p.dates.splice(i, 1); })}><Trash2 /></button>
            </li>
          )}
        </Index>
      </ul>
    </div>
  );
}

function playStartSound() {
  const a = new Audio("sounds/startup.wav");
  a.volume = 0.7;
  void a.play().catch(() => undefined);
}

// ---------- Entries ----------

export const ENTRIES: Entry[] = [
  // You
  e("you", User, ["personal-name"], () => (
    <Row label={t("personal-name")}>
      {(id) => <input id={id} class="input" dir="auto" autocomplete="given-name" value={personal.state.name} onChange={(ev) => { const v = ev.currentTarget.value.trim(); personal.update((p) => { p.name = v; }); }} />}
    </Row>
  ), { tags: "name nickname greeting profile me" }),
  e("you", Cake, ["personal-birthday"], () => (
    <Row label={t("personal-birthday")}>
      {(id) => <DatePicker id={id} value={personal.state.birthday} onChange={(v) => personal.update((p) => { p.birthday = v; })} clearable />}
    </Row>
  ), { tags: "birthday born age date of birth" }),
  e("you", PartyPopper, ["personal-dates", "personal-date-add"], () => <ImportantDates />, { tags: "anniversary event countdown reminder", wide: true }),
  e("you", Languages, ["field-language"], () => (
    <Row label={t("field-language")}>
      {(id) => (
        <select id={id} class="select" value={settings.language ?? "en"} onChange={(ev) => changeLanguage(ev.currentTarget.value as LanguageCode)}>
          <For each={LANGUAGES}>{(l) => <option value={l.code} lang={l.code}>{l.name}</option>}</For>
        </select>
      )}
    </Row>
  ), { tags: "language locale persian farsi english translate rtl" }),
  e("you", Rocket, ["startup-screen", "startup-last", "startup-empty", "startup-daily", "startup-dashboard"], () => (
    <Select<StartupScreen> label={t("startup-screen")} value={pref("startup")}
      options={(["last", "empty", "daily", "dashboard"] as const).map((v) => ({ value: v, label: t(`startup-${v}`) }))}
      onChange={(v) => setPref("startup", v)} />
  ), { tags: "open launch start begin home" }),
  e("you", Music2, ["personal-startup-sound"], () => (
    <div class="set-row">
      <Toggle label={t("personal-startup-sound")} checked={personal.state.startupSound} onChange={(v) => personal.update((p) => { p.startupSound = v; })} />
      <button class="icon-btn" title={t("personal-sound-test")} aria-label={t("personal-sound-test")} onClick={playStartSound}><Play /></button>
    </div>
  ), { tags: "sound chime audio welcome launch" }),
  e("you", MessageSquareText, ["personal-greet"], () => (
    <Toggle label={t("personal-greet")} checked={personal.state.greet} onChange={(v) => personal.update((p) => { p.greet = v; })} />
  ), { tags: "welcome hello greeting message" }),
  e("you", Volume2, ["pref-ui-sounds"], () => <PrefToggle k="uiSounds" label={t("pref-ui-sounds")} />, { tags: "sound click effect button audio feedback" }),

  // Appearance
  e("appearance", undefined, ["field-theme", ...THEMES.map((x) => `theme-${x}` as MessageKey)], () => <ThemePicker />, { tags: "dark light color colour mode night", wide: true }),
  e("appearance", Palette, ["field-accent", "accent-custom"], () => <AccentPicker />, { tags: "color colour highlight tint brand" }),
  e("appearance", Type, ["field-ui-font", "font-search", "font-load-system"], () => (
    <Row label={t("field-ui-font")}>{() => <FontPicker label={t("field-ui-font")} value={settings.appearance.uiFont} onChange={(v) => updateSettings((c) => { c.appearance.uiFont = v; })} />}</Row>
  ), { tags: "font typeface family typography face system google", wide: true }),
  e("appearance", Type, ["field-ui-font-size"], () => (
    <Range label={t("field-ui-font-size")} value={settings.appearance.uiFontSize ?? 16} min={12} max={20} step={1} show={(v) => `${v}px`} onChange={(v) => updateSettings((c) => { c.appearance.uiFontSize = v; })} />
  ), { tags: "text size bigger smaller menus interface" }),
  e("appearance", Droplets, ["field-glass-blur"], () => (
    <Range label={t("field-glass-blur")} value={settings.appearance.glassBlur} min={0} max={40} step={1} show={(v) => `${v}px`} onChange={(v) => updateSettings((c) => { c.appearance.glassBlur = v; })} />
  ), { tags: "glass frosted blur transparency" }),
  e("appearance", Contrast, ["field-glass-opacity"], () => (
    <Range label={t("field-glass-opacity")} value={settings.appearance.glassOpacity} min={0.2} max={0.95} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateSettings((c) => { c.appearance.glassOpacity = v; })} />
  ), { tags: "glass transparency opacity see through" }),
  e("appearance", undefined, ["field-radius", "radius-sharp", "radius-balanced", "radius-soft"], () => (
    <Segmented<RadiusScale> label={t("field-radius")} value={settings.appearance.radius}
      options={(["sharp", "balanced", "soft"] as const).map((v) => ({ value: v, label: t(`radius-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.appearance.radius = v; })} />
  ), { tags: "corners round rounded square" }),
  e("appearance", undefined, ["field-density", "density-compact", "density-comfortable"], () => (
    <Segmented<Density> label={t("field-density")} value={settings.appearance.density}
      options={(["compact", "comfortable"] as const).map((v) => ({ value: v, label: t(`density-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.appearance.density = v; })} />
  ), { tags: "size spacing compact small big font" }),
  e("appearance", undefined, ["focus-profile", "focus-clean-minimal", "focus-deep-writing", "focus-review-quiz", "focus-full-studio"], () => (
    <Segmented<FocusProfile> label={t("focus-profile")} value={profile.focusProfile}
      options={(["clean-minimal", "deep-writing", "review-quiz", "full-studio"] as const).map((v) => ({ value: v, label: t(`focus-${v}`) }))}
      onChange={(v) => applyFocusProfile(v)} />
  ), { tags: "layout panels sidebars workspace minimal" }),
  e("appearance", Sparkles, ["field-ambient-mesh"], () => <Toggle label={t("field-ambient-mesh")} checked={settings.appearance.ambientMesh} onChange={(v) => updateSettings((c) => { c.appearance.ambientMesh = v; })} />, { tags: "background glow animation" }),
  e("appearance", PanelTop, ["shell-status-bar-label"], () => <Toggle label={t("shell-status-bar-label")} checked={profile.panels.statusBar} onChange={(v) => updateProfile((p) => { p.panels.statusBar = v; })} />, { tags: "footer bottom bar words count" }),
  e("appearance", Image, ["banner-title"], () => (
    <div class="set-row"><span class="set-label"><span>{t("banner-title")}</span></span><button class="btn sm" onClick={() => setOverlay("banner")}>{t("banner-edit")}</button></div>
  ), { tags: "cover header picture image vault banner" }),

  // Editor
  e("editor", undefined, ["editor-default-mode", "mode-editor", "mode-split", "mode-reader"], () => (
    <Segmented<DefaultMode> label={t("editor-default-mode")} value={pref("editorDefaultMode")}
      options={([["editor", FileText], ["split", Columns2], ["reader", BookOpenCheck]] as const).map(([v, icon]) => ({ value: v, label: t(`mode-${v}`), icon }))}
      onChange={(v) => setPref("editorDefaultMode", v)} />
  ), { tags: "view preview read edit split open" }),
  e("editor", Type, ["editor-typeface", "font-app-default", "font-search"], () => (
    <Row label={t("editor-typeface")}>{() => <FontPicker label={t("editor-typeface")} allowDefault value={pref("editorFont")} onChange={(v) => setPref("editorFont", v)} />}</Row>
  ), { tags: "font typeface family typography face writing", wide: true }),
  e("editor", Type, ["editor-font-size"], () => <Range label={t("editor-font-size")} value={pref("fontSize")} min={11} max={26} step={1} show={(v) => `${v}px`} onChange={(v) => setPref("fontSize", v)} />, { tags: "text size bigger smaller zoom" }),
  e("editor", AlignJustify, ["editor-line-height"], () => <Range label={t("editor-line-height")} value={pref("lineHeight")} min={1.2} max={2.4} step={0.1} show={(v) => v.toFixed(1)} onChange={(v) => setPref("lineHeight", v)} />, { tags: "spacing leading lines" }),
  e("editor", Ruler, ["editor-readable"], () => <Toggle label={t("editor-readable")} checked={pref("readableLine")} onChange={(v) => setPref("readableLine", v)} />, { tags: "width narrow column wide" }),
  e("editor", ListOrdered, ["editor-line-numbers"], () => <Toggle label={t("editor-line-numbers")} checked={pref("lineNumbers")} onChange={(v) => setPref("lineNumbers", v)} />, { tags: "gutter numbers" }),
  e("editor", Link2, ["pref-link-style", "link-style-name", "link-style-card"], () => (
    <Select<"name" | "card"> label={t("pref-link-style")} value={pref("linkStyle")}
      options={[{ value: "name", label: t("link-style-name") }, { value: "card", label: t("link-style-card") }]}
      onChange={(v) => setPref("linkStyle", v)} />
  ), { tags: "link wikilink preview card embed note title" }),
  e("editor", CaseSensitive, ["pref-format-bar"], () => <PrefToggle k="formatBar" label={t("pref-format-bar")} />, { tags: "toolbar bold italic buttons formatting" }),
  e("editor", Brackets, ["pref-show-properties"], () => <PrefToggle k="showProperties" label={t("pref-show-properties")} />, { tags: "frontmatter yaml metadata properties" }),
  e("editor", Eye, ["pref-props-reader"], () => <PrefToggle k="propsInReader" label={t("pref-props-reader")} />, { tags: "frontmatter metadata reader preview" }),
  e("editor", ArrowDownUp, ["pref-scroll-sync"], () => <PrefToggle k="scrollSync" label={t("pref-scroll-sync")} />, { tags: "scroll sync split preview" }),
  e("editor", LayoutPanelLeft, ["pref-fold-headings"], () => <PrefToggle k="foldHeadings" label={t("pref-fold-headings")} />, { tags: "collapse fold headings sections" }),
  e("editor", Brackets, ["editor-autopair", "pref-autopair-md"], () => (
    <>
      <Toggle label={t("editor-autopair")} checked={pref("autopair")} onChange={(v) => setPref("autopair", v)} />
      <PrefToggle k="autopairMarkdown" label={t("pref-autopair-md")} />
    </>
  ), { tags: "brackets quotes close pair wrap" }),
  e("editor", SpellCheck, ["editor-spellcheck"], () => <Toggle label={t("editor-spellcheck")} checked={pref("spellcheck")} onChange={(v) => setPref("spellcheck", v)} />, { tags: "spelling typo check" }),
  e("editor", SquareRadical, ["editor-strict-breaks"], () => <Toggle label={t("editor-strict-breaks")} checked={pref("strictBreaks")} onChange={(v) => setPref("strictBreaks", v)} />, { tags: "line break newline markdown" }),
  e("editor", Keyboard, ["editor-tab-size"], () => (
    <Select<string> label={t("editor-tab-size")} value={String(pref("tabSize"))} options={["2", "4", "8"].map((v) => ({ value: v, label: v }))} onChange={(v) => setPref("tabSize", Number(v))} />
  ), { tags: "indent spaces tab" }),

  // Files and daily notes
  e("files", FilePlus, ["files-new-note-folder", "files-root"], () => (
    <Select<string> label={t("files-new-note-folder")} value={pref("newNoteFolder")}
      options={[{ value: "", label: t("files-root") }, ...[...tree.folders].sort().map((f) => ({ value: f, label: f }))]}
      onChange={(v) => setPref("newNoteFolder", v)} />
  ), { tags: "folder location new note where" }),
  e("files", Paperclip, ["pref-attachment-folder", "pref-attachment-mode", "attach-copy", "attach-move", "attach-link"], () => (
    <>
      <Select<string> label={t("pref-attachment-folder")} value={pref("attachmentFolder")} options={folderOptions(pref("attachmentFolder"))} onChange={(v) => setPref("attachmentFolder", v)} />
      <Select<"copy" | "move" | "link"> label={t("pref-attachment-mode")} value={pref("attachmentMode")}
        options={[{ value: "copy", label: t("attach-copy") }, { value: "move", label: t("attach-move") }, { value: "link", label: t("attach-link") }]}
        onChange={(v) => setPref("attachmentMode", v)} />
    </>
  ), { tags: "image picture attachment paste drop folder copy move link assets" }),
  e("files", Film, ["pref-media-books-folder", "pref-media-movies-folder"], () => (
    <>
      <Select<string> label={t("pref-media-books-folder")} value={pref("mediaBooksFolder")} options={folderOptions(pref("mediaBooksFolder"), false)} onChange={(v) => setPref("mediaBooksFolder", v)} />
      <Select<string> label={t("pref-media-movies-folder")} value={pref("mediaMoviesFolder")} options={folderOptions(pref("mediaMoviesFolder"), false)} onChange={(v) => setPref("mediaMoviesFolder", v)} />
    </>
  ), { tags: "books movies films series cinema shelf folder" }),
  e("files", Users, ["pref-people-folder"], () => (
    <Select<string> label={t("pref-people-folder")} value={pref("peopleFolder")} options={folderOptions(pref("peopleFolder"), false)} onChange={(v) => setPref("peopleFolder", v)} />
  ), { tags: "people persons contacts network friends folder" }),
  e("files", Network, ["pref-pkm-method", "pref-pkm-method-hint"], () => (
    <>
      <Select<"none" | "para" | "zettel"> label={t("pref-pkm-method")} hint={t("pref-pkm-method-hint")} value={pref("pkmMethod")}
        options={[{ value: "none", label: t("pkm-none") }, { value: "para", label: t("pkm-para") }, { value: "zettel", label: t("pkm-zettel") }]}
        onChange={(v) => { setPref("pkmMethod", v); if (v === "para") void setupPara(); }} />
      <Show when={pref("pkmMethod") === "zettel"}>
        <Select<string> label={t("pref-zettel-folder")} value={pref("zettelFolder")} options={folderOptions(pref("zettelFolder"), false)} onChange={(v) => setPref("zettelFolder", v)} />
      </Show>
    </>
  ), { tags: "para zettelkasten projects areas resources archive method organize pkm" }),
  e("files", Trash2, ["files-confirm-delete"], () => <Toggle label={t("files-confirm-delete")} checked={pref("confirmDelete")} onChange={(v) => setPref("confirmDelete", v)} />, { tags: "delete trash remove confirm ask" }),
  e("files", FileClock, ["pref-history-auto"], () => <PrefToggle k="historyAuto" label={t("pref-history-auto")} />, { tags: "history versions snapshots backup undo" }),
  e("files", CalendarDays, ["daily-folder"], () => (
    <Row label={t("daily-folder")}>{(id) => <input id={id} class="input" value={pref("dailyFolder")} dir="auto" onChange={(ev) => setPref("dailyFolder", ev.currentTarget.value.trim())} />}</Row>
  ), { tags: "daily journal diary folder" }),
  e("files", CalendarDays, ["daily-format"], () => (
    <Row label={t("daily-format")} hint={`${formatDailyName(new Date(), pref("dailyFormat"))}.md`}>
      {(id) => <input id={id} class="input" dir="ltr" value={pref("dailyFormat")} onInput={(ev) => setPref("dailyFormat", ev.currentTarget.value)} />}
    </Row>
  ), { tags: "daily date format name journal" }),
  e("files", FileText, ["daily-template", "daily-template-none"], () => (
    <Select<string> label={t("daily-template")} value={pref("dailyTemplate")}
      options={[{ value: "", label: t("daily-template-none") }, ...tree.notes.filter((n) => n.kind === "markdown").map((n) => ({ value: n.path, label: n.path.replace(/\.md$/i, "") }))]}
      onChange={(v) => setPref("dailyTemplate", v)} />
  ), { tags: "daily template journal" }),
  e("files", Rocket, ["daily-open-startup"], () => <Toggle label={t("daily-open-startup")} checked={pref("dailyOnStartup")} onChange={(v) => setPref("dailyOnStartup", v)} />, { tags: "daily open start launch" }),
  e("files", ListChecks, ["daily-tasks", "daily-tasks-help"], () => <Toggle label={t("daily-tasks")} hint={t("daily-tasks-help")} checked={pref("dailyTasks")} onChange={(v) => setPref("dailyTasks", v)} />, { tags: "daily tasks todo google calendar agenda" }),

  // Features
  e("features", Gauge, ["field-experience", "experience-beginner", "experience-intermediate", "experience-advanced"], () => (
    <Segmented<ExperienceLevel> label={t("field-experience")} value={settings.experienceLevel}
      options={(["beginner", "intermediate", "advanced"] as const).map((v) => ({ value: v, label: t(`experience-${v}`) }))}
      onChange={(v) => updateSettings((c) => { c.experienceLevel = v; })} />
  ), { tags: "level beginner advanced simple power user" }),
  e("features", Blocks, (Object.values(MODULE_LABEL) as MessageKey[]), () => <ModuleGrid />, { tags: "modules features enable disable turn on off tools", wide: true }),

  // Calendar
  e("calendar", CalendarDays, ["cal-show", "cal-google"], () => <CalendarSettings />, { tags: "calendar google events tasks markers sync", wide: true }),

  // Companion
  e("companion", undefined, ["onboarding-pet", "pet-open", "pet-floating", "pet-model-upload", "pet-model-title"], () => <PetSettings />, { tags: "pet companion animal model upload 3d", wide: true }),

  // Hotkeys
  e("hotkeys", undefined, ["settings-tab-hotkeys", "hotkeys-filter"], () => <Hotkeys />, { tags: "shortcuts keyboard keys bindings", wide: true }),

  // AI (MCP)
  e("ai", undefined, ["settings-tab-mcp", "mcp-enable", "mcp-access", "mcp-port", "mcp-copy-token"], () => (
    <>
      <ModuleToggle id="mcp-bridge" />
      <McpSettings />
    </>
  ), { tags: "ai claude chatgpt cursor assistant mcp bridge connect llm", wide: true }),

  // Advanced
  e("advanced", undefined, ["ribbon-terminal", "dev-system-shell"], () => (
    <>
      <ModuleToggle id="integrated-terminal" />
      <ShellSettings />
    </>
  ), { tags: "terminal shell command line console powershell" }),
  e("advanced", Brush, ["dev-css", "dev-css-enable"], () => <CssSettings />, { tags: "css style custom theme snippet", wide: true }),
  e("advanced", Blocks, ["dev-plugins", "dev-plugin-add"], () => <PluginSettings />, { tags: "plugins javascript scripts extensions", wide: true }),

  // Accessibility
  e("access", ScanEye, ["field-screen-reader", "speech-rate", "speech-read-note"], () => (
    <>
      <Toggle label={t("field-screen-reader")} checked={settings.accessibility.screenReaderMode} onChange={(v) => updateSettings((c) => { c.accessibility.screenReaderMode = v; })} />
      <Show when={settings.accessibility.screenReaderMode}>
        <Range label={t("speech-rate")} value={settings.accessibility.speechRate} min={0.5} max={2} step={0.1} show={(v) => `${v.toFixed(1)}×`} onChange={(v) => updateSettings((c) => { c.accessibility.speechRate = v; })} />
        <div class="set-row">
          <span class="set-label"><span>{t("speech-read-note")}</span></span>
          <div class="set-control row">
            <button class="icon-btn" title={t("speech-read-note")} aria-label={t("speech-read-note")} onClick={() => readOpenNote()}><Volume2 /></button>
            <button class="icon-btn" title={t("speech-stop")} aria-label={t("speech-stop")} onClick={() => stopSpeaking()}><VolumeX /></button>
          </div>
        </div>
      </Show>
    </>
  ), { tags: "blind screen reader voice speak read aloud tts accessibility" }),
  e("access", Hand, ["field-reduce-motion"], () => <Toggle label={t("field-reduce-motion")} checked={settings.accessibility.reduceMotion} onChange={(v) => updateSettings((c) => { c.accessibility.reduceMotion = v; })} />, { tags: "animation motion movement calm" }),

  // Vault
  e("vault", VaultIcon, ["vault-switcher-title"], () => (
    <div class="set-row"><span class="set-label"><span>{t("vault-switcher-title")}</span></span><button class="btn sm" onClick={() => setOverlay("vaults")}><FolderOpen />{t("vault-switch-open")}</button></div>
  ), { tags: "vault folder switch open change" }),
  e("vault", undefined, ["import-files", "export-backup", "export-standalone"], () => <VaultTools />, { tags: "backup export import zip html", wide: true }),
  e("vault", RefreshCw, ["cmd-rebuild-index"], () => (
    <div class="set-row"><span class="set-label"><span>{t("cmd-rebuild-index")}</span></span><button class="icon-btn" title={t("cmd-rebuild-index")} aria-label={t("cmd-rebuild-index")} onClick={() => void commandById("rebuild-index")?.run()}><RefreshCw /></button></div>
  ), { tags: "index search rebuild refresh fix" }),
  e("vault", Monitor, ["settings-rerun-onboarding"], () => (
    <div class="set-row"><span class="set-label"><span>{t("settings-rerun-onboarding")}</span></span><button class="icon-btn" title={t("settings-rerun-onboarding")} aria-label={t("settings-rerun-onboarding")} onClick={rerunOnboarding}><RotateCcw /></button></div>
  ), { tags: "setup wizard onboarding start over" }),
];

/** Reset onboarding and reload into the wizard (vaults and notes stay). */
function rerunOnboarding(): void {
  updateSettings((c) => { c.onboarding = { completed: false, step: 0 }; });
  // Settings save after a short debounce; reload once it has been written.
  setTimeout(() => location.reload(), 600);
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
