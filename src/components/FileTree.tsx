// Files explorer: toolbar (new note/folder, sort, reveal, collapse) and an
// ARIA tree with keyboard navigation and a context menu.
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  ArrowUpDown, ChevronDown, ChevronRight, ChevronsDownUp, Crosshair, FilePlus, FileText, FileType,
  Copy, CopyPlus, ExternalLink, Folder, FolderInput, FolderOpen, FolderPlus, FolderSearch, Link, Palette, Pencil, SlidersHorizontal, Star, Trash2,
} from "lucide-solid";
import { inTauri } from "../state/backend";
import { locale, t } from "../i18n";
import { buildTree, relativeTime, visibleNodes, type TreeNode } from "../lib/tree";
import { noteTitle } from "../lib/markdown";
import { backend } from "../backend";
import { activePath, canMoveInto, indexRev, moveEntry, createFolder, createNote, openNote, renameEntry, toggleStar, trashEntry, tree } from "../state/vault";
import { profile, updateProfile } from "../state/workspace";
import { askConfirm, askText, isMobile, setDrawer, toast } from "../state/ui";
import type { NoteSummary, SortMode } from "../state/types";
import { openMenu } from "./ContextMenu";
import { Dynamic } from "solid-js/web";
import { HoverPreview, hoverRow, leaveRow } from "./HoverPreview";
import { ENTRY_ICONS, EntryStyleDialog, entryStyle, openEntryStyle } from "./EntryStyle";
import { pref } from "../state/prefs";
import { copyDroppedFiles, hasOsFiles } from "../state/dropFiles";
import { PARA, moveToPara } from "../state/pkm";

type DisplayKey = "updated" | "last-opened" | "words" | "backlinks" | "tags";
const DISPLAY: DisplayKey[] = ["updated", "last-opened", "words", "backlinks", "tags"];
const SORTS: SortMode[] = ["name-asc", "name-desc", "modified-new", "modified-old", "created-new", "created-old"];

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast(t("menu-copied")); } catch { toast(t("menu-failed")); }
}

export async function promptNewNote(folder?: string) {
  const name = await askText(t("prompt-note-name"), t("untitled-note"), t("action-create"));
  if (name) {
    await createNote(name, folder ?? (pref("newNoteFolder") || undefined));
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
  if (!pref("confirmDelete") || await askConfirm(t("confirm-delete-title"), t("confirm-delete-body", { name: node.name }), t("action-delete"))) {
    await trashEntry(node.path);
  }
}

/** Show a file or folder in the Files panel: open the panel, expand its folders and focus it. */
export function revealInFiles(path: string): void {
  updateProfile((p) => {
    p.panels.left = true;
    p.leftTab = "files";
    const parts = path.split("/");
    const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    p.collapsedFolders = p.collapsedFolders.filter((f) => !ancestors.includes(f));
  });
  if (isMobile()) setDrawer("left");
  setTimeout(() => document.querySelector<HTMLElement>(`.tree [data-path="${CSS.escape(path)}"]`)?.focus(), 120);
}
if (typeof window !== "undefined") window.addEventListener("nosidian:reveal", (e) => { const d = (e as CustomEvent<string>).detail; if (d) revealInFiles(d); });

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
      case "F10": if (e.shiftKey) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menuFor({ clientX: r.left + 24, clientY: r.bottom }, n); } else return; break;
      default: return;
    }
    e.preventDefault();
  };

  const menuFor = (e: MouseEvent | { clientX: number; clientY: number }, n: TreeNode) => {
    const isFolder = n.kind === "folder";
    const starred = profile.starred.includes(n.path);
    const desktop = inTauri();
    openMenu(e, [
      ...(isFolder
        ? [
            { label: t("action-new-note"), icon: <FilePlus />, run: () => void promptNewNote(n.path) },
            { label: t("action-new-folder"), icon: <FolderPlus />, run: () => void promptNewFolder(n.path) },
          ]
        : [
            { label: t("menu-open"), icon: <ExternalLink />, run: () => openNote(n.path) },
            { label: starred ? t("action-unstar") : t("action-star"), icon: <Star />, run: () => toggleStar(n.path) },
          ]),
      ...(n.kind === "markdown" ? [{ label: t("menu-duplicate"), icon: <CopyPlus />, run: () => void duplicate(n.path) }] : []),
      { label: t("menu-copy-link-as"), icon: <Link />, sep: true, run: () => queueMicrotask(() => copyMenu(e, n)) },
      ...(pref("pkmMethod") === "para" && !isFolder ? [{ label: t("menu-move-para"), icon: <FolderInput />, run: () => queueMicrotask(() => openMenu(e, PARA.map((f) => ({ label: t(`para-${f.slice(2).toLowerCase()}` as "para-projects"), icon: <Folder />, run: () => void moveToPara(n.path, f) })))) }] : []),
      ...(desktop ? [{ label: t("menu-reveal-os"), icon: <FolderSearch />, run: () => void backend.revealInOs(n.path).catch(() => toast(t("menu-failed"))) }] : []),
      { label: t("entry-style-title"), icon: <Palette />, sep: true, run: () => openEntryStyle(n.path) },
      { label: t("action-rename"), icon: <Pencil />, run: () => void promptRename(n) },
      { label: t("action-move-to"), icon: <FolderInput />, run: () => queueMicrotask(() => moveMenu(e, n)) },
      { label: t("action-delete"), icon: <Trash2 />, danger: true, sep: true, run: () => void confirmTrash(n) },
    ]);
  };

  /** Every way to copy a reference to a file or folder. */
  const copyMenu = (e: MouseEvent | { clientX: number; clientY: number }, n: TreeNode) => {
    const name = n.path.split("/").pop()!;
    const bare = n.kind === "markdown" ? n.path.replace(/\.md$/i, "") : n.path;
    const enc = n.path.split("/").map(encodeURIComponent).join("/");
    const fromActive = () => {
      const cur = activePath();
      if (!cur || cur.startsWith("app:")) return n.path;
      const from = cur.split("/").slice(0, -1), to = n.path.split("/");
      let i = 0;
      while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
      return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/") || name;
    };
    openMenu(e, [
      ...(n.kind !== "folder" ? [
        { label: t("copy-link-wiki"), icon: <Link />, run: () => void copyText(`[[${bare}]]`) },
        { label: t("copy-link-markdown"), icon: <Link />, run: () => void copyText(`[${name.replace(/\.md$/i, "")}](${enc})`) },
        { label: t("copy-link-embed"), icon: <Link />, run: () => void copyText(`![[${n.kind === "markdown" ? bare : n.path}]]`) },
      ] : []),
      { label: t("copy-link-vault"), icon: <Copy />, sep: n.kind !== "folder", run: () => void copyText(n.path) },
      { label: t("copy-link-relative"), icon: <Copy />, run: () => void copyText(fromActive()) },
      { label: t("copy-link-absolute"), icon: <Copy />, run: () => void backend.absPath(n.path).then(copyText) },
      { label: t("copy-link-file-url"), icon: <Copy />, run: () => void backend.absPath(n.path).then((a) => copyText(`file:///${a.replace(/\\/g, "/").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:")}`)) },
      { label: t("copy-link-name"), icon: <Copy />, run: () => void copyText(name.replace(/\.md$/i, "")) },
    ]);
  };

  const collapseAll = () => updateProfile((p) => { p.collapsedFolders = [...tree.folders]; });
  /** Right-click on empty space in the explorer. */
  const areaMenu = (e: MouseEvent) => openMenu(e, [
    { label: t("action-new-note"), icon: <FilePlus />, run: () => void promptNewNote() },
    { label: t("action-new-folder"), icon: <FolderPlus />, run: () => void promptNewFolder() },
    { label: t("action-collapse-all"), icon: <ChevronsDownUp />, sep: true, run: collapseAll },
    ...(inTauri() ? [{ label: t("menu-reveal-vault"), icon: <FolderSearch />, run: () => void backend.revealInOs("") }] : []),
  ]);
  const duplicate = async (path: string) => {
    const base = path.replace(/\.md$/i, "");
    const name = `${base.split("/").pop()} ${t("menu-copy-suffix")}`;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined;
    await createNote(name, folder, await backend.read(path));
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

  const show = (k: DisplayKey) => profile.uiButtons[`explorer.${k}`] ?? k === "updated";
  const needSummaries = () => show("words") || show("backlinks") || show("tags");
  const [summaries] = createResource(
    () => (needSummaries() ? indexRev() + 1 : false),
    async () => new Map((await backend.summaries()).map((x) => [x.path, x])),
    { initialValue: new Map<string, NoteSummary>() },
  );
  const opened = createMemo(() => new Map(profile.recent.map((r) => [r.path, r.openedAt])));
  const metaOf = (path: string, modified: number) => {
    const parts: string[] = [];
    const sum = summaries().get(path);
    if (show("updated")) parts.push(relativeTime(modified, locale()));
    if (show("last-opened") && opened().has(path)) parts.push(`${t("explorer-last-opened")}: ${relativeTime(opened().get(path)!, locale())}`);
    if (show("words") && sum) parts.push(t("status-words", { count: sum.words }));
    if (show("backlinks") && sum?.backlinks) parts.push(t("status-backlinks", { count: sum.backlinks }));
    return parts.join(" · ");
  };
  const displayMenu = (e: MouseEvent) =>
    openMenu(e.currentTarget instanceof HTMLElement ? rectPoint(e.currentTarget) : e, DISPLAY.map((k) => ({
      label: t(`explorer-${k}`),
      checked: show(k),
      run: () => updateProfile((p) => { p.uiButtons[`explorer.${k}`] = !show(k); }),
    })));

  // Drag and drop: drag a note or folder onto a folder (or empty space for the root).
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [dropOn, setDropOn] = createSignal<string | null>(null);
  const DRAG_TYPE = "application/x-nosidian-path";
  const folderFor = (n: TreeNode) => (n.kind === "folder" ? n.path : n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "");
  const onDragStart = (e: DragEvent, n: TreeNode) => {
    e.dataTransfer?.setData(DRAG_TYPE, n.path);
    e.dataTransfer?.setData("text/plain", n.path);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    setDragging(n.path);
  };
  const onDragOver = (e: DragEvent, folder: string) => {
    const from = dragging();
    if (!from && hasOsFiles(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDropOn(folder);
      return;
    }
    if (!from || !canMoveInto(from, folder)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setDropOn(folder);
  };
  const onDrop = (e: DragEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    const from = e.dataTransfer?.getData(DRAG_TYPE) || dragging();
    setDropOn(null);
    setDragging(null);
    if (!from && e.dataTransfer?.files.length) {
      void copyDroppedFiles(e.dataTransfer.files, folder);
      if (folder) toggle(folder, true);
      return;
    }
    if (from && canMoveInto(from, folder)) {
      void moveEntry(from, folder);
      if (folder) toggle(folder, true);
    }
  };
  const endDrag = () => { setDragging(null); setDropOn(null); };
  const moveMenu = (e: { clientX: number; clientY: number }, n: TreeNode) =>
    openMenu(e, ["", ...[...tree.folders].sort()].filter((f) => canMoveInto(n.path, f)).map((f) => ({
      label: f || `/ ${t("files-root")}`,
      icon: <Folder />,
      run: () => void moveEntry(n.path, f),
    })));

  const cycleSort = (e: MouseEvent) =>
    openMenu(e.currentTarget instanceof HTMLElement ? rectPoint(e.currentTarget) : e, SORTS.map((s) => ({
      label: t(`sort-${s}`),
      mark: profile.sort === s,
      run: () => updateProfile((p) => { p.sort = s; }),
    })));

  return (
    <div class="panel files-panel">
      <EntryStyleDialog />
      <HoverPreview />
      <div class="panel-head tools-only" onContextMenu={areaMenu}>
        <h2 class="sr-only">{t("tab-files")}</h2>
        <div class="panel-tools" role="toolbar" aria-label={t("tab-files")}>
          <button class="icon-btn sm" title={t("action-new-note")} aria-label={t("action-new-note")} onClick={() => void promptNewNote()}><FilePlus /></button>
          <button class="icon-btn sm" title={t("action-new-folder")} aria-label={t("action-new-folder")} onClick={() => void promptNewFolder()}><FolderPlus /></button>
          <button class="icon-btn sm" title={`${t("action-sort")}: ${t(`sort-${profile.sort}`)}`} aria-label={t("action-sort")} aria-haspopup="menu" onClick={cycleSort}><ArrowUpDown /></button>
          <button class="icon-btn sm" title={t("explorer-display")} aria-label={t("explorer-display")} aria-haspopup="menu" onClick={displayMenu}><SlidersHorizontal /></button>
          <button class="icon-btn sm" title={t("action-reveal-active")} aria-label={t("action-reveal-active")} onClick={reveal} disabled={!activePath()}><Crosshair /></button>
          <button class="icon-btn sm" title={t("action-collapse-all")} aria-label={t("action-collapse-all")} onClick={collapseAll}><ChevronsDownUp /></button>
        </div>
      </div>
      <Show when={visible().length} fallback={<p class="empty">{t("links-none")}</p>}>
        <ul ref={list} class="tree" classList={{ "drop-root": dropOn() === "" }} role="tree" aria-label={t("tab-files")} onContextMenu={areaMenu}
          onDragOver={(e) => onDragOver(e, "")} onDragLeave={(e) => { if (e.target === e.currentTarget) setDropOn(null); }} onDrop={(e) => onDrop(e, "")}>
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
                  classList={{ active: active(), folder: isFolder, "drop-target": isFolder && dropOn() === n.path, dragging: dragging() === n.path }}
                  draggable={true}
                  onDragStart={(e) => onDragStart(e, n)}
                  onDragEnd={endDrag}
                  onDragOver={(e) => onDragOver(e, folderFor(n))}
                  onDrop={(e) => onDrop(e, folderFor(n))}
                  style={{ "--depth": n.depth }}
                  onClick={() => { setFocused(n.path); activate(n); }}
                  onKeyDown={(e) => onKey(e, n)}
                  onFocus={() => setFocused(n.path)}
                  onContextMenu={(e) => menuFor(e, n)}
                  onMouseMove={(e) => hoverRow(e, n.path)}
                  onMouseLeave={leaveRow}
                  onTouchStart={(e) => onTouchStart(e, n)}
                  onTouchEnd={cancelPress}
                  onTouchMove={cancelPress}
                >
                  <span class="tree-chevron" aria-hidden="true">
                    <Show when={isFolder}>{open() ? <ChevronDown /> : <ChevronRight class="flip-rtl" />}</Show>
                  </span>
                  <span class="tree-icon" aria-hidden="true" style={{ color: entryStyle(n.path)?.color }}>
                    {(() => {
                      const custom = entryStyle(n.path)?.icon;
                      const I = custom ? ENTRY_ICONS[custom] : undefined;
                      if (I) return <Dynamic component={I} />;
                      return isFolder ? (open() ? <FolderOpen /> : <Folder />) : n.kind === "pdf" ? <FileType /> : <FileText />;
                    })()}
                  </span>
                  <span class="tree-label">
                    <span class="tree-name" dir="auto">{n.kind === "markdown" ? noteTitle(n.path) : n.name}</span>
                    <Show when={!isFolder && n.meta && metaOf(n.path, n.meta.modified)}>
                      <span class="tree-meta">{metaOf(n.path, n.meta!.modified)}</span>
                    </Show>
                    <Show when={!isFolder && show("tags") && summaries().get(n.path)?.tags.length}>
                      <span class="tree-tags" dir="auto">{summaries().get(n.path)!.tags.slice(0, 3).map((x) => `#${x}`).join(" ")}</span>
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
