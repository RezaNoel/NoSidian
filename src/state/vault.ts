// Active vault: file tree, note contents, tabs and file operations.
import { batch, createRoot, createSignal } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { backend } from "../backend";
import { announce } from "../a11y/announcer";
import { t } from "../i18n";
import { noteTitle } from "../lib/markdown";
import { loadProfile, profile, updateProfile } from "./workspace";
import { toast } from "./ui";
import type { Vault, VaultTree } from "./types";

const SAVE_DELAY_MS = 500;

const v = createRoot(() => {
  const [vault, setVault] = createSignal<Vault | null>(null);
  const [tree, setTree] = createStore<VaultTree>({ notes: [], folders: [] });
  const [contents, setContents] = createStore<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return { vault, setVault, tree, setTree, contents, setContents, saving, setSaving, error, setError, timers };
});

export const vault = v.vault;
export const tree = v.tree;
export const contents = v.contents;
export const saving = v.saving;
export const vaultError = v.error;

export const activePath = () => profile.activeTab;
export const markdownPaths = () => tree.notes.filter((n) => n.kind === "markdown").map((n) => n.path);

function reportError(e: unknown) {
  const code = (e as { code?: string })?.code ?? "unknown";
  const key = `error-${code}`;
  const msg = ["error-io", "error-corrupt-data", "error-invalid-vault-name", "error-already-exists", "error-not-found", "error-not-a-folder", "error-invalid-path", "error-no-vault"].includes(key)
    ? t(key as "error-io")
    : t("error-unknown", { detail: String((e as { detail?: string })?.detail ?? e) });
  v.setError(msg);
  toast(msg, true);
  setTimeout(() => v.setError(null), 5000);
}

export async function refresh(): Promise<void> {
  const next = await backend.scan();
  v.setTree(reconcile(next));
  // Load Markdown contents for links, tags and search (indexing moves to Rust in Phase 2).
  const missing = next.notes.filter((n) => n.kind === "markdown" && v.contents[n.path] === undefined);
  const loaded = await Promise.all(missing.map(async (n) => [n.path, await backend.read(n.path).catch(() => "")] as const));
  v.setContents(produce((c) => { for (const [p, s] of loaded) c[p] = s; }));
}

/** Switch to a vault: load its profile, files and last open tabs. */
export async function enterVault(next: Vault): Promise<void> {
  batch(() => {
    v.setVault(next);
    v.setContents(reconcile({}));
  });
  await loadProfile();
  await refresh();
  const existing = new Set(tree.notes.map((n) => n.path));
  updateProfile((p) => {
    p.openTabs = p.openTabs.filter((x) => existing.has(x));
    if (!p.activeTab || !existing.has(p.activeTab)) p.activeTab = p.openTabs[0] ?? null;
    if (!p.activeTab && existing.has("Welcome to NoSidian.md")) {
      p.openTabs = ["Welcome to NoSidian.md"];
      p.activeTab = "Welcome to NoSidian.md";
    }
  });
}

export function openNote(path: string): void {
  updateProfile((p) => {
    if (!p.openTabs.includes(path)) p.openTabs.push(path);
    p.activeTab = path;
    p.recent = [{ path, openedAt: Date.now() }, ...p.recent.filter((r) => r.path !== path)].slice(0, 50);
  });
  announce(t("announce-opened", { name: noteTitle(path) }));
}

export function closeTab(path: string): void {
  updateProfile((p) => {
    const i = p.openTabs.indexOf(path);
    if (i < 0) return;
    p.openTabs.splice(i, 1);
    if (p.activeTab === path) p.activeTab = p.openTabs[Math.min(i, p.openTabs.length - 1)] ?? null;
  });
}

export function setContent(path: string, text: string): void {
  v.setContents(path, text);
  v.setSaving(true);
  clearTimeout(v.timers.get(path));
  v.timers.set(
    path,
    setTimeout(async () => {
      v.timers.delete(path);
      try {
        await backend.write(path, text);
        const now = Date.now();
        v.setTree("notes", (n) => n.path === path, "modified", now);
      } catch (e) {
        reportError(e);
      } finally {
        if (v.timers.size === 0) v.setSaving(false);
      }
    }, SAVE_DELAY_MS),
  );
}

const joinPath = (folder: string | undefined, name: string) => (folder ? `${folder}/${name}` : name);

export async function createNote(name: string, folder?: string): Promise<string | null> {
  const clean = name.trim().replace(/\.md$/i, "");
  if (!clean) return null;
  const path = joinPath(folder, `${clean}.md`);
  try {
    await backend.createNote(path, `# ${clean}\n\n`);
    v.setContents(path, `# ${clean}\n\n`);
    await refresh();
    openNote(path);
    return path;
  } catch (e) {
    reportError(e);
    return null;
  }
}

export async function createFolder(name: string, parent?: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  try {
    await backend.createFolder(joinPath(parent, clean));
    await refresh();
  } catch (e) {
    reportError(e);
  }
}

/** Rename a note or folder; keeps tabs, stars and recents pointing at it. */
export async function renameEntry(from: string, newName: string): Promise<void> {
  const isNote = tree.notes.some((n) => n.path === from);
  const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : undefined;
  const ext = isNote ? (from.match(/\.[^./]+$/)?.[0] ?? "") : "";
  const clean = newName.trim().replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "");
  if (!clean) return;
  const to = joinPath(parent, clean + ext);
  if (to === from) return;
  try {
    await backend.rename(from, to);
    const move = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
    batch(() => {
      v.setContents(produce((c) => {
        for (const k of Object.keys(c)) if (move(k) !== k) { c[move(k)] = c[k]; delete c[k]; }
      }));
      updateProfile((p) => {
        p.openTabs = p.openTabs.map(move);
        p.activeTab = p.activeTab && move(p.activeTab);
        p.starred = p.starred.map(move);
        p.recent = p.recent.map((r) => ({ ...r, path: move(r.path) }));
      });
    });
    await refresh();
  } catch (e) {
    reportError(e);
  }
}

export async function trashEntry(path: string): Promise<void> {
  try {
    await backend.trash(path);
    const gone = (p: string) => p === path || p.startsWith(path + "/");
    updateProfile((p) => {
      p.openTabs = p.openTabs.filter((x) => !gone(x));
      if (p.activeTab && gone(p.activeTab)) p.activeTab = p.openTabs[0] ?? null;
      p.starred = p.starred.filter((x) => !gone(x));
      p.recent = p.recent.filter((r) => !gone(r.path));
    });
    v.setContents(produce((c) => { for (const k of Object.keys(c)) if (gone(k)) delete c[k]; }));
    await refresh();
  } catch (e) {
    reportError(e);
  }
}

export function toggleStar(path: string): void {
  updateProfile((p) => {
    p.starred = p.starred.includes(path) ? p.starred.filter((x) => x !== path) : [...p.starred, path];
  });
}

export { reportError };
