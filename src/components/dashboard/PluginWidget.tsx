// Home widget for a user plugin: pick which plugin it runs, run it with one
// click (or each time the home opens), and see what it printed.
import { For, Show, createMemo, onMount } from "solid-js";
import { Play, Settings2 } from "lucide-solid";
import { t } from "../../i18n";
import type { DashboardWidget } from "../../core/types";
import { dev, pluginLogs, pluginRunning, runPluginById } from "../../state/devtools";
import { updateWidget } from "../../state/dashboard";
import { openSettings } from "../settings/SettingsWindow";
import { Toggle } from "../controls";

export function PluginWidget(props: { w: DashboardWidget; edit: boolean }) {
  const plugin = createMemo(() => dev.state.scripts.find((p) => p.id === props.w.pluginId));
  const output = createMemo(() => {
    const p = plugin();
    if (!p) return "";
    return [...(pluginLogs()[p.id] ?? []), p.lastError && !pluginLogs()[p.id] ? `[Error] ${p.lastError}` : ""].filter(Boolean).join("\n");
  });
  onMount(() => { if (props.w.autoRun && plugin()?.enabled) void runPluginById(plugin()!.id); });

  return (
    <div class="w-plugin">
      <Show when={props.edit || !plugin()}>
        <Show when={dev.state.scripts.length} fallback={
          <div class="stack sm">
            <p class="empty sm">{t("plugin-widget-none")}</p>
            <button class="btn sm" onClick={() => openSettings("advanced")}><Settings2 />{t("plugin-widget-open-settings")}</button>
          </div>
        }>
          <select class="select sm" aria-label={t("plugin-widget-pick")} value={props.w.pluginId ?? ""} onChange={(e) => { const v = e.currentTarget.value; updateWidget(props.w.id, (x) => { x.pluginId = v || undefined; }); }}>
            <option value="">{t("plugin-widget-pick")}</option>
            <For each={dev.state.scripts}>{(p) => <option value={p.id}>{p.name}</option>}</For>
          </select>
          <Show when={plugin()}>
            <Toggle label={t("plugin-widget-autorun")} checked={!!props.w.autoRun} onChange={(v) => updateWidget(props.w.id, (x) => { x.autoRun = v; })} />
          </Show>
        </Show>
      </Show>
      <Show when={plugin()}>
        {(p) => (
          <>
            <div class="row w-plugin-bar">
              <p class="muted small" dir="auto">{p().description}</p>
              <span class="tb-fill" />
              <button class="btn sm" disabled={!p().enabled || pluginRunning(p().id)} title={p().enabled ? undefined : t("plugin-widget-disabled")} onClick={() => void runPluginById(p().id)}>
                <Play />{pluginRunning(p().id) ? t("plugin-widget-running") : t("dev-plugin-run")}
              </button>
            </div>
            <Show when={output()} fallback={<p class="empty sm">{t(p().enabled ? "plugin-widget-empty" : "plugin-widget-disabled")}</p>}>
              <pre class="w-plugin-out" dir="auto" aria-live="polite">{output()}</pre>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
