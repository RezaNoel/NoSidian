// Files explorer: toolbar (new note/folder, sort, reveal, collapse) and an
// ARIA tree with keyboard navigation and a context menu.
import { For, Show, createMemo, createSignal } from "solid-js";
import {
  ArrowUpDown, ChevronDown, ChevronRight, ChevronsDownUp, Crosshair, FilePlus, FileText, FileType,
  Folder, FolderOpen, FolderPlus, Image, Pencil, Star, Trash2,
} from "lucide-solid";
import { locale, t } from "../i18n";
import { buildTree, relativeTime, visibleNodes, type TreeNode } from "../lib/tree";
import { noteTitle } from "../lib/markdown";
import { activePath, createFolder, createNote, openNote, renameEntry, toggleStar, trashEntry, tree } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { askConfirm, askText, isMobile, setDrawer, setOverlay } from "../state/ui";
import type { SortMode } from "../state/types";
import { openMenu } from "./ContextMenu";

const SORTS: SortMode[] = ["name-asc", "name-desc", "modified-new", "modified-old", "created-new", "created-old"];

export async function promptNewNote(folder?: string) {
  const name = await askText(t("prompt-note-name"), t("untitled-note"), t("action-create"));
  if (name) {
    await createNote(name, folder);
    if (isMobile()) setDrawer("none");
  }
}
export async function promptNewFolder(parent?: string) {
  const name = await askText(t("prompt-folder-name"), "", t("action-create"));
  if (name) await createFolder(name, parent);
}
async function promptRename(node: { path: string; name: string; kind: string }) {
  const current = node.kind === "markdown" ? noteTitle(node.path) : node.name;
  const name = await askText(t("action-rename"), current, t("action-rename"));
  if (name) await renameEntry(node.path, name);
}
async function confirmTrash(node: { path: string; name: string }) {
  if (await askConfirm(t("confirm-delete-title"), t("confirm-delete-body", { name: node.name }), t("action-delete"))) {
    await trashEntry(node.path);
  }
}

export function FileTree() {
  let list!: HTMLUListElement;
  const collapsed = createMemo(() => new Set(profile.collapsedFolders));
  const nodes = createMemo(() => buildTree(tree.notes, tree.folders, profile.sort));
  const visible = createMemo(() => visibleNodes(nodes(), collapsed()));
  const [focused, setFocused] = createSignal<string | null>(null);
  const current = () => focused() ?? activePath() ?? visible()[0]?.path;

  const toggle = (path: string, open?: boolean) =>
    updateProfile((p) => {
      const isOpen = !p.collapsedFolders.includes(path);
      const want = open ?? !isOpen;
      p.collapsedFolders = want ? p.collapsedFolders.filter((x) => x !== path) : [...p.collapsedFolders, path];
    });

  const activate = (n: TreeNode) => {
    if (n.kind === "folder") toggle(n.path);
    else {
      openNote(n.path);
      if (isMobile()) setDrawer("none");
    }
  };

  const focusPath = (path: string) => {
    setFocused(path);
    queueMicrotask(() => list.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)?.focus());
  };

  const onKey = (e: KeyboardEvent, n: TreeNode) => {
    const items = visible();
    const i = items.findIndex((x) => x.path === n.path);
    const rtl = getComputedStyle(list).direction === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const parent = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : null;
    switch (e.key) {
      case "ArrowDown": if (items[i + 1]) focusPath(items[i + 1].path); break;
      case "ArrowUp": if (items[i - 1]) focusPath(items[i - 1].path); break;
      case "Home": if (items[0]) focusPath(items[0].path); break;
      case "End": focusPath(items[items.length - 1].path); break;
      case fwd:
        if (n.kind === "folder") {
          if (collapsed().has(n.path)) toggle(n.path, true);
          else if (n.children[0]) focusPath(n.children[0].path);
        }
        break;
      case back:
        if (n.kind === "folder" && !collapsed().has(n.path)) toggle(n.path, false);
        else if (parent) focusPath(parent);
        break;
      case "Enter": case " ": activate(n); break;
      case "F2": void promptRename(n); break;
      case "Delete": void confirmTrash(n); break;
      default: return;
    }
    e.preventDefault();
  };

  const menuFor = (e: MouseEvent | { clientX: number; clientY: number }, n: TreeNode) => {
    const isFolder = n.kind === "folder";
    const starred = profile.starred.includes(n.path);
    openMenu(e, [
      ...(isFolder
        ? [
            { label: t("action-new-note"), icon: <FilePlus />, run: () => void promptNewNote(n.path) },
            { label: t("action-new-folder"), icon: <FolderPlus />, run: () => void promptNewFolder(n.path) },
          ]
        : [{ label: starred ? t("action-unstar") : t("action-star"), icon: <Star />, run: () => toggleStar(n.path) }]),
      { label: t("action-rename"), icon: <Pencil />, run: () => void promptRename(n) },
      { label: t("action-delete"), icon: <Trash2 />, danger: true, run: () => void confirmTrash(n) },
    ]);
  };

  // Long-press opens the context menu on touch screens.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  const onTouchStart = (e: TouchEvent, n: TreeNode) => {
    const touch = e.touches[0];
    pressTimer = setTimeout(() => menuFor({ clientX: touch.clientX, clientY: touch.clientY }, n), 520);
  };
  const cancelPress = () => clearTimeout(pressTimer);

  const reveal = () => {
    const a = activePath();
    if (!a) return;
    updateProfile((p) => {
      const parts = a.split("/").slice(0, -1);
      const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      p.collapsedFolders = p.collapsedFolders.filter((f) => !ancestors.includes(f));
    });
    focusPath(a);
  };

  const cycleSort = (e: MouseEvent) =>
    openMenu(e.currentTarget instanceof HTMLElement ? rectPoint(e.currentTarget) : e, SORTS.map((s) => ({
      label: (profile.sort === s ? "✓ " : "") + t(`sort-${s}`),
      run: () => updateProfile((p) => { p.sort = s; }),
    })));

  return (
    <div class="panel files-panel">
      <div class="panel-head">
        <h2 class="section-title">{t("tab-files")}</h2>
        <div class="panel-tools" role="toolbar" aria-label={t("tab-files")}>
          <button class="icon-btn sm" title={t("action-new-note")} aria-label={t("action-new-note")} onClick={() => void promptNewNote()}><FilePlus /></button>
          <button class="icon-btn sm" title={t("action-new-folder")} aria-label={t("action-new-folder")} onClick={() => void promptNewFolder()}><FolderPlus /></button>
          <button class="icon-btn sm" title={`${t("action-sort")}: ${t(`sort-${profile.sort}`)}`} aria-label={t("action-sort")} aria-haspopup="menu" onClick={cycleSort}><ArrowUpDown /></button>
          <button class="icon-btn sm" title={t("action-reveal-active")} aria-label={t("action-reveal-active")} onClick={reveal} disabled={!activePath()}><Crosshair /></button>
          <button class="icon-btn sm" title={t("action-collapse-all")} aria-label={t("action-collapse-all")} onClick={() => updateProfile((p) => { p.collapsedFolders = [...tree.folders]; })}><ChevronsDownUp /></button>
          <button class="icon-btn sm" aria-pressed={profile.banner.enabled} title={t("banner-title")} aria-label={t("banner-title")} aria-haspopup="dialog" onClick={() => setOverlay("banner")}><Image /></button>
        </div>
      </div>
      <Show when={visible().length} fallback={<p class="empty">{t("links-none")}</p>}>
        <ul ref={list} class="tree" role="tree" aria-label={t("tab-files")}>
          <For each={visible()}>
            {(n) => {
              const isFolder = n.kind === "folder";
              const open = () => isFolder && !collapsed().has(n.path);
              const active = () => activePath() === n.path;
              return (
                <li
                  role="treeitem"
                  data-path={n.path}
                  aria-level={n.depth + 1}
                  aria-expanded={isFolder ? open() : undefined}
                  aria-selected={active()}
                  tabIndex={current() === n.path ? 0 : -1}
                  class="tree-row"
                  classList={{ active: active(), folder: isFolder }}
                  style={{ "--depth": n.depth }}
                  onClick={() => { setFocused(n.path); activate(n); }}
                  onKeyDown={(e) => onKey(e, n)}
                  onFocus={() => setFocused(n.path)}
                  onContextMenu={(e) => menuFor(e, n)}
                  onTouchStart={(e) => onTouchStart(e, n)}
                  onTouchEnd={cancelPress}
                  onTouchMove={cancelPress}
                >
                  <span class="tree-chevron" aria-hidden="true">
                    <Show when={isFolder}>{open() ? <ChevronDown /> : <ChevronRight class="flip-rtl" />}</Show>
                  </span>
                  <span class="tree-icon" aria-hidden="true">
                    {isFolder ? (open() ? <FolderOpen /> : <Folder />) : n.kind === "pdf" ? <FileType /> : <FileText />}
                  </span>
                  <span class="tree-label">
                    <span class="tree-name" dir="auto">{n.kind === "markdown" ? noteTitle(n.path) : n.name}</span>
                    <Show when={!isFolder && n.meta}>
                      <span class="tree-meta">{relativeTime(n.meta!.modified, locale())}</span>
                    </Show>
                  </span>
                  <Show when={profile.starred.includes(n.path)}>
                    <Star class="tree-star" aria-label={t("tab-starred")} />
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function rectPoint(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const rtl = getComputedStyle(el).direction === "rtl";
  return { clientX: rtl ? r.right - 220 : r.left, clientY: r.bottom + 4 };
}
