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
import { loadVaultDocs } from "./persist";
import { onFlush } from "./flush";
import { pref } from "./prefs";
import { isAppView, tabTitle } from "./views";

const SAVE_DELAY_MS = 500;

const v = createRoot(() => {
  const [vault, setVault] = createSignal<Vault | null>(null);
  const [tree, setTree] = createStore<VaultTree>({ notes: [], folders: [] });
  const [contents, setContents] = createStore<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  // Bumped after every change on disk so index-backed views refetch.
  const [rev, setRev] = createSignal(0);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return { vault, setVault, tree, setTree, contents, setContents, saving, setSaving, error, setError, timers, rev, setRev };
});

export const vault = v.vault;
export const tree = v.tree;
export const contents = v.contents;
export const saving = v.saving;
export const vaultError = v.error;
/** Index revision: read it inside a resource source to refetch after edits. */
export const indexRev = v.rev;
let revTimer: ReturnType<typeof setTimeout> | undefined;
export function bumpIndex(delay = 0) {
  clearTimeout(revTimer);
  revTimer = setTimeout(() => v.setRev((n) => n + 1), delay);
}

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
  bumpIndex();
}

/** Load a note's text into memory (the editor, reader and outline use it). */
export async function ensureLoaded(path: string): Promise<void> {
  if (v.contents[path] !== undefined || !path.toLowerCase().endsWith(".md")) return;
  const text = await backend.read(path).catch(() => "");
  if (v.contents[path] === undefined) v.setContents(path, text);
}

/** Leave the open vault (after its pending changes are written). */
export function leaveVault(): void {
  batch(() => {
    v.setVault(null);
    v.setContents(reconcile({}));
    v.setTree(reconcile({ notes: [], folders: [] }));
  });
}

/** Switch to a vault: load its profile, files and last open tabs. */
export async function enterVault(next: Vault): Promise<void> {
  batch(() => {
    v.setVault(next);
    v.setContents(reconcile({}));
  });
  await Promise.all([loadProfile(), loadVaultDocs()]);
  await refresh();
  const existing = new Set(tree.notes.map((n) => n.path));
  updateProfile((p) => {
    p.openTabs = p.openTabs.filter((x) => existing.has(x) || isAppView(x));
    if (!p.activeTab || !(existing.has(p.activeTab) || isAppView(p.activeTab))) p.activeTab = p.openTabs[0] ?? null;
    if (!p.activeTab && existing.has("Welcome to NoSidian.md")) {
      p.openTabs = ["Welcome to NoSidian.md"];
      p.activeTab = "Welcome to NoSidian.md";
    }
  });
  await Promise.all(profile.openTabs.map(ensureLoaded));
}

export function openNote(path: string): void {
  void ensureLoaded(path);
  updateProfile((p) => {
    if (!p.openTabs.includes(path)) p.openTabs.push(path);
    p.activeTab = path;
    if (!isAppView(path)) p.recent = [{ path, openedAt: Date.now() }, ...p.recent.filter((r) => r.path !== path)].slice(0, 50);
  });
  announce(t("announce-opened", { name: tabTitle(path) }));
}

export function closeTab(path: string): void {
  updateProfile((p) => {
    const i = p.openTabs.indexOf(path);
    if (i < 0) return;
    p.openTabs.splice(i, 1);
    if (p.activeTab === path) p.activeTab = p.openTabs[Math.min(i, p.openTabs.length - 1)] ?? null;
  });
}

const pendingText = new Map<string, string>();

async function writeNow(path: string): Promise<void> {
  clearTimeout(v.timers.get(path));
  v.timers.delete(path);
  const text = pendingText.get(path);
  if (text === undefined) return;
  pendingText.delete(path);
  try {
    await backend.write(path, text);
    const now = Date.now();
    v.setTree("notes", (n) => n.path === path, "modified", now);
    bumpIndex(400);
    autoSnapshot(path, text, now);
  } catch (e) {
    reportError(e);
  } finally {
    if (v.timers.size === 0) v.setSaving(false);
  }
}
onFlush(() => Promise.all([...pendingText.keys()].map(writeNow)).then(() => undefined));

export function setContent(path: string, text: string): void {
  v.setContents(path, text);
  v.setSaving(true);
  pendingText.set(path, text);
  clearTimeout(v.timers.get(path));
  v.timers.set(path, setTimeout(() => void writeNow(path), SAVE_DELAY_MS));
}

const lastSnap = new Map<string, number>();
const SNAP_EVERY_MS = 5 * 60_000;
function autoSnapshot(path: string, text: string, now: number) {
  if (!path.toLowerCase().endsWith(".md") || !pref("historyAuto")) return;
  if (now - (lastSnap.get(path) ?? 0) < SNAP_EVERY_MS) return;
  lastSnap.set(path, now);
  void backend.historySnapshot(path, text).catch(() => undefined);
}

const joinPath = (folder: string | undefined, name: string) => (folder ? `${folder}/${name}` : name);

export async function createNote(name: string, folder?: string, body?: string, open = true): Promise<string | null> {
  const clean = name.trim().replace(/\.md$/i, "");
  if (!clean) return null;
  const path = joinPath(folder, `${clean}.md`);
  const text = body ?? `# ${clean}\n\n`;
  try {
    if (folder && !tree.folders.includes(folder)) await backend.createFolder(folder).catch(() => undefined);
    await backend.createNote(path, text);
    v.setContents(path, text);
    await refresh();
    if (open) openNote(path);
    window.dispatchEvent(new CustomEvent("nosidian:activity", { detail: "create-note" }));
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
    window.dispatchEvent(new CustomEvent("nosidian:talk", { detail: "folder" }));
  } catch (e) {
    reportError(e);
  }
}

/** Move or rename `from` to `to`, keeping tabs, stars and recents pointing at it. */
async function relocate(from: string, to: string): Promise<boolean> {
  if (to === from) return false;
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
        p.collapsedFolders = p.collapsedFolders.map(move);
        p.noteModes = Object.fromEntries(Object.entries(p.noteModes).map(([k, m]) => [move(k), m]));
        p.fileStyles = Object.fromEntries(Object.entries(p.fileStyles ?? {}).map(([k, m]) => [move(k), m]));
      });
    });
    await refresh();
    return true;
  } catch (e) {
    reportError(e);
    return false;
  }
}

/** Rename a note or folder in place. */
export async function renameEntry(from: string, newName: string): Promise<void> {
  const isNote = tree.notes.some((n) => n.path === from);
  const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : undefined;
  const ext = isNote ? (from.match(/\.[^./]+$/)?.[0] ?? "") : "";
  const clean = newName.trim().replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), "");
  if (!clean) return;
  await relocate(from, joinPath(parent, clean + ext));
}

/** Can `from` be moved into `folder` ("" is the vault root)? */
export function canMoveInto(from: string, folder: string): boolean {
  const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  return parent !== folder && folder !== from && !folder.startsWith(from + "/");
}

/** Move a note or folder into another folder ("" is the vault root). */
export async function moveEntry(from: string, folder: string): Promise<void> {
  if (!canMoveInto(from, folder)) return;
  const name = from.slice(from.lastIndexOf("/") + 1);
  if (await relocate(from, joinPath(folder || undefined, name))) {
    announce(t("announce-moved", { name: noteTitle(name), path: folder || "/" }));
  }
}

type TrashListener = (gone: (p: string) => boolean) => void | Promise<void>;
const trashListeners: TrashListener[] = [];
/** Run after a file or folder went to the trash, with a test for the removed paths. */
export function onTrashed(fn: TrashListener): void { trashListeners.push(fn); }

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
    for (const fn of trashListeners) void fn(gone);
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

/** Append a block of text to a note, creating the note when it doesn't exist. */
export async function appendToNote(path: string, block: string): Promise<void> {
  if (!markdownPaths().includes(path)) {
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined;
    await createNote(path.split("/").pop()!.replace(/\.md$/i, ""), folder, `${block}\n`, false);
    return;
  }
  await ensureLoaded(path);
  const cur = v.contents[path] ?? "";
  setContent(path, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}\n${block}\n`);
}
