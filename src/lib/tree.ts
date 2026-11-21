// Builds the explorer tree from a flat vault scan.
import type { NoteMeta, SortMode } from "../state/types";

export interface TreeNode {
  name: string;
  path: string;
  kind: "folder" | "markdown" | "pdf";
  depth: number;
  meta?: NoteMeta;
  children: TreeNode[];
  /** Newest modified/created among descendants, for folder sorting by date. */
  modified: number;
  created: number;
}

function compare(sort: SortMode): (a: TreeNode, b: TreeNode) => number {
  const name = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  switch (sort) {
    case "name-desc": return (a, b) => name(b, a);
    case "modified-new": return (a, b) => b.modified - a.modified || name(a, b);
    case "modified-old": return (a, b) => a.modified - b.modified || name(a, b);
    case "created-new": return (a, b) => b.created - a.created || name(a, b);
    case "created-old": return (a, b) => a.created - b.created || name(a, b);
    default: return name;
  }
}

export function buildTree(notes: NoteMeta[], folders: string[], sort: SortMode): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", depth: -1, children: [], modified: 0, created: 0 };
  const byPath = new Map<string, TreeNode>([["", root]]);
  const folder = (path: string): TreeNode => {
    const hit = byPath.get(path);
    if (hit) return hit;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parent = folder(parentPath);
    const node: TreeNode = { name: path.slice(parentPath ? parentPath.length + 1 : 0), path, kind: "folder", depth: parent.depth + 1, children: [], modified: 0, created: 0 };
    parent.children.push(node);
    byPath.set(path, node);
    return node;
  };
  folders.forEach(folder);
  for (const n of notes) {
    const parentPath = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "";
    const parent = folder(parentPath);
    parent.children.push({ name: n.path.slice(parentPath ? parentPath.length + 1 : 0), path: n.path, kind: n.kind, depth: parent.depth + 1, meta: n, children: [], modified: n.modified, created: n.created });
  }
  const aggregate = (n: TreeNode) => {
    for (const c of n.children) {
      if (c.kind === "folder") aggregate(c);
      n.modified = Math.max(n.modified, c.modified);
      n.created = Math.max(n.created, c.created);
    }
  };
  aggregate(root);
  const cmp = compare(sort);
  const order = (list: TreeNode[]) => {
    list.sort((a, b) => (a.kind === "folder") === (b.kind === "folder") ? cmp(a, b) : a.kind === "folder" ? -1 : 1);
    list.forEach((n) => order(n.children));
  };
  order(root.children);
  return root.children;
}

/** Depth-first list of nodes that are visible given the collapsed folders. */
export function visibleNodes(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.kind === "folder" && !collapsed.has(n.path)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** "5 min ago" style relative time using the platform's localized formatter. */
export function relativeTime(ms: number, lang: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const s = Math.round((ms - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), "month");
  return rtf.format(Math.round(s / (86400 * 365)), "year");
}
