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
}

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
};

export const backend: VaultBackend = inTauri() ? tauriBackend : memoryBackend;
