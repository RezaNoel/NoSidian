import { backend } from "../backend";
// YAML front matter as an editable properties table above the note. Each
// property has a type (text, number, checkbox, date, list, tags, link, URL,
// image), picked from the icon beside its name and remembered per vault.
import { For, Match, Show, Switch, createMemo, createResource, createSignal, type JSX } from "solid-js";
import { Calendar, CheckSquare, ChevronDown, ChevronRight, Globe, Hash, Image as ImageIcon, Link2, List, Plus, Sigma, Tags, Type, X } from "lucide-solid";
import { t } from "../i18n";
import { blobUrl } from "../lib/attachments";
import { parseProps, withProps, type Prop } from "../lib/frontmatter";
import { resolveLink } from "../lib/markdown";
import { vaultDoc } from "../state/persist";
import { attachFolder, copyDroppedFiles } from "../state/dropFiles";
import { contents, markdownPaths, openNote, setContent } from "../state/vault";
import { openMenu } from "./ContextMenu";

export type PropType = "text" | "number" | "checkbox" | "date" | "list" | "tags" | "link" | "url" | "image";
const TYPES: PropType[] = ["text", "number", "checkbox", "date", "list", "tags", "link", "url", "image"];
const ICON: Record<PropType, () => JSX.Element> = {
  text: () => <Type />, number: () => <Sigma />, checkbox: () => <CheckSquare />, date: () => <Calendar />, list: () => <List />,
  tags: () => <Tags />, link: () => <Link2 />, url: () => <Globe />, image: () => <ImageIcon />,
};

/** Property types chosen by the person, by property name, for the whole vault. */
const propTypes = vaultDoc<Record<string, PropType>>("prop-types", () => ({}));

const IMG = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const linkOf = (v: string) => v.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();

/** The type a value most likely has, when none was chosen. */
function guessType(p: Prop): PropType {
  if (Array.isArray(p.value)) return p.key === "tags" || p.key === "tag" ? "tags" : "list";
  const v = p.value.trim();
  if (/^(true|false)$/i.test(v)) return "checkbox";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "date";
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  if (/^\[\[.+\]\]$/.test(v)) return IMG.test(linkOf(v)) ? "image" : "link";
  if (/^https?:\/\//i.test(v)) return IMG.test(v) ? "image" : "url";
  return "text";
}
export const typeOf = (p: Prop): PropType => propTypes.state[p.key] ?? guessType(p);

/** Convert a value when its type changes, so nothing is lost. */
function convert(value: Prop["value"], to: PropType): Prop["value"] {
  const flat = Array.isArray(value) ? value.join(", ") : value;
  if (to === "list" || to === "tags") return Array.isArray(value) ? value : flat.split(",").map((s) => s.trim().replace(to === "tags" ? /^#/ : /^$/, "")).filter(Boolean);
  if (to === "checkbox") return /^(true|yes|1|x)$/i.test(flat.trim()) ? "true" : "false";
  if (to === "number") { const n = parseFloat(flat); return Number.isFinite(n) ? String(n) : ""; }
  if (to === "date") return /^\d{4}-\d{2}-\d{2}/.test(flat) ? flat.slice(0, 10) : "";
  if (to === "link" || to === "image") return flat && !/^\[\[/.test(flat) && !/^https?:/i.test(flat) ? `[[${flat}]]` : flat;
  return flat;
}

function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const [path] = await copyDroppedFiles([f], attachFolder(), true);
      resolve(path ?? null);
    };
    input.click();
  });
}

function ImageValue(props: { value: string; readOnly?: boolean; onChange: (v: string) => void }) {
  const src = () => (/^https?:/i.test(props.value) ? props.value : linkOf(props.value));
  const [url] = createResource(src, (s) => (/^https?:/i.test(s) ? Promise.resolve(s) : blobUrl(s).catch(() => "")));
  return (
    <span class="prop-value prop-image">
      <Show when={url()}>{(u) => <img src={u()} alt="" />}</Show>
      <Show when={!props.readOnly}>
        <button class="btn sm" onClick={async () => { const p = await pickImage(); if (p) props.onChange(`[[${p}]]`); }}><ImageIcon />{t("props-choose-image")}</button>
        <Show when={props.value}><button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => props.onChange("")}><X /></button></Show>
      </Show>
    </span>
  );
}

const [collapsed, setCollapsed] = createSignal(false);

export function Properties(props: { path: string; readOnly?: boolean }) {
  const list = createMemo(() => parseProps(contents[props.path] ?? ""));
  const save = (next: Prop[]) => setContent(props.path, withProps(contents[props.path] ?? "", next));
  const update = (i: number, patch: Partial<Prop>) => save(list().map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setType = (i: number, ty: PropType) => {
    const p = list()[i];
    propTypes.update((m) => { m[p.key] = ty; });
    update(i, { value: convert(p.value, ty) });
  };
  const typeMenu = (e: MouseEvent, i: number) => {
    const cur = typeOf(list()[i]);
    openMenu(e, TYPES.map((ty) => ({ label: t(`prop-type-${ty}`), icon: ICON[ty](), mark: ty === cur, run: () => setType(i, ty) })));
  };
  const notes = createMemo(() => markdownPaths().map((p) => p.replace(/\.md$/i, "")));
  const listId = `props-notes-${Math.random().toString(36).slice(2, 7)}`;

  const editor = (p: Prop, i: number) => {
    const ty = typeOf(p);
    const flat = Array.isArray(p.value) ? p.value.join(", ") : p.value;
    const label = `${t("props-value")}: ${p.key}`;
    const setRaw = (v: Prop["value"]) => update(i, { value: v });
    return (
      <Switch fallback={<input class="prop-value input" value={flat} aria-label={label} dir="auto" onChange={(e) => setRaw(e.currentTarget.value)} />}>
        <Match when={ty === "checkbox"}><label class="prop-value prop-check"><input type="checkbox" checked={/^true$/i.test(flat)} aria-label={label} onChange={(e) => setRaw(e.currentTarget.checked ? "true" : "false")} /></label></Match>
        <Match when={ty === "number"}><input class="prop-value input" type="number" value={flat} aria-label={label} onChange={(e) => setRaw(e.currentTarget.value)} /></Match>
        <Match when={ty === "date"}><input class="prop-value input" type="date" value={flat.slice(0, 10)} aria-label={label} onChange={(e) => setRaw(e.currentTarget.value)} /></Match>
        <Match when={ty === "list"}><input class="prop-value input" value={flat} aria-label={label} title={t("props-list-hint")} dir="auto" onChange={(e) => setRaw(e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Match>
        <Match when={ty === "tags"}>
          <span class="prop-value prop-tags">
            <For each={Array.isArray(p.value) ? p.value : flat.split(",").filter(Boolean)}>{(v, j) => (
              <span class="prop-chip">#{v.replace(/^#/, "")}<button class="icon-btn xs" aria-label={t("action-delete")} onClick={() => setRaw((Array.isArray(p.value) ? p.value : []).filter((_, k) => k !== j()))}><X /></button></span>
            )}</For>
            <input class="input prop-tag-add" dir="auto" placeholder="+" aria-label={label} onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== ",") return;
              e.preventDefault();
              const v = e.currentTarget.value.trim().replace(/^#/, "");
              if (v) setRaw([...(Array.isArray(p.value) ? p.value : []), v]);
              e.currentTarget.value = "";
            }} />
          </span>
        </Match>
        <Match when={ty === "link"}><input class="prop-value input" list={listId} value={linkOf(flat)} aria-label={label} dir="auto" onChange={(e) => { const v = e.currentTarget.value.trim(); setRaw(v ? `[[${v}]]` : ""); }} /></Match>
        <Match when={ty === "url"}><input class="prop-value input" type="url" dir="ltr" value={flat} aria-label={label} onChange={(e) => setRaw(e.currentTarget.value.trim())} /></Match>
        <Match when={ty === "image"}><ImageValue value={flat} onChange={setRaw} /></Match>
      </Switch>
    );
  };

  const viewer = (p: Prop) => {
    const ty = typeOf(p);
    const flat = Array.isArray(p.value) ? p.value.join(", ") : p.value;
    return (
      <Switch fallback={<span class="prop-value" dir="auto">{Array.isArray(p.value) ? <For each={p.value}>{(v) => <span class="prop-chip">{v}</span>}</For> : p.value}</span>}>
        <Match when={ty === "checkbox"}><span class="prop-value"><input type="checkbox" checked={/^true$/i.test(flat)} disabled aria-label={p.key} /></span></Match>
        <Match when={ty === "tags"}><span class="prop-value"><For each={Array.isArray(p.value) ? p.value : flat.split(",").filter(Boolean)}>{(v) => <button class="prop-chip" onClick={() => window.dispatchEvent(new CustomEvent("nosidian:search", { detail: `#${v.replace(/^#/, "")}` }))}><Hash aria-hidden="true" />{v.replace(/^#/, "")}</button>}</For></span></Match>
        <Match when={ty === "link"}>{(() => { const target = resolveLink(linkOf(flat), markdownPaths()); return <span class="prop-value"><Show when={target} fallback={<span dir="auto">{linkOf(flat)}</span>}><button class="link-btn" dir="auto" onClick={() => openNote(target!)}>{linkOf(flat).split("/").pop()}</button></Show></span>; })()}</Match>
        <Match when={ty === "url"}><span class="prop-value"><a href={flat} target="_blank" rel="noopener" dir="ltr" onClick={(e) => { e.preventDefault(); void backend.openUrl(flat); }}>{flat.replace(/^https?:\/\//, "")}</a></span></Match>
        <Match when={ty === "image"}><ImageValue value={flat} readOnly onChange={() => undefined} /></Match>
      </Switch>
    );
  };

  return (
    <Show when={list().length || !props.readOnly}>
      <section class="props" classList={{ "read-only": props.readOnly }} aria-label={t("props-title")}>
        <button class="props-head" aria-expanded={!collapsed()} onClick={() => setCollapsed(!collapsed())}>
          {collapsed() ? <ChevronRight class="flip-rtl" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          <span>{t("props-title")}</span>
          <span class="count">{list().length}</span>
        </button>
        <Show when={!collapsed()}>
          <datalist id={listId}><For each={notes()}>{(n) => <option value={n} />}</For></datalist>
          <div class="props-grid" role="list">
            <For each={list()}>
              {(p, i) => (
                <div class="prop-row" role="listitem">
                  <Show when={!props.readOnly} fallback={<span class="prop-icon" aria-hidden="true">{ICON[typeOf(p)]()}</span>}>
                    <button class="prop-icon prop-type-btn" title={t("props-type", { type: t(`prop-type-${typeOf(p)}`) })} aria-label={t("props-type", { type: t(`prop-type-${typeOf(p)}`) })} onClick={(e) => typeMenu(e, i())}>{ICON[typeOf(p)]()}</button>
                  </Show>
                  <Show when={!props.readOnly} fallback={<span class="prop-key">{p.key}</span>}>
                    <input class="prop-key input" value={p.key} aria-label={t("props-key")} dir="auto" onChange={(e) => update(i(), { key: e.currentTarget.value.trim() })} />
                  </Show>
                  <Show when={!props.readOnly} fallback={viewer(p)}>
                    {editor(p, i())}
                    <button class="icon-btn sm" title={t("props-remove", { name: p.key })} aria-label={t("props-remove", { name: p.key })} onClick={() => save(list().filter((_, j) => j !== i()))}><X /></button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={!props.readOnly}>
            <div class="props-actions">
              <button class="btn sm" onClick={() => save([...list(), { key: `property${list().length + 1}`, value: "" }])}><Plus aria-hidden="true" />{t("props-add")}</button>
              <button class="btn sm" onClick={() => save([...list(), { key: "tags", value: [] }])}><Tags aria-hidden="true" />tags</button>
            </div>
          </Show>
        </Show>
      </section>
    </Show>
  );
}
