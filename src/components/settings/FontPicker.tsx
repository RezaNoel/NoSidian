// Font chooser: one searchable list of the fonts that ship with NoSidian and
// the fonts installed on this computer. Every name is shown in its own face.
import { For, Show, createMemo, createSignal } from "solid-js";
import { ChevronDown } from "lucide-solid";
import { t } from "../../i18n";
import { GOOGLE_FONTS_CATALOG, bundledFontOptions, fontFamilyOf, normalizeFontValue, querySystemFonts, type FontOption } from "../../core/fonts";

const faceOf = (family: string) => `'${family.replace(/['\\]/g, "")}', var(--font-ui)`;

export function FontPicker(props: {
  label: string;
  value: string;
  /** Offer "" as the default choice (the editor follows the interface font). */
  allowDefault?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [system, setSystem] = createSignal<string[] | null>(null);
  const [loading, setLoading] = createSignal(false);
  const bundled = bundledFontOptions();
  const bundledNames = new Set(GOOGLE_FONTS_CATALOG.map((f) => f.family.toLowerCase()));
  const systemOpts = createMemo<FontOption[]>(() => (system() ?? [])
    .filter((f) => !bundledNames.has(f.toLowerCase()))
    .map((f) => ({ value: `sys:${f}`, family: f, category: "system", sample: "", source: "system" })));
  const q = () => query().trim().toLowerCase();
  const match = (o: FontOption) => !q() || o.family.toLowerCase().includes(q()) || o.sample.toLowerCase().includes(q());
  const bundledShown = createMemo(() => bundled.filter(match));
  const systemShown = createMemo(() => systemOpts().filter(match));
  const current = () => (props.value === "" && props.allowDefault ? "" : normalizeFontValue(props.value));
  const shownName = () => (current() === "" ? t("font-app-default") : fontFamilyOf(current()));
  const shownFace = () => (current() === "" ? "var(--font-ui)" : faceOf(fontFamilyOf(current())));

  const pick = (v: string) => { props.onChange(v); setOpen(false); setQuery(""); };
  const loadSystem = async () => {
    setLoading(true);
    const r = await querySystemFonts();
    setSystem(r.families);
    setLoading(false);
  };
  const firstMatch = () => (bundledShown()[0] ?? systemShown()[0]);

  const row = (o: FontOption) => (
    <button type="button" role="option" class="font-opt" classList={{ sel: normalizeFontValue(props.value) === o.value }}
      aria-selected={normalizeFontValue(props.value) === o.value} onClick={() => pick(o.value)}>
      <span class="font-opt-name" style={{ "font-family": faceOf(o.family) }}>{o.family}</span>
      <Show when={o.sample}><span class="font-opt-sample" style={{ "font-family": faceOf(o.family) }}>{o.sample}</span></Show>
    </button>
  );

  return (
    <div class="font-picker">
      <button type="button" class="input font-current" aria-label={`${props.label}: ${shownName()}`} aria-expanded={open()} aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}>
        <span class="font-current-name" style={{ "font-family": shownFace() }}>{shownName()}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <Show when={open()}>
        <div class="font-panel glass-soft">
          <input class="input sm" type="search" dir="auto" value={query()} placeholder={t("font-search")} aria-label={t("font-search")}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); const f = firstMatch(); if (f) pick(f.value); else if (props.allowDefault && !q()) pick(""); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
            }} />
          <div class="font-list" role="listbox" aria-label={props.label}>
            <Show when={props.allowDefault && !q()}>
              <button type="button" role="option" class="font-opt" classList={{ sel: props.value === "" }} aria-selected={props.value === ""} onClick={() => pick("")}>
                <span class="font-opt-name">{t("font-app-default")}</span>
              </button>
            </Show>
            <Show when={bundledShown().length}>
              <p class="font-group">{t("font-group-bundled")}</p>
              <For each={bundledShown()}>{row}</For>
            </Show>
            <Show when={system() !== null}>
              <Show when={systemShown().length}>
                <p class="font-group">{t("font-group-system")}</p>
                <For each={systemShown()}>{row}</For>
              </Show>
            </Show>
            <Show when={!bundledShown().length && !systemShown().length}>
              <p class="empty sm">{t("font-none")}</p>
            </Show>
          </div>
          <Show when={system() === null}>
            <button type="button" class="btn sm font-load" disabled={loading()} onClick={() => void loadSystem()}>{t("font-load-system")}</button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
