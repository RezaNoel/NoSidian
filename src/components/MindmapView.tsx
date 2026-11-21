// Mind map of a note's headings and bullets: pan by dragging, zoom with the
// wheel, buttons or a pinch, collapse branches, and jump to a node's line.
// A nested tree list mirrors the map for keyboard and screen reader users.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Maximize2, Minus, Plus } from "lucide-solid";
import { t } from "../i18n";
import { buildMindmapTree } from "../core/knowledge";
import { parseFrontmatter } from "../core/markdown";
import type { MindmapNode } from "../core/types";
import { contents } from "../state/vault";
import { updateProfile } from "../state/workspace";
import { revealLine } from "./Editor";

interface Placed { node: MindmapNode; x: number; y: number; w: number; depth: number; parent?: Placed }
const ROW = 40, GAP_X = 56, CHAR = 7.4;
const width = (s: string) => Math.min(240, Math.max(60, s.length * CHAR + 26));

export function MindmapView(props: { path: string }) {
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
  const [view, setView] = createSignal({ x: 40, y: 0, k: 1 });
  let svg!: SVGSVGElement;

  const root = createMemo(() => buildMindmapTree({ path: props.path, content: contents[props.path] ?? "" }));
  const bodyOffset = createMemo(() => {
    const src = contents[props.path] ?? "";
    return src.slice(0, src.length - parseFrontmatter(src).body.length).split("\n").length - 1;
  });

  const layout = createMemo(() => {
    const out: Placed[] = [];
    const colX: number[] = [];
    const maxW: number[] = [];
    const visit = (n: MindmapNode, d: number) => { maxW[d] = Math.max(maxW[d] ?? 0, width(n.text)); if (!collapsed().has(n.id)) n.children.forEach((c) => visit(c, d + 1)); };
    visit(root(), 0);
    colX[0] = 0;
    for (let d = 1; d < maxW.length; d++) colX[d] = colX[d - 1] + maxW[d - 1] + GAP_X;
    let row = 0;
    const place = (n: MindmapNode, d: number, parent?: Placed): Placed => {
      const p: Placed = { node: n, x: colX[d], y: 0, w: width(n.text), depth: d, parent };
      out.push(p);
      const kids = collapsed().has(n.id) ? [] : n.children.map((c) => place(c, d + 1, p));
      p.y = kids.length ? (kids[0].y + kids[kids.length - 1].y) / 2 : row++ * ROW;
      return p;
    };
    place(root(), 0);
    return out;
  });

  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const jump = (n: MindmapNode) => {
    const m = /^[hl]-(\d+)$/.exec(n.id);
    if (!m) return;
    updateProfile((p) => { p.noteModes[props.path] = "editor"; });
    revealLine(props.path, Number(m[1]) + bodyOffset());
  };
  const zoom = (f: number, cx = svg.clientWidth / 2, cy = svg.clientHeight / 2) => setView((v) => {
    const k = Math.min(3, Math.max(0.25, v.k * f));
    return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
  });
  const fit = () => {
    const l = layout();
    const w = Math.max(...l.map((p) => p.x + p.w)) + 40, h = Math.max(...l.map((p) => p.y)) + ROW * 2;
    const k = Math.min(1.4, Math.max(0.25, Math.min(svg.clientWidth / w, svg.clientHeight / h)));
    setView({ k, x: 20, y: (svg.clientHeight - (h - ROW) * k) / 2 + ROW * k / 2 });
  };

  // Pointer pan and two-finger pinch.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const down = (e: PointerEvent) => { if ((e.target as Element).closest(".mm-node")) return; svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const move = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { const r = svg.getBoundingClientRect(); zoom(dist / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      pinch = dist;
      return;
    }
    setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  };
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
  const wheel = (e: WheelEvent) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); };

  const TreeList = (p: { node: MindmapNode; level: number }) => (
    <li role="treeitem" aria-level={p.level} aria-expanded={p.node.children.length ? !collapsed().has(p.node.id) : undefined}>
      <button class="mm-tree-btn" onClick={() => jump(p.node)} onKeyDown={(e) => { if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && p.node.children.length) { e.preventDefault(); toggle(p.node.id); } }}>{p.node.text}</button>
      <Show when={p.node.children.length && !collapsed().has(p.node.id)}>
        <ul role="group"><For each={p.node.children}>{(c) => <TreeList node={c} level={p.level + 1} />}</For></ul>
      </Show>
    </li>
  );

  return (
    <div class="mindmap">
      <div class="mm-tools" role="toolbar" aria-label={t("mindmap-label")}>
        <button class="icon-btn" title={t("pdf-zoom-in")} aria-label={t("pdf-zoom-in")} onClick={() => zoom(1.2)}><Plus /></button>
        <button class="icon-btn" title={t("pdf-zoom-out")} aria-label={t("pdf-zoom-out")} onClick={() => zoom(1 / 1.2)}><Minus /></button>
        <button class="icon-btn" title={t("mindmap-fit")} aria-label={t("mindmap-fit")} onClick={fit}><Maximize2 /></button>
      </div>
      <svg ref={svg} class="mm-canvas" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onDblClick={fit}>
        <g transform={`translate(${view().x} ${view().y}) scale(${view().k})`}>
          <For each={layout().filter((p) => p.parent)}>
            {(p) => {
              const a = p.parent!;
              const x1 = a.x + a.w, y1 = a.y, x2 = p.x, y2 = p.y, mx = (x1 + x2) / 2;
              return <path class="mm-edge" d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} data-depth={Math.min(p.depth, 5)} />;
            }}
          </For>
          <For each={layout()}>
            {(p) => (
              <g class="mm-node" data-depth={Math.min(p.depth, 5)} transform={`translate(${p.x} ${p.y - 15})`} onClick={() => jump(p.node)}>
                <rect width={p.w} height="30" rx="10" />
                <text x={p.w / 2} y="19" text-anchor="middle">{p.node.text.length > 30 ? `${p.node.text.slice(0, 29)}…` : p.node.text}</text>
                <Show when={p.node.children.length}>
                  <g class="mm-toggle" transform={`translate(${p.w + 2} 15)`} onClick={(e) => { e.stopPropagation(); toggle(p.node.id); }}>
                    <circle r="8" /><text y="4" text-anchor="middle">{collapsed().has(p.node.id) ? "+" : "−"}</text>
                  </g>
                </Show>
              </g>
            )}
          </For>
        </g>
      </svg>
      <ul class="sr-only-focusable mm-tree" role="tree" aria-label={t("mindmap-label")}><TreeList node={root()} level={1} /></ul>
    </div>
  );
}
