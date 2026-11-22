// Backend interface for vault files. In the app it calls Rust; in a plain
// browser (dev server, tests, screenshots) it uses an in-memory vault seeded
// with the sample notes and kept in localStorage.
import { inTauri } from "../state/backend";
import {
  defaultProfile,
  type NoteLinks,
  type NoteSummary,
  type SearchHit,
  type SearchSort,
  type TagCount,
  type Vault,
  type VaultTree,
  type WorkspaceProfile,
} from "../state/types";
import { memoryBackend } from "./memory";

export interface VaultBackend {
  openSampleVault(): Promise<Vault>;
  createVault(parent: string, name: string): Promise<Vault>;
  openVault(path: string): Promise<Vault>;
  defaultVaultParent(): Promise<string>;
  pickFolder(): Promise<string | null>;
  scan(): Promise<VaultTree>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  createNote(path: string, content: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  trash(path: string): Promise<string>;
  loadProfile(): Promise<WorkspaceProfile>;
  saveProfile(p: WorkspaceProfile): Promise<WorkspaceProfile>;
  /** Vault-owned binary assets (banner images), base64 in, data: URL out. */
  assetWrite(name: string, base64: string): Promise<void>;
  assetRead(name: string): Promise<string>;
  assetDelete(name: string): Promise<void>;
  /** Vault index (built in Rust). */
  search(query: string, sort?: SearchSort, limit?: number): Promise<SearchHit[]>;
  tags(): Promise<TagCount[]>;
  links(path: string): Promise<NoteLinks>;
  summaries(): Promise<NoteSummary[]>;
  rebuildIndex(): Promise<number>;
  /** Feature documents in `.nosidian/<name>.json` (null when missing). */
  storeRead<T = unknown>(name: string): Promise<T | null>;
  storeWrite(name: string, value: unknown): Promise<void>;
  /** App-wide documents (pet, plugins) outside any vault. */
  appStoreRead<T = unknown>(name: string): Promise<T | null>;
  appStoreWrite(name: string, value: unknown): Promise<void>;
  historyList(path: string): Promise<Snapshot[]>;
  historySnapshot(path: string, content: string): Promise<Snapshot | null>;
  historyRead(path: string, ts: number): Promise<string>;
  attachments(): Promise<string[]>;
  fileRead(path: string): Promise<Uint8Array>;
  fileWrite(path: string, base64: string): Promise<void>;
  /** Save a dropped file under a free name in `folder`; returns its path. */
  fileAdd(folder: string, name: string, base64: string): Promise<string>;
  /** Ask for files on disk and copy them into `folder`. */
  importFiles(folder: string): Promise<string[]>;
  /** Ask where to save and write text there. Returns false if cancelled. */
  saveText(defaultName: string, content: string, ext: string): Promise<boolean>;
  /** Ask where to save and write binary data there. Returns false if cancelled. */
  saveBytes(defaultName: string, bytes: Uint8Array, ext: string): Promise<boolean>;
  vaultBackup(): Promise<string>;
  /** Show an entry in the system file manager (desktop only). */
  revealInOs(path: string): Promise<void>;
  /** Absolute path of an entry on disk (desktop) or its vault path (browser). */
  absPath(path: string): Promise<string>;
  /** System shell (only when enabled in settings; the Rust side checks too). */
  terminalExec(command: string, shell: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }>;
  mcpStart(port: number, token: string): Promise<number>;
  mcpStop(): Promise<void>;
  mcpRespond(id: number, body: string): Promise<void>;
}

export interface Snapshot { ts: number; size: number }

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const tauriBackend: VaultBackend = {
  openSampleVault: () => invoke("open_sample_vault"),
  createVault: (parent, name) => invoke("create_vault", { parent, name }),
  openVault: (path) => invoke("open_vault", { path }),
  defaultVaultParent: () => invoke("default_vault_parent"),
  async pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ directory: true, multiple: false });
    return typeof res === "string" ? res : null;
  },
  scan: () => invoke("vault_scan"),
  read: (path) => invoke("note_read", { path }),
  write: (path, content) => invoke("note_write", { path, content }),
  createNote: (path, content) => invoke("note_create", { path, content }),
  createFolder: (path) => invoke("folder_create", { path }),
  rename: (from, to) => invoke("entry_rename", { from, to }),
  trash: (path) => invoke("entry_trash", { path }),
  async loadProfile() {
    const p = await invoke<Partial<WorkspaceProfile>>("load_profile");
    const d = defaultProfile();
    return { ...d, ...p, banner: { ...d.banner, ...p.banner } };
  },
  saveProfile: (profile) => invoke("save_profile", { profile }),
  assetWrite: (name, data) => invoke("asset_write", { name, data }),
  assetRead: (name) => invoke("asset_read", { name }),
  assetDelete: (name) => invoke("asset_delete", { name }),
  search: (query, sort = "relevance", limit = 100) => invoke("index_search", { query, sort, limit }),
  tags: () => invoke("index_tags"),
  links: (path) => invoke("index_links", { path }),
  summaries: () => invoke("index_summaries"),
  rebuildIndex: () => invoke("index_rebuild"),
  storeRead: (name) => invoke("store_read", { name }),
  storeWrite: (name, value) => invoke("store_write", { name, value }),
  appStoreRead: (name) => invoke("app_store_read", { name }),
  appStoreWrite: (name, value) => invoke("app_store_write", { name, value }),
  historyList: (path) => invoke("history_list", { path }),
  historySnapshot: (path, content) => invoke("history_snapshot", { path, content }),
  historyRead: (path, ts) => invoke("history_read", { path, ts }),
  attachments: () => invoke("attachments_list"),
  async fileRead(path) {
    const buf = await invoke<ArrayBuffer | number[]>("file_read", { path });
    return buf instanceof ArrayBuffer ? new Uint8Array(buf) : Uint8Array.from(buf);
  },
  fileWrite: (path, data) => invoke("file_write", { path, data }),
  fileAdd: (folder, name, data) => invoke("file_add", { folder, name, data }),
  async importFiles(folder) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ multiple: true, filters: [{ name: "Markdown / PDF / media", extensions: ["md", "markdown", "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "mp3", "wav", "ogg", "m4a", "mp4", "webm"] }] });
    const sources = Array.isArray(res) ? res : res ? [res] : [];
    return sources.length ? invoke("files_import", { sources, folder }) : [];
  },
  async saveText(defaultName, content, ext) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await invoke("export_text", { path, content });
    return true;
  },
  async saveBytes(defaultName, bytes, ext) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await invoke("export_bytes", { path, bytes: Array.from(bytes) });
    return true;
  },
  vaultBackup: () => invoke("vault_backup"),
  revealInOs: (path) => invoke("reveal_in_os", { path }),
  absPath: (path) => invoke("entry_abs_path", { path }),
  terminalExec: (command, shell, cwd) => invoke("terminal_exec", { command, shell, cwd }),
  mcpStart: (port, token) => invoke("mcp_start", { port, token }),
  mcpStop: () => invoke("mcp_stop"),
  mcpRespond: (id, body) => invoke("mcp_respond", { id, body }),
};

export const backend: VaultBackend = inTauri() ? tauriBackend : memoryBackend;
