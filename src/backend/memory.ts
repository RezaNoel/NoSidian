// Browser-only vault kept in localStorage. Used for UI development, tests and
// screenshots; the real app always uses the Rust backend.
import { defaultProfile, type Vault, type VaultTree, type WorkspaceProfile } from "../state/types";
import type { VaultBackend } from "./index";

const samples = import.meta.glob("../../sample-vault/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const KEY = "nosidian.memvault";
interface Stored { name: string; files: Record<string, { content: string; created: number; modified: number }>; folders: string[]; profile: WorkspaceProfile }

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
let state: Stored | null = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function need(): Stored {
  if (!state) throw { code: "no-vault", detail: "no vault" };
  return state;
}
function validate(path: string) {
  if (!path || path.startsWith("/") || path.split("/").some((s) => s === ".." || s === "" || s === ".nosidian"))
    throw { code: "invalid-path", detail: path };
}
function parentsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

function fresh(name: string, seed: boolean): Stored {
  const now = Date.now();
  const files: Stored["files"] = {};
  const folders = new Set<string>();
  if (seed) {
    let i = 0;
    for (const [k, content] of Object.entries(samples)) {
      const path = k.replace("../../sample-vault/", "");
      files[path] = { content, created: now - 3600_000 * (8 - i), modified: now - 600_000 * i++ };
      parentsOf(path).forEach((f) => folders.add(f));
    }
  }
  return { name, files, folders: [...folders], profile: { ...defaultProfile(), starred: seed ? ["Welcome to NoSidian.md", "Markdown, Math & Mermaid Showcase.md"] : [] } };
}

function vaultOf(s: Stored): Vault {
  return { root: `memory://${s.name}`, meta: { id: "memory", name: s.name, createdAt: 0, formatVersion: 1 } };
}

export const memoryBackend: VaultBackend = {
  async openSampleVault() {
    state = fresh("NoSidian Demo Vault", true);
    save();
    return vaultOf(state);
  },
  async createVault(_parent, name) {
    if (!name.trim()) throw { code: "invalid-vault-name", detail: name };
    state = fresh(name.trim(), false);
    save();
    return vaultOf(state);
  },
  async openVault() {
    return vaultOf(need());
  },
  async defaultVaultParent() {
    return "Documents";
  },
  async pickFolder() {
    return null;
  },
  async scan(): Promise<VaultTree> {
    const s = need();
    const notes = Object.entries(s.files)
      .map(([path, f]) => ({ path, kind: path.endsWith(".pdf") ? ("pdf" as const) : ("markdown" as const), size: f.content.length, modified: f.modified, created: f.created }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return { notes, folders: [...s.folders].sort() };
  },
  async read(path) {
    const f = need().files[path];
    if (!f) throw { code: "not-found", detail: path };
    return f.content;
  },
  async write(path, content) {
    validate(path);
    const s = need();
    const now = Date.now();
    s.files[path] = { content, created: s.files[path]?.created ?? now, modified: now };
    parentsOf(path).forEach((f) => { if (!s.folders.includes(f)) s.folders.push(f); });
    save();
  },
  async createNote(path, content) {
    if (need().files[path]) throw { code: "already-exists", detail: path };
    await this.write(path, content);
  },
  async createFolder(path) {
    validate(path);
    const s = need();
    if (s.folders.includes(path)) throw { code: "already-exists", detail: path };
    [...parentsOf(path + "/x")].forEach((f) => { if (!s.folders.includes(f)) s.folders.push(f); });
    save();
  },
  async rename(from, to) {
    validate(to);
    const s = need();
    if (s.files[to] || s.folders.includes(to)) throw { code: "already-exists", detail: to };
    if (s.files[from]) {
      s.files[to] = s.files[from];
      delete s.files[from];
    } else if (s.folders.includes(from)) {
      for (const p of Object.keys(s.files)) if (p.startsWith(from + "/")) { s.files[to + p.slice(from.length)] = s.files[p]; delete s.files[p]; }
      s.folders = s.folders.map((f) => (f === from || f.startsWith(from + "/") ? to + f.slice(from.length) : f));
    } else throw { code: "not-found", detail: from };
    parentsOf(to).forEach((f) => { if (!s.folders.includes(f)) s.folders.push(f); });
    save();
  },
  async trash(path) {
    const s = need();
    delete s.files[path];
    for (const p of Object.keys(s.files)) if (p.startsWith(path + "/")) delete s.files[p];
    s.folders = s.folders.filter((f) => f !== path && !f.startsWith(path + "/"));
    save();
    return `.nosidian/trash/${Date.now()}/${path}`;
  },
  async loadProfile() {
    return { ...defaultProfile(), ...need().profile };
  },
  async saveProfile(p) {
    need().profile = p;
    save();
    return p;
  },
};
