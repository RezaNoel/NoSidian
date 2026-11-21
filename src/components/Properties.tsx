// YAML front matter as an editable properties table above the note.
import { For, Show, createMemo, createSignal } from "solid-js";
import { ChevronDown, ChevronRight, List, Plus, Type, X } from "lucide-solid";
import { t } from "../i18n";
import { parseProps, withProps, type Prop } from "../lib/frontmatter";
import { contents, setContent } from "../state/vault";

const [collapsed, setCollapsed] = createSignal(false);

export function Properties(props: { path: string; readOnly?: boolean }) {
  const list = createMemo(() => parseProps(contents[props.path] ?? ""));
  const save = (next: Prop[]) => setContent(props.path, withProps(contents[props.path] ?? "", next));
  const update = (i: number, patch: Partial<Prop>) => save(list().map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const parseValue = (raw: string, wasList: boolean): Prop["value"] =>
    wasList ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;

  return (
    <Show when={list().length || !props.readOnly}>
      <section class="props" classList={{ "read-only": props.readOnly }} aria-label={t("props-title")}>
        <button class="props-head" aria-expanded={!collapsed()} onClick={() => setCollapsed(!collapsed())}>
          {collapsed() ? <ChevronRight class="flip-rtl" aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          <span>{t("props-title")}</span>
          <span class="count">{list().length}</span>
        </button>
        <Show when={!collapsed()}>
          <div class="props-grid" role="list">
            <For each={list()}>
              {(p, i) => (
                <div class="prop-row" role="listitem">
                  <span class="prop-icon" aria-hidden="true">{Array.isArray(p.value) ? <List /> : <Type />}</span>
                  <Show when={!props.readOnly} fallback={<span class="prop-key">{p.key}</span>}>
                    <input class="prop-key input" value={p.key} aria-label={t("props-key")} dir="auto" onChange={(e) => update(i(), { key: e.currentTarget.value.trim() })} />
                  </Show>
                  <Show
                    when={!props.readOnly}
                    fallback={
                      <span class="prop-value" dir="auto">
                        {Array.isArray(p.value) ? <For each={p.value}>{(v) => <span class="prop-chip">{v}</span>}</For> : p.value}
                      </span>
                    }
                  >
                    <input
                      class="prop-value input"
                      value={Array.isArray(p.value) ? p.value.join(", ") : p.value}
                      aria-label={`${t("props-value")}: ${p.key}`}
                      title={Array.isArray(p.value) ? t("props-list-hint") : undefined}
                      dir="auto"
                      onChange={(e) => update(i(), { value: parseValue(e.currentTarget.value, Array.isArray(p.value)) })}
                    />
                    <button class="icon-btn sm" title={t("props-remove", { name: p.key })} aria-label={t("props-remove", { name: p.key })} onClick={() => save(list().filter((_, j) => j !== i()))}><X /></button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={!props.readOnly}>
            <div class="props-actions">
              <button class="btn sm" onClick={() => save([...list(), { key: `property${list().length + 1}`, value: "" }])}><Plus aria-hidden="true" />{t("props-add")}</button>
              <button class="btn sm" onClick={() => save([...list(), { key: "tags", value: [] }])}><List aria-hidden="true" />tags</button>
            </div>
          </Show>
        </Show>
      </section>
    </Show>
  );
}
