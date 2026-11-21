// Developer extensions (custom CSS, JavaScript plugins in a Web Worker) and
// the MCP bridge that lets local AI clients read and, with approval, edit notes.
import { createRoot, createSignal } from "solid-js";
import { appDoc } from "./persist";
import { createDefaultDeveloperConfig, normalizeDeveloperConfig } from "../core/devExtensions";
import { MCP_PROTOCOL_VERSION, generateMcpToken, runMcpJsonRpc, type McpAccessMode, type McpActivityLog, type McpChangeProposal } from "../core/mcp";
import type { CustomScriptPlugin, DeveloperCustomConfig } from "../core/types";
import { backend } from "../backend";
import { inTauri } from "./backend";
import { corpus, loadAllNotes } from "./corpus";
import { activePath, appendToNote, contents, createNote, ensureLoaded, markdownPaths, openNote, setContent, trashEntry, tree, vault } from "./vault";
import { toast } from "./ui";
import { t } from "../i18n";

export const dev = appDoc<DeveloperCustomConfig>("developer", () => normalizeDeveloperConfig(createDefaultDeveloperConfig()));

// ---------- Custom CSS ----------
let styleEl: HTMLStyleElement | null = null;
export function applyCustomCss(): void {
  if (typeof document === "undefined") return;
  styleEl ??= Object.assign(document.createElement("style"), { id: "nosidian-user-css" });
  if (!styleEl.isConnected) document.head.append(styleEl);
  styleEl.textContent = dev.state.customCssEnabled ? dev.state.customCss : "";
}

// ---------- JavaScript plugins (isolated in a Worker) ----------
const PRELUDE = `
const __snap = { vault: "", notes: [], active: null };
const __logs = [];
const __post = (type, payload) => postMessage({ type, payload });
const console = {
  log: (...a) => __post("log", a.map(String).join(" ")),
  info: (...a) => __post("log", "[info] " + a.map(String).join(" ")),
  warn: (...a) => __post("log", "[warn] " + a.map(String).join(" ")),
  error: (...a) => __post("log", "[error] " + a.map(String).join(" ")),
};
const nosidian = Object.freeze({
  getVaultName: () => __snap.vault,
  getNotesCount: () => __snap.notes.length,
  listNotes: () => __snap.notes.map((n) => ({ ...n })),
  getActiveNote: () => (__snap.active ? { ...__snap.active } : null),
  openNote: (path) => __post("open", String(path)),
  createNote: (path, content) => __post("create", { path: String(path), content: String(content ?? "") }),
  updateActiveNote: (content) => __post("update", String(content)),
  appendToNote: (path, text) => __post("append", { path: String(path), text: String(text) }),
  showToast: (msg) => __post("toast", String(msg)),
  setCssVar: (name, value) => __post("css", { name: String(name), value: String(value) }),
});
self.onmessage = async (e) => {
  Object.assign(__snap, e.data);
  try { await (async () => { "use strict";
`;
const POSTLUDE = `
  })(); __post("done", null); } catch (err) { __post("error", String(err && err.message || err)); }
};`;

const logs = createRoot(() => createSignal<Record<string, string[]>>({}));
export const pluginLogs = logs[0];

export async function runPlugin(p: CustomScriptPlugin): Promise<void> {
  await loadAllNotes();
  const lines: string[] = [];
  const blob = new Blob([PRELUDE, p.code, POSTLUDE], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const finish = (err?: string) => {
    worker.terminate();
    URL.revokeObjectURL(url);
    clearTimeout(timer);
    if (err) lines.push(`[Error] ${err}`);
    logs[1]((l) => ({ ...l, [p.id]: lines }));
    dev.update((d) => { const x = d.scripts.find((s) => s.id === p.id); if (x) { x.lastRunAt = Date.now(); x.lastError = err; } });
  };
  const timer = setTimeout(() => finish(t("plugin-timeout")), 10_000);
  worker.onmessage = (e: MessageEvent<{ type: string; payload: unknown }>) => {
    const { type, payload } = e.data;
    const active = activePath();
    switch (type) {
      case "log": lines.push(String(payload)); break;
      case "toast": toast(String(payload)); break;
      case "open": openNote(String(payload)); break;
      case "create": { const { path, content } = payload as { path: string; content: string }; const clean = path.replace(/\.md$/i, ""); void createNote(clean.split("/").pop()!, clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : undefined, content); break; }
      case "update": if (active && !active.startsWith("app:")) setContent(active, String(payload)); break;
      case "append": { const { path, text } = payload as { path: string; text: string }; void appendToNote(path.endsWith(".md") ? path : `${path}.md`, text); break; }
      case "css": { const { name, value } = payload as { name: string; value: string }; if (name.startsWith("--")) document.documentElement.style.setProperty(name, value); break; }
      case "done": finish(); break;
      case "error": finish(String(payload)); break;
    }
  };
  worker.onerror = (e) => { e.preventDefault(); finish(e.message); };
  const active = activePath();
  worker.postMessage({
    vault: vault()?.meta.name ?? "",
    notes: corpus().map((n) => ({ path: n.path, content: n.content, starred: n.starred, updatedAt: n.updatedAt })),
    active: active && contents[active] !== undefined ? { path: active, content: contents[active], starred: false } : null,
  });
}

export function runStartupPlugins(): void {
  for (const p of dev.state.scripts) if (p.enabled && p.runOnStartup) void runPlugin(p);
}

// ---------- MCP bridge ----------
export interface McpSettings { enabled: boolean; mode: McpAccessMode; autoApplyChanges: boolean; token: string; port: number }
export const mcp = appDoc<McpSettings>("mcp", () => ({ enabled: false, mode: "read-only", autoApplyChanges: false, token: generateMcpToken(), port: 27124 }));

const rt = createRoot(() => {
  const [status, setStatus] = createSignal<"off" | "running" | "error">("off");
  const [error, setError] = createSignal("");
  const [boundPort, setBoundPort] = createSignal(0);
  const [activity, setActivity] = createSignal<McpActivityLog[]>([]);
  const [proposals, setProposals] = createSignal<McpChangeProposal[]>([]);
  return { status, setStatus, error, setError, boundPort, setBoundPort, activity, setActivity, proposals, setProposals };
});
export const mcpStatus = rt.status;
export const mcpError = rt.error;
export const mcpActivity = rt.activity;
export const mcpProposals = rt.proposals;
export const mcpEndpoint = () => `http://127.0.0.1:${rt.boundPort() || mcp.state.port}/mcp`;
export { MCP_PROTOCOL_VERSION };

async function applyProposal(p: McpChangeProposal): Promise<void> {
  const exists = markdownPaths().includes(p.path);
  if (p.action === "delete") { if (exists) await trashEntry(p.path); return; }
  if (p.action === "create" && !exists) {
    const clean = p.path.replace(/\.md$/i, "");
    await createNote(clean.split("/").pop()!, clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : undefined, p.newContent ?? "", false);
    return;
  }
  await ensureLoaded(p.path);
  setContent(p.path, p.newContent ?? "");
}

export async function decideProposal(id: string, approve: boolean): Promise<void> {
  const p = rt.proposals().find((x) => x.id === id);
  if (!p) return;
  if (approve) await applyProposal(p);
  rt.setProposals((l) => l.filter((x) => x.id !== id));
  toast(approve ? t("mcp-applied", { path: p.path }) : t("mcp-rejected", { path: p.path }));
}

let unlisten: (() => void) | null = null;
async function onRequest(id: number, body: string, client: string) {
  let reply = "";
  try {
    await loadAllNotes();
    const parsed = JSON.parse(body) as unknown;
    const batch = Array.isArray(parsed) ? parsed : [parsed];
    const out: unknown[] = [];
    for (const req of batch) {
      const { response, log } = runMcpJsonRpc(req, {
        vaultName: vault()?.meta.name ?? "",
        notes: corpus().map((n) => ({ ...n })),
        folders: [...tree.folders],
        mode: mcp.state.mode,
        autoApplyChanges: mcp.state.autoApplyChanges,
        onApplyWrite: (proposal, now) => {
          const withClient = { ...proposal, clientName: client.slice(0, 60) };
          if (now) void applyProposal(withClient);
          else { rt.setProposals((l) => [withClient, ...l].slice(0, 50)); toast(t("mcp-proposal", { path: proposal.path })); }
        },
      });
      if (log) rt.setActivity((l) => [{ ...log, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() }, ...l].slice(0, 100));
      // Notifications (no id) get no response body.
      if (req && typeof req === "object" && "id" in (req as object)) out.push(response);
    }
    reply = out.length ? JSON.stringify(Array.isArray(parsed) ? out : out[0]) : "";
  } catch {
    reply = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  await backend.mcpRespond(id, reply).catch(() => undefined);
}

export async function syncMcp(): Promise<void> {
  if (!inTauri()) return;
  const want = mcp.state.enabled && mcp.state.mode !== "off";
  if (!want) {
    if (rt.status() === "running") await backend.mcpStop().catch(() => undefined);
    unlisten?.(); unlisten = null;
    rt.setStatus("off");
    return;
  }
  try {
    if (rt.status() === "running" && rt.boundPort() !== mcp.state.port) await backend.mcpStop().catch(() => undefined);
    // A just-stopped listener can hold the port for a moment; retry once.
    const port = await backend.mcpStart(mcp.state.port, mcp.state.token)
      .catch(() => new Promise((r) => setTimeout(r, 300)).then(() => backend.mcpStart(mcp.state.port, mcp.state.token)));
    rt.setBoundPort(port);
    if (!unlisten) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ id: number; body: string; client: string }>("mcp-request", (e) => void onRequest(e.payload.id, e.payload.body, e.payload.client));
    }
    rt.setStatus("running");
    rt.setError("");
  } catch (e) {
    rt.setStatus("error");
    rt.setError(String((e as { detail?: string })?.detail ?? e));
  }
}

export function regenerateToken(): void {
  mcp.update((m) => { m.token = generateMcpToken() + generateMcpToken().slice(8); });
}
