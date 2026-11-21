// Settings sections for Phase 3–8 features: editor extras, history, the
// companion, the MCP bridge, custom CSS, JavaScript plugins and the shell.
import { For, Show, createSignal } from "solid-js";
import { Copy, Play, Plus, RefreshCw, Trash2 } from "lucide-solid";
import { t } from "../../i18n";
import { pref, setPref, type Prefs } from "../../state/prefs";
import { settings, updateSettings } from "../../state/settings";
import { dev, applyCustomCss, decideProposal, mcp, mcpActivity, mcpEndpoint, mcpError, mcpProposals, mcpStatus, pluginLogs, regenerateToken, runPlugin } from "../../state/devtools";
import { DEVELOPER_CSS_PRESETS } from "../../core/devExtensions";
import { buildClaudeCodeCommand, buildClaudeDesktopConfigSnippet, buildCursorSnippet, buildDirectHttpMcpSnippet, buildVsCodeSnippet, type McpAccessMode } from "../../core/mcp";
import { exportBackup, exportStandalone, importIntoVault } from "../../state/export";
import { toast } from "../../state/ui";
import { inTauri } from "../../state/backend";
import { Toggle } from "../controls";
import { PetModelControls, openPetStudio } from "../pet/PetCard";

export function PrefToggle(props: { k: { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]; label: string; hint?: string }) {
  return <Toggle label={props.label} hint={props.hint} checked={pref(props.k) as boolean} onChange={(v) => setPref(props.k, v as never)} />;
}

const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(t("copied")));

export function PetSettings() {
  return (
    <div class="stack">
      <Toggle label={t("onboarding-pet")} checked={settings.petEnabled} onChange={(v) => updateSettings((c) => { c.petEnabled = v; })} />
      <PrefToggle k="petFloating" label={t("pet-floating")} />
      <button class="btn" onClick={openPetStudio}>{t("pet-open")}</button>
      <h3 class="set-sub">{t("pet-model-title")}</h3>
      <PetModelControls />
    </div>
  );
}

type McpClient = "desktop" | "code" | "cursor" | "vscode" | "http";
const MCP_CLIENTS: McpClient[] = ["desktop", "code", "cursor", "vscode", "http"];
const MCP_EXAMPLES = ["mcp-example-1", "mcp-example-2", "mcp-example-3", "mcp-example-4", "mcp-example-5"] as const;

/** Step-by-step connection for common AI clients, with a ready-to-paste config and example requests. */
function McpConnectGuide() {
  const [client, setClient] = createSignal<McpClient>("desktop");
  const snippet = () => {
    const url = mcpEndpoint(), token = mcp.state.token;
    switch (client()) {
      case "desktop": return buildClaudeDesktopConfigSnippet(url, token);
      case "code": return buildClaudeCodeCommand(url, token);
      case "cursor": return buildCursorSnippet(url, token);
      case "vscode": return buildVsCodeSnippet(url, token);
      default: return buildDirectHttpMcpSnippet(url, token);
    }
  };
  return (
    <div class="mcp-guide stack">
      <h3 class="section-title">{t("mcp-connect-title")}</h3>
      <div class="chip-row" role="tablist" aria-label={t("mcp-connect-title")}>
        <For each={MCP_CLIENTS}>{(c) => <button class="chip" role="tab" aria-selected={client() === c} onClick={() => setClient(c)}>{t(`mcp-client-${c}`)}</button>}</For>
      </div>
      <ol class="mcp-steps">
        <li>{t(`mcp-step-${client()}`)}</li>
        <li>{t("mcp-step-paste")}</li>
        <li>{t("mcp-step-restart")}</li>
      </ol>
      <div class="code-box">
        <pre dir="ltr">{snippet().replace(mcp.state.token, `${mcp.state.token.slice(0, 12)}…`)}</pre>
        <button class="btn sm" onClick={() => copy(snippet())}><Copy />{t("action-copy")}</button>
      </div>
      <p class="hint">{t("mcp-token-hint")}</p>
      <h3 class="section-title">{t("mcp-examples-title")}</h3>
      <ul class="mcp-examples">
        <For each={MCP_EXAMPLES}>{(k) => <li><button class="btn ghost sm" title={t("action-copy")} onClick={() => copy(t(k))}><Copy /></button><span>{t(k)}</span></li>}</For>
      </ul>
    </div>
  );
}

export function McpSettings() {
  const set = (fn: (m: typeof mcp.state) => void) => mcp.update(fn);
  return (
    <div class="stack">
      <Show when={inTauri()} fallback={<p class="hint">{t("mcp-desktop-only")}</p>}>
        <Toggle label={t("mcp-enable")} hint={t("mcp-enable-hint")} checked={mcp.state.enabled} onChange={(v) => set((m) => { m.enabled = v; })} />
        <p class="hint" role="status">{mcpStatus() === "running" ? t("mcp-running", { url: mcpEndpoint() }) : mcpStatus() === "error" ? t("mcp-error", { detail: mcpError() }) : t("mcp-stopped")}</p>
        <label class="field"><span>{t("mcp-access")}</span>
          <select class="select" value={mcp.state.mode} onChange={(e) => { const v = e.currentTarget.value as McpAccessMode; set((m) => { m.mode = v; }); }}>
            <option value="read-only">{t("mcp-read-only")}</option>
            <option value="read-write">{t("mcp-read-write")}</option>
          </select>
        </label>
        <Show when={mcp.state.mode === "read-write"}>
          <Toggle label={t("mcp-auto-apply")} hint={t("mcp-auto-apply-hint")} checked={mcp.state.autoApplyChanges} onChange={(v) => set((m) => { m.autoApplyChanges = v; })} />
        </Show>
        <label class="field inline"><span>{t("mcp-port")}</span><input class="input sm num" type="number" min="1024" max="65535" value={mcp.state.port} onChange={(e) => { const v = Number(e.currentTarget.value) || 27124; set((m) => { m.port = v; }); }} /></label>
        <div class="row wrap">
          <code class="token">{mcp.state.token.slice(0, 12)}…</code>
          <button class="btn sm" onClick={() => copy(mcp.state.token)}><Copy />{t("mcp-copy-token")}</button>
          <button class="btn sm" onClick={regenerateToken}><RefreshCw />{t("mcp-new-token")}</button>
        </div>
        <McpConnectGuide />
        <Show when={mcpProposals().length}>
          <h3 class="section-title">{t("mcp-pending")}</h3>
          <For each={mcpProposals()}>
            {(p) => (
              <div class="card glass-soft stack">
                <strong>{t(`mcp-action-${p.action}`)}: {p.path}</strong>
                <span class="muted sm">{p.summary}{p.clientName ? ` · ${p.clientName}` : ""}</span>
                <Show when={p.newContent}><pre class="mcp-preview" dir="auto">{p.newContent!.slice(0, 1200)}</pre></Show>
                <div class="row"><button class="btn sm primary" onClick={() => void decideProposal(p.id, true)}>{t("mcp-approve")}</button><button class="btn sm" onClick={() => void decideProposal(p.id, false)}>{t("mcp-reject")}</button></div>
              </div>
            )}
          </For>
        </Show>
        <Show when={mcpActivity().length}>
          <h3 class="section-title">{t("mcp-activity")}</h3>
          <ul class="list compact"><For each={mcpActivity().slice(0, 20)}>{(a) => <li classList={{ warn: !a.ok }}><span class="muted sm">{new Date(a.timestamp).toLocaleTimeString()}</span> {a.tool ?? a.method} {a.path ?? ""}</li>}</For></ul>
        </Show>
      </Show>
    </div>
  );
}

export function CssSettings() {
  return (
    <div class="stack">
      <Toggle label={t("dev-css-enable")} checked={dev.state.customCssEnabled} onChange={(v) => { dev.update((d) => { d.customCssEnabled = v; }); applyCustomCss(); }} />
      <div class="row wrap">
        <For each={DEVELOPER_CSS_PRESETS}>{(p) => <button class="chip" onClick={() => { dev.update((d) => { d.customCss = p.css; }); applyCustomCss(); }}>{p.name}</button>}</For>
      </div>
      <textarea class="input code" dir="ltr" rows="10" aria-label={t("dev-css")} spellcheck={false} value={dev.state.customCss} onInput={(e) => { const v = e.currentTarget.value; dev.update((d) => { d.customCss = v; }); applyCustomCss(); }} />
    </div>
  );
}

export function PluginSettings() {
  const [openId, setOpenId] = createSignal<string | null>(null);
  const upd = (id: string, fn: (p: (typeof dev.state.scripts)[number]) => void) => dev.update((d) => { const p = d.scripts.find((x) => x.id === id); if (p) fn(p); });
  return (
    <div class="stack">
      <p class="hint">{t("dev-plugins-hint")}</p>
      <For each={dev.state.scripts}>
        {(p) => (
          <div class="card glass-soft stack">
            <div class="row wrap">
              <input class="input sm" value={p.name} aria-label={t("dev-plugin-name")} onChange={(e) => { const v = e.currentTarget.value; upd(p.id, (x) => { x.name = v; }); }} />
              <label class="check"><input type="checkbox" checked={p.enabled} onChange={(e) => { const v = e.currentTarget.checked; upd(p.id, (x) => { x.enabled = v; }); }} />{t("dev-plugin-enabled")}</label>
              <label class="check"><input type="checkbox" checked={!!p.runOnStartup} onChange={(e) => { const v = e.currentTarget.checked; upd(p.id, (x) => { x.runOnStartup = v; }); }} />{t("dev-plugin-startup")}</label>
              <span class="tb-fill" />
              <button class="btn sm" disabled={!p.enabled} onClick={() => void runPlugin(JSON.parse(JSON.stringify(p)))}><Play />{t("dev-plugin-run")}</button>
              <button class="btn sm" aria-expanded={openId() === p.id} onClick={() => setOpenId(openId() === p.id ? null : p.id)}>{t("dev-plugin-code")}</button>
              <button class="icon-btn sm" aria-label={t("action-delete")} onClick={() => dev.update((d) => { d.scripts = d.scripts.filter((x) => x.id !== p.id); })}><Trash2 /></button>
            </div>
            <Show when={openId() === p.id}>
              <textarea class="input code" dir="ltr" rows="10" spellcheck={false} aria-label={t("dev-plugin-code")} value={p.code} onInput={(e) => { const v = e.currentTarget.value; upd(p.id, (x) => { x.code = v; }); }} />
            </Show>
            <Show when={pluginLogs()[p.id]?.length || p.lastError}>
              <pre class="term-out small" dir="ltr">{[...(pluginLogs()[p.id] ?? []), p.lastError ? `[Error] ${p.lastError}` : ""].filter(Boolean).join("\n")}</pre>
            </Show>
          </div>
        )}
      </For>
      <button class="btn sm" onClick={() => dev.update((d) => { d.scripts.push({ id: `plugin-${Date.now().toString(36)}`, name: t("dev-plugin-new"), enabled: true, runOnStartup: false, code: "nosidian.showToast('Hello from my plugin');" }); })}><Plus />{t("dev-plugin-add")}</button>
    </div>
  );
}

export function ShellSettings() {
  return <PrefToggle k="systemShell" label={t("dev-system-shell")} hint={t("dev-system-shell-hint")} />;
}

export function VaultTools() {
  return (
    <div class="row wrap">
      <button class="btn" onClick={() => void importIntoVault()}>{t("import-files")}</button>
      <button class="btn" onClick={() => void exportBackup()}>{t("export-backup")}</button>
      <button class="btn" onClick={() => void exportStandalone()}>{t("export-standalone")}</button>
    </div>
  );
}
