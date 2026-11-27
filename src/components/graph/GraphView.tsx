// Knowledge graph: notes as nodes and [[links]] as edges in a force layout on
// a canvas. Filter, local graph around the open note, grouping and colours,
// node shapes, force sliders and a creation-order timelapse. A list of notes
// with their link counts mirrors the graph for keyboard and screen readers.
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { Pause, Play, Settings2 } from "lucide-solid";
import { t } from "../../i18n";
import { DEFAULT_GRAPH_SETTINGS, GRAPH_PALETTE_PRESETS, computeNodeGroupKey, resolveNoteCreationTimestamp } from "../../core/graphPrefs";
import { extractTags, extractWikilinks } from "../../core/markdown";
import { resolveNoteByLink } from "../../core/knowledge";
import type { GraphSettings, Note } from "../../core/types";
import { corpus, loadAllNotes } from "../../state/corpus";
import { activePath, openNote } from "../../state/vault";
import { noteItemMenu, tagMenu } from "../itemMenus";
import { vaultDoc } from "../../state/persist";
import { noteTitle } from "../../lib/markdown";
import { settings } from "../../state/settings";

type GraphExtra = { showTags: boolean; centerForce: number; layout: "network" | "islands" | "ring" };
const graphPrefs = vaultDoc<GraphSettings & GraphExtra>("graph", () => ({ ...DEFAULT_GRAPH_SETTINGS, customPalette: [...DEFAULT_GRAPH_SETTINGS.customPalette], showTags: false, centerForce: 2, layout: "network" }));

interface N { id: string; label: string; note?: Note; tag?: boolean; x: number; y: number; vx: number; vy: number; deg: number; group: string; created: number }
interface E { a: N; b: N }

export default function GraphView() {
  let canvas!: HTMLCanvasElement;
  const [filter, setFilter] = createSignal("");
  const [panel, setPanel] = createSignal(false);
  const [hover, setHover] = createSignal<N | null>(null);
  const [lapse, setLapse] = createSignal<number | null>(null);
  const view = { x: 0, y: 0, k: 1 };
  const g = () => graphPrefs.state;
  onMount(() => void loadAllNotes());

  const graph = createMemo(() => {
    const notes = corpus();
    const byPath = new Map<string, N>();
    const nodes: N[] = [];
    const edges: E[] = [];
    notes.forEach((n, i) => {
      const node: N = { id: n.path, label: noteTitle(n.path), note: n, x: Math.cos(i) * 200 * Math.random(), y: Math.sin(i) * 200 * Math.random(), vx: 0, vy: 0, deg: 0, group: "", created: resolveNoteCreationTimestamp(n, i) };
      byPath.set(n.path, node);
      nodes.push(node);
    });
    const seen = new Set<string>();
    const tagNodes = new Map<string, N>();
    for (const n of notes) {
      const a = byPath.get(n.path)!;
      for (const target of extractWikilinks(n.content)) {
        const hit = resolveNoteByLink(notes, target);
        if (!hit || hit.path === n.path) continue;
        const key = [n.path, hit.path].sort().join("\u0000");
        if (seen.has(key)) continue;
        seen.add(key);
        const b = byPath.get(hit.path)!;
        edges.push({ a, b }); a.deg++; b.deg++;
      }
      if (g().showTags) for (const tag of extractTags(n)) {
        let tn = tagNodes.get(tag);
        if (!tn) { tn = { id: `#${tag}`, label: `#${tag}`, tag: true, x: Math.random() * 300 - 150, y: Math.random() * 300 - 150, vx: 0, vy: 0, deg: 0, group: "#tags", created: 0 }; tagNodes.set(tag, tn); nodes.push(tn); }
        edges.push({ a, b: tn }); a.deg++; tn.deg++;
      }
    }
    for (const n of nodes) if (n.note) n.group = computeNodeGroupKey(n.note, n.deg, g().groupBy);
    return { nodes, edges };
  });

  /** Nodes shown after filters (search, orphans, local graph, timelapse). */
  const visible = createMemo(() => {
    const { nodes, edges } = graph();
    let set = new Set(nodes);
    const q = filter().trim().toLowerCase();
    if (q) set = new Set(nodes.filter((n) => n.label.toLowerCase().includes(q) || n.note?.content.toLowerCase().includes(q)));
    if (!g().showOrphans) set = new Set([...set].filter((n) => n.deg > 0));
    if (g().localOnly && activePath()) {
      const center = nodes.find((n) => n.id === activePath());
      if (center) {
        const keep = new Set<N>([center]);
        for (let depth = 0; depth < 2; depth++) for (const e of edges) { if (keep.has(e.a)) keep.add(e.b); else if (keep.has(e.b)) keep.add(e.a); }
        set = new Set([...set].filter((n) => keep.has(n)));
      }
    }
    const l = lapse();
    if (l !== null) {
      const order = [...set].filter((n) => n.note).sort((a, b) => a.created - b.created);
      const shown = new Set(order.slice(0, l));
      set = new Set([...set].filter((n) => !n.note || shown.has(n)));
    }
    return { nodes: [...set], edges: edges.filter((e) => set.has(e.a) && set.has(e.b)) };
  });

  const groups = createMemo(() => [...new Set(graph().nodes.map((n) => n.group))]);
  const palette = () => (g().colorMode === "custom" ? g().customPalette : GRAPH_PALETTE_PRESETS[0].colors);
  const colorOf = (n: N, maxDeg: number, minT: number, maxT: number) => {
    if (n.tag) return "#94a3b8";
    if (g().colorMode === "monochrome") return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b7ddd";
    if (g().colorMode === "heatmap") return `hsl(${220 - (n.deg / Math.max(1, maxDeg)) * 200},75%,58%)`;
    if (g().colorMode === "age") return `hsl(${200 + ((n.created - minT) / Math.max(1, maxT - minT)) * 120},65%,60%)`;
    const pal = palette();
    return pal[Math.max(0, groups().indexOf(n.group)) % pal.length];
  };

  // ---------- Simulation + drawing ----------
  let raf = 0, alpha = 1, dragging: N | null = null, panning = false, last = { x: 0, y: 0 };
  createEffect(on(visible, () => { alpha = 1; }));
  const step = () => {
    const { nodes, edges } = visible();
    if (alpha > 0.02 && !settings.accessibility.reduceMotion) {
      const rep = g().repulsion, dist = g().linkDistance;
      // How strongly nodes are pulled in: low spreads the graph out, high packs it in the middle.
      const pull = ((g().centerForce ?? 2) / 1000) * alpha;
      const layout = g().layout ?? "network";
      const gs = groups();
      const ring = 160 + gs.length * 26;
      const anchor = (n: N): [number, number] => {
        if (layout !== "islands" || gs.length < 2) return [0, 0];
        const a = (Math.max(0, gs.indexOf(n.group)) / gs.length) * Math.PI * 2;
        return [Math.cos(a) * ring, Math.sin(a) * ring];
      };
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random(); dy = Math.random(); d2 = 1; }
          if (d2 > 360000) continue;
          const f = (rep * alpha) / d2;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
        if (layout === "ring") {
          // Keep every node near a circle whose size follows the node count.
          const r = Math.sqrt(a.x * a.x + a.y * a.y) || 1, target = 80 + nodes.length * 4;
          const k = ((r - target) / r) * pull * 6;
          a.vx -= a.x * k; a.vy -= a.y * k;
        } else {
          const [ax, ay] = anchor(a);
          const k = layout === "islands" ? pull * 4 : pull;
          a.vx -= (a.x - ax) * k; a.vy -= (a.y - ay) * k;
        }
      }
      for (const e of edges) {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - dist) / d) * 0.04 * alpha;
        e.a.vx += dx * f; e.a.vy += dy * f; e.b.vx -= dx * f; e.b.vy -= dy * f;
      }
      for (const n of nodes) { if (n === dragging) continue; n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy; }
      alpha *= 0.985;
    }
    draw();
    raf = requestAnimationFrame(step);
  };

  const radius = (n: N) => (n.tag ? 4 : g().nodeSize + (g().scaleByDegree ? Math.sqrt(n.deg) * 2.2 : 0));
  const shape = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    switch (g().nodeShape) {
      case "square": ctx.rect(x - r, y - r, r * 2, r * 2); break;
      case "diamond": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
      case "triangle": ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); break;
      case "hexagon": for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; ctx[i ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); break;
      default: ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  };

  function draw() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2 + view.x, h / 2 + view.y);
    ctx.scale(view.k, view.k);
    const { nodes, edges } = visible();
    const hv = hover();
    const near = new Set<N>();
    if (hv) for (const e of edges) { if (e.a === hv) near.add(e.b); if (e.b === hv) near.add(e.a); }
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--text-secondary").trim() || "#aaa";
    const edgeCol = css.getPropertyValue("--text-muted").trim() || "#888";
    ctx.lineWidth = g().edgeWidth / view.k;
    for (const e of edges) {
      const lit = hv && (e.a === hv || e.b === hv);
      ctx.globalAlpha = lit ? 0.9 : hv ? g().edgeOpacity * 0.4 : g().edgeOpacity;
      ctx.strokeStyle = lit ? css.getPropertyValue("--accent").trim() : edgeCol;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
    }
    const maxDeg = Math.max(1, ...nodes.map((n) => n.deg));
    const times = nodes.filter((n) => n.note).map((n) => n.created);
    const minT = Math.min(...times), maxT = Math.max(...times);
    const active = activePath();
    for (const n of nodes) {
      const dim = hv && n !== hv && !near.has(n);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = colorOf(n, maxDeg, minT, maxT);
      const r = radius(n);
      shape(ctx, n.x, n.y, r);
      ctx.fill();
      if (n.id === active) { ctx.lineWidth = 2.5 / view.k; ctx.strokeStyle = css.getPropertyValue("--text-primary").trim(); ctx.stroke(); }
      if (view.k > 0.55 || n === hv || near.has(n)) {
        ctx.fillStyle = text;
        ctx.font = `${g().labelFontSize / Math.max(0.8, view.k)}px var(--font-ui, sans-serif)`;
        ctx.textAlign = "center";
        ctx.fillText(n.label.length > 32 ? `${n.label.slice(0, 31)}…` : n.label, n.x, n.y + r + 12 / view.k);
      }
    }
    ctx.globalAlpha = 1;
  }

  const toWorld = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - r.width / 2 - view.x) / view.k, y: (e.clientY - r.top - r.height / 2 - view.y) / view.k };
  };
  const pick = (e: MouseEvent) => {
    const p = toWorld(e);
    return visible().nodes.find((n) => (n.x - p.x) ** 2 + (n.y - p.y) ** 2 <= (radius(n) + 4) ** 2) ?? null;
  };
  let moved = false;
  const down = (e: PointerEvent) => { if (e.button !== 0) return; canvas.setPointerCapture(e.pointerId); dragging = pick(e); panning = !dragging; last = { x: e.clientX, y: e.clientY }; moved = false; };
  const move = (e: PointerEvent) => {
    if (dragging) { const p = toWorld(e); dragging.x = p.x; dragging.y = p.y; alpha = Math.max(alpha, 0.3); moved = true; }
    else if (panning) { view.x += e.clientX - last.x; view.y += e.clientY - last.y; moved = moved || Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 2; }
    else setHover(pick(e));
    last = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = dragging;
    dragging = null; panning = false;
    if (!moved) { const n = hit ?? pick(e); if (n?.note) openNote(n.note.path); else if (n?.tag) window.dispatchEvent(new CustomEvent("nosidian:search", { detail: n.label })); }
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; view.k = Math.min(4, Math.max(0.15, view.k * f)); };

  // Timelapse: reveal notes in creation order.
  let lapseTimer: ReturnType<typeof setInterval> | undefined;
  const toggleLapse = () => {
    if (lapse() !== null) { clearInterval(lapseTimer); setLapse(null); return; }
    setLapse(0);
    const total = graph().nodes.filter((n) => n.note).length;
    lapseTimer = setInterval(() => { const n = (lapse() ?? 0) + 1; if (n > total) { clearInterval(lapseTimer); setLapse(null); } else setLapse(n); }, Math.max(60, 4000 / Math.max(1, total)));
  };

  onMount(() => { raf = requestAnimationFrame(step); });
  onCleanup(() => { cancelAnimationFrame(raf); clearInterval(lapseTimer); });

  const set = <K extends keyof (GraphSettings & GraphExtra)>(k: K, v: (GraphSettings & GraphExtra)[K]) => { graphPrefs.update((s) => { (s as unknown as Record<string, unknown>)[k] = v; }); alpha = Math.max(alpha, 0.6); };
  const slider = (k: "repulsion" | "linkDistance" | "nodeSize" | "edgeWidth" | "edgeOpacity" | "labelFontSize" | "centerForce", min: number, max: number, stepv = 1) => (
    <label class="mixer-row"><span>{t(`graph-${k.toLowerCase()}` as "graph-repulsion")}</span><input type="range" min={min} max={max} step={stepv} value={g()[k]} onInput={(e) => set(k, Number(e.currentTarget.value))} /></label>
  );

  return (
    <div class="graph-view">
      <div class="graph-bar">
        <input class="input sm" type="search" placeholder={t("graph-filter")} aria-label={t("graph-filter")} value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
        <label class="check"><input type="checkbox" checked={g().localOnly} onChange={(e) => set("localOnly", e.currentTarget.checked)} />{t("graph-local")}</label>
        <span class="muted">{t("graph-count", { nodes: visible().nodes.length, links: visible().edges.length })}</span>
        <span class="tb-fill" />
        <button class="icon-btn" aria-pressed={lapse() !== null} title={t("graph-timelapse")} aria-label={t("graph-timelapse")} onClick={toggleLapse}>{lapse() !== null ? <Pause /> : <Play />}</button>
        <button class="icon-btn" aria-pressed={panel()} title={t("graph-settings")} aria-label={t("graph-settings")} onClick={() => setPanel(!panel())}><Settings2 /></button>
      </div>
      <div class="graph-body">
        <canvas ref={canvas} class="graph-canvas" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setHover(null)} onWheel={wheel}
          onContextMenu={(e) => { const n = pick(e); if (n?.note) noteItemMenu(e, n.note.path); else if (n?.tag) tagMenu(e, n.label.replace(/^#/, "")); else e.preventDefault(); }} />
        <Show when={hover()}>{(n) => <div class="graph-tip glass-modal" dir="auto">{n().label} · {t("graph-links", { count: n().deg })}</div>}</Show>
        <Show when={panel()}>
          <aside class="graph-panel glass-modal stack" aria-label={t("graph-settings")}>
            <label class="check"><input type="checkbox" checked={g().showOrphans} onChange={(e) => set("showOrphans", e.currentTarget.checked)} />{t("graph-orphans")}</label>
            <label class="check"><input type="checkbox" checked={g().showTags} onChange={(e) => set("showTags", e.currentTarget.checked)} />{t("graph-tags")}</label>
            <label class="check"><input type="checkbox" checked={g().scaleByDegree} onChange={(e) => set("scaleByDegree", e.currentTarget.checked)} />{t("graph-scale-degree")}</label>
            <label class="field inline"><span>{t("graph-group")}</span>
              <select class="select sm" value={g().groupBy} onChange={(e) => set("groupBy", e.currentTarget.value as GraphSettings["groupBy"])}>
                <For each={["none", "folder", "tag", "degree", "created"] as const}>{(x) => <option value={x}>{t(`graph-group-${x}`)}</option>}</For>
              </select>
            </label>
            <label class="field inline"><span>{t("graph-color")}</span>
              <select class="select sm" value={g().colorMode} onChange={(e) => set("colorMode", e.currentTarget.value as GraphSettings["colorMode"])}>
                <For each={["group", "heatmap", "age", "monochrome", "custom"] as const}>{(x) => <option value={x}>{t(`graph-color-${x}`)}</option>}</For>
              </select>
            </label>
            <Show when={g().colorMode === "custom"}>
              <div class="row">
                <For each={GRAPH_PALETTE_PRESETS}>{(p) => <button class="swatch-row" title={p.label} aria-label={p.label} onClick={() => set("customPalette", [...p.colors])}><For each={p.colors.slice(0, 4)}>{(c) => <span style={{ background: c }} />}</For></button>}</For>
              </div>
            </Show>
            <label class="field inline"><span>{t("graph-shape")}</span>
              <select class="select sm" value={g().nodeShape} onChange={(e) => set("nodeShape", e.currentTarget.value as GraphSettings["nodeShape"])}>
                <For each={["circle", "square", "diamond", "hexagon", "triangle"] as const}>{(x) => <option value={x}>{t(`graph-shape-${x}`)}</option>}</For>
              </select>
            </label>
            <label class="field inline"><span>{t("graph-layout")}</span>
              <select class="select sm" value={g().layout ?? "network"} onChange={(e) => { set("layout", e.currentTarget.value as GraphExtra["layout"]); alpha = 1; }}>
                <For each={["network", "islands", "ring"] as const}>{(x) => <option value={x}>{t(`graph-layout-${x}`)}</option>}</For>
              </select>
            </label>
            {slider("repulsion", 200, 3000, 20)}
            {slider("linkDistance", 30, 480, 5)}
            {slider("centerForce", 0, 12, 0.5)}
            <button class="btn sm" onClick={() => { for (const n of visible().nodes) { n.x = (Math.random() - 0.5) * 400; n.y = (Math.random() - 0.5) * 400; n.vx = 0; n.vy = 0; } alpha = 1; }}>{t("graph-rearrange")}</button>
            {slider("nodeSize", 4, 16)}
            {slider("edgeWidth", 0.5, 6, 0.1)}
            {slider("edgeOpacity", 0.1, 0.9, 0.05)}
            {slider("labelFontSize", 9, 16)}
          </aside>
        </Show>
      </div>
      <ul class="sr-only" aria-label={t("view-graph")}>
        <For each={visible().nodes.filter((n) => n.note).slice(0, 300)}>{(n) => <li><button onClick={() => openNote(n.note!.path)}>{n.label}, {t("graph-links", { count: n.deg })}</button></li>}</For>
      </ul>
    </div>
  );
}
