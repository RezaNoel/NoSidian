// Background weather drawn on one canvas above the UI (it never takes clicks).
// Snow and leaves settle into a pile at the bottom of the window, capped in
// height; rain runs to the middle and gathers as a puddle whose size follows
// the same "pile at the bottom" setting. Moving the mouse along the bottom
// shovels snow, sweeps leaves (the pointer turns into a shovel or a broom) or
// stirs the water. Off with reduced motion.
import { Show, createEffect, on, onCleanup } from "solid-js";
import { ambient } from "../../state/focus";
import { settings } from "../../state/settings";

interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; s: number; hue: number; kicked?: boolean }
interface Leaf { x: number; y: number; r: number; a: number; hue: number }

const COL = 3; // pile column width in px

// Pointer shapes while sweeping (Lucide shovel and broom, outlined so they show on any background).
const cursorSvg = (paths: string[]) => {
  const d = paths.map((p) => `<path d='${p}'/>`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='white' stroke-width='4'>${d}</g><g stroke='%231b1f27' stroke-width='1.8'>${d}</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
};
const SHOVEL = cursorSvg([
  "M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0z",
  "M3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293z",
  "m9 15 7.879-7.878",
]);
const BROOM = cursorSvg([
  "M13.5 10.5 22 2",
  "M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z",
  "m5 18 2-2",
  "m7.699 10.7 5.602 5.601",
]);
function setSweepCursor(tool: "shovel" | "broom" | null) {
  const root = document.documentElement;
  if ((root.dataset.sweep ?? "") === (tool ?? "")) return;
  if (tool) { root.dataset.sweep = tool; root.style.setProperty("--sweep-cursor", `${tool === "shovel" ? SHOVEL : BROOM} ${tool === "shovel" ? "4 28" : "4 21"}, auto`); }
  else { delete root.dataset.sweep; root.style.removeProperty("--sweep-cursor"); }
}

const LEAF_COLOR = (kind: string, hue: number, alpha = 0.92) =>
  kind === "sakura" ? `hsla(${335 + hue * 12},80%,${80 + hue * 6}%,${alpha})` : `hsla(${12 + hue * 34},${70 + hue * 15}%,${42 + hue * 12}%,${alpha})`;

function spawn(kind: string, w: number, h: number, initial: boolean): P {
  const rnd = Math.random;
  const p: P = { x: rnd() * w, y: initial ? rnd() * h : -10, vx: 0, vy: 0, r: 1, a: rnd() * Math.PI * 2, s: rnd() * 0.02 + 0.01, hue: rnd() };
  switch (kind) {
    case "snow": p.r = rnd() * 2.4 + 0.9; p.vy = rnd() * 0.6 + 0.35; break;
    case "autumn": case "sakura": p.r = rnd() * 4 + 3.5; p.vy = rnd() * 0.7 + 0.45; break;
    case "rain": p.r = rnd() * 10 + 9; p.vy = rnd() * 6 + 8; break;
    case "fireflies": p.r = rnd() * 1.8 + 1; p.y = rnd() * h; p.vx = (rnd() - 0.5) * 0.4; p.vy = (rnd() - 0.5) * 0.4; break;
    case "starfield": p.r = rnd() * 1.4 + 0.3; p.y = rnd() * h; break;
    case "embers": p.r = rnd() * 2 + 1; p.y = initial ? rnd() * h : h + 10; p.vy = -(rnd() * 0.9 + 0.4); break;
  }
  return p;
}

export function AmbientOverlay() {
  const kindNow = () => (ambient.state.effect === "aurora" ? "none" : ambient.state.effect);
  const on_ = () => settings.ambientEffectsEnabled && !settings.accessibility.reduceMotion && kindNow() !== "none";
  return (
    <Show when={on_()}>
      {(() => {
        let canvas!: HTMLCanvasElement;
        let raf = 0;
        let parts: P[] = [];
        let heights = new Float32Array(0); // pile height per column (snow, leaves)
        let leaves: Leaf[] = []; // settled leaves, drawn on the pile
        let wave = new Float32Array(0), waveV = new Float32Array(0); // water surface (rain)
        let water = 0; // depth of the puddle at its middle, in px
        let splashes: P[] = [];
        let w = 0, h = 0;
        const mouse = { x: -1, y: -1, px: -1, py: -1 };
        const piling = () => ambient.state.maxPileHeight > 0;
        const cap = () => Math.max(0, Math.min(80, ambient.state.maxPileHeight));

        const resize = () => {
          w = canvas.width = innerWidth;
          h = canvas.height = innerHeight;
          const cols = Math.ceil(w / COL) + 1;
          if (heights.length !== cols) { heights = new Float32Array(cols); wave = new Float32Array(cols); waveV = new Float32Array(cols); leaves = []; }
        };
        const reset = () => {
          const kind = kindNow();
          resize();
          heights.fill(0); wave.fill(0); waveV.fill(0); leaves = []; water = 0; splashes = [];
          const n = Math.round((ambient.state.density / 100) * (kind === "rain" ? 220 : kind === "starfield" ? 260 : 140));
          parts = Array.from({ length: n }, () => spawn(kind, w, h, true));
        };
        createEffect(on(() => [kindNow(), ambient.state.density], () => queueMicrotask(reset)));

        const colAt = (x: number) => Math.max(0, Math.min(heights.length - 1, Math.round(x / COL)));
        const groundAt = (x: number) => h - heights[colAt(x)];

        // The puddle: a shallow lens in the middle that widens as it deepens.
        // At the deepest the setting allows, it spans about 70% of the window.
        const maxWater = () => cap() * 0.6;
        const halfWidth = () => (maxWater() > 0 ? (water / maxWater()) * w * 0.35 + (water > 0 ? 40 : 0) : 0);
        const depthAt = (x: number) => {
          const hw = halfWidth();
          if (hw <= 0) return 0;
          const u = (x - w / 2) / hw;
          return u <= -1 || u >= 1 ? 0 : water * (1 - u * u);
        };

        /** Add material to the pile around x, spread over a few columns. */
        const deposit = (x: number, amount: number, spread: number) => {
          const c = colAt(x), m = cap();
          for (let i = -spread; i <= spread; i++) {
            const j = c + i;
            if (j < 0 || j >= heights.length) continue;
            const f = 1 - Math.abs(i) / (spread + 1);
            heights[j] = Math.min(m, heights[j] + amount * f);
          }
        };

        /** Let steep steps slide down so the pile stays soft. */
        const settle = () => {
          for (let i = 1; i < heights.length; i++) {
            const d = heights[i] - heights[i - 1];
            if (Math.abs(d) > 0.7) { const move = d * 0.3; heights[i] -= move; heights[i - 1] += move; }
          }
        };

        /** Mouse sweeps: lower the pile under a fast-moving pointer and throw some back into the air. */
        const sweep = (kind: string) => {
          if (mouse.px < 0) return;
          const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py;
          const speed = Math.hypot(dx, dy);
          mouse.px = mouse.x; mouse.py = mouse.y;
          // Even a slow, careful stroke moves something.
          if (speed < 0.3) return;
          const reach = kind === "rain" ? depthAt(mouse.x) + 24 : cap() + 22;
          if (mouse.y < h - reach) return;
          const radius = 26 + Math.min(40, speed);
          if (kind === "rain") {
            if (depthAt(mouse.x) <= 0) return;
            const c = colAt(mouse.x);
            for (let i = -8; i <= 8; i++) { const j = c + i; if (j >= 0 && j < waveV.length) waveV[j] += (dx > 0 ? 1 : -1) * Math.min(6, speed * 0.25) * (1 - Math.abs(i) / 9); }
            return;
          }
          const c0 = colAt(mouse.x - radius), c1 = colAt(mouse.x + radius);
          let removed = 0;
          const strength = Math.max(1.4, speed * 0.45);
          for (let j = c0; j <= c1; j++) {
            const f = 1 - Math.abs(j * COL - mouse.x) / radius;
            if (f <= 0) continue;
            const take = Math.min(heights[j], strength * f);
            heights[j] -= take;
            removed += take;
          }
          const dir = dx === 0 ? 1 : Math.sign(dx);
          if (kind === "snow") {
            // A little snow flies off the shovel; most of what is moved is gone.
            const n = Math.min(14, Math.round(removed * 0.2));
            for (let i = 0; i < n; i++) {
              splashes.push({ x: mouse.x + (Math.random() - 0.5) * radius, y: h - Math.random() * cap() * 0.6, vx: dir * (Math.random() * speed * 0.18 + 0.5), vy: -(Math.random() * 3 + 1), r: Math.random() * 1.8 + 0.8, a: 0, s: 0, hue: 0, kicked: true });
            }
          } else {
            // Leaves under the pointer take off.
            leaves = leaves.filter((l) => {
              if (Math.abs(l.x - mouse.x) > radius || l.y < h - cap() - 12) return true;
              splashes.push({ x: l.x, y: l.y, vx: dir * (Math.random() * speed * 0.15 + 1), vy: -(Math.random() * 3.5 + 1.5), r: l.r, a: l.a, s: 0.05, hue: l.hue, kicked: true });
              return false;
            });
          }
          if (splashes.length > 600) splashes.splice(0, splashes.length - 600);
        };

        const drawLeaf = (ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, a: number, hue: number) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(a);
          ctx.fillStyle = LEAF_COLOR(kind, hue);
          ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        };

        const frame = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const kind = kindNow();
          const wind = ambient.state.wind * 0.12;
          ctx.clearRect(0, 0, w, h);
          sweep(kind);
          const pile = piling() && (kind === "snow" || kind === "autumn" || kind === "sakura");
          const pool = piling() && kind === "rain";

          for (const p of parts) {
            p.a += p.s * 3;
            if (kind === "fireflies") { p.vx += (Math.random() - 0.5) * 0.05; p.vy += (Math.random() - 0.5) * 0.05; p.vx *= 0.98; p.vy *= 0.98; }
            if (kind !== "starfield") { p.x += p.vx + wind + (kind === "snow" || kind === "sakura" || kind === "autumn" ? Math.sin(p.a) * 0.4 : 0); p.y += p.vy; }
            let landed = false;
            if (pile && p.y >= groundAt(p.x) - p.r * 0.5 && p.x >= 0 && p.x <= w) {
              if (kind === "snow") deposit(p.x, p.r * 0.9, 4);
              else if (heights[colAt(p.x)] < cap() - 2) {
                leaves.push({ x: p.x, y: groundAt(p.x) - p.r * 0.3, r: p.r, a: p.a, hue: p.hue });
                deposit(p.x, p.r * 0.22, Math.round(p.r / COL));
                if (leaves.length > 900) leaves.splice(0, leaves.length - 900);
              }
              landed = true;
            } else if (pool && p.y >= h - depthAt(p.x)) {
              // Every drop runs to the middle; the puddle deepens up to the setting.
              water = Math.min(maxWater(), water + 0.006);
              const inside = depthAt(p.x) > 0;
              const c = colAt(p.x);
              if (inside && c < waveV.length) waveV[c] -= 0.6;
              if (Math.random() < 0.25) splashes.push({ x: p.x, y: h - depthAt(p.x), vx: (Math.random() - 0.5) * 1.6, vy: -(Math.random() * 1.6 + 0.6), r: 1, a: 0, s: 0, hue: 0, kicked: true });
              landed = true;
            }
            if (landed || p.y > h + 20 || p.y < -30 || p.x < -30 || p.x > w + 30) {
              if (kind === "fireflies") { p.x = Math.random() * w; p.y = Math.random() * h; } else Object.assign(p, spawn(kind, w, h, false), kind === "embers" ? {} : { x: Math.random() * w });
            }
            if (kind === "rain") { ctx.fillStyle = "rgba(170,200,255,0.55)"; ctx.fillRect(p.x, p.y, 1, p.r); continue; }
            if (kind === "autumn" || kind === "sakura") { drawLeaf(ctx, kind, p.x, p.y, p.r, p.a, p.hue); continue; }
            ctx.fillStyle = kind === "snow" ? "rgba(255,255,255,0.85)"
              : kind === "fireflies" ? `rgba(255,236,140,${0.35 + 0.65 * Math.abs(Math.sin(p.a))})`
              : kind === "embers" ? `rgba(255,${120 + Math.round(p.hue * 80)},60,${0.5 + 0.5 * Math.abs(Math.sin(p.a))})`
              : `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(p.a))})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }

          // Thrown-up snow, leaves and water drops fall back down.
          splashes = splashes.filter((s) => {
            s.vy += 0.16; s.vx *= 0.985; s.x += s.vx + wind * 0.5; s.y += s.vy; s.a += s.vx * 0.05;
            if (kind === "rain") {
              if (s.y > h - depthAt(s.x)) return false;
              ctx.fillStyle = "rgba(190,215,255,0.6)"; ctx.fillRect(s.x, s.y, 1.2, 1.2); return true;
            }
            if (s.vy > 0 && s.y >= groundAt(s.x)) {
              if (kind === "snow") deposit(s.x, s.r * 0.15, 1);
              else leaves.push({ x: s.x, y: groundAt(s.x) - s.r * 0.3, r: s.r, a: s.a, hue: s.hue });
              return false;
            }
            if (s.x < -20 || s.x > w + 20) return false;
            if (kind === "snow") { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
            else drawLeaf(ctx, kind, s.x, s.y, s.r, s.a, s.hue);
            return true;
          });

          if (pile) {
            settle(); settle();
            if (kind === "snow") {
              ctx.fillStyle = "rgba(246,249,255,0.94)";
              ctx.beginPath(); ctx.moveTo(0, h);
              for (let i = 0; i < heights.length; i++) ctx.lineTo(i * COL, h - heights[i]);
              ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
              ctx.strokeStyle = "rgba(255,255,255,1)"; ctx.lineWidth = 1;
              ctx.beginPath();
              for (let i = 0; i < heights.length; i++) ctx[i ? "lineTo" : "moveTo"](i * COL, h - heights[i] + 0.5);
              ctx.stroke();
            } else {
              // Leaves follow the pile when it is swept lower under them.
              for (const l of leaves) {
                const g = groundAt(l.x) - l.r * 0.3;
                if (l.y < g - 1) l.y = Math.min(g, l.y + 1.5);
                drawLeaf(ctx, kind, l.x, l.y, l.r, l.a, l.hue);
              }
            }
          }
          // Lowering the setting shrinks the puddle right away; off means no water.
          if (water > maxWater()) water = maxWater();
          if (!pool && water > 0) water = Math.max(0, water - 0.4);
          if (water > 0.5) {
            // Damped wave equation along the surface; waves fade towards the shallow edges.
            for (let i = 1; i < wave.length - 1; i++) waveV[i] += (wave[i - 1] + wave[i + 1] - 2 * wave[i]) * 0.18;
            for (let i = 0; i < wave.length; i++) { waveV[i] *= 0.965; wave[i] += waveV[i]; }
            const hw = halfWidth();
            const c0 = Math.max(0, colAt(w / 2 - hw)), c1 = Math.min(wave.length - 1, colAt(w / 2 + hw));
            const surf = (i: number) => { const d = depthAt(i * COL); return h - d + wave[i] * Math.min(1, d / 6); };
            ctx.fillStyle = "rgba(110,150,215,0.32)";
            ctx.beginPath(); ctx.moveTo(c0 * COL, h);
            for (let i = c0; i <= c1; i++) ctx.lineTo(i * COL, surf(i));
            ctx.lineTo(c1 * COL, h); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(200,222,255,0.6)"; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = c0; i <= c1; i++) ctx[i > c0 ? "lineTo" : "moveTo"](i * COL, surf(i));
            ctx.stroke();
          }
          raf = requestAnimationFrame(frame);
        };
        const move = (e: PointerEvent) => {
          if (mouse.px < 0) { mouse.px = e.clientX; mouse.py = e.clientY; }
          mouse.x = e.clientX; mouse.y = e.clientY;
          // Over the pile, the pointer becomes the tool.
          const kind = kindNow();
          const tool = kind === "snow" ? "shovel" : kind === "autumn" || kind === "sakura" ? "broom" : null;
          const top = heights.length ? Math.max(heights[colAt(mouse.x - 12)], heights[colAt(mouse.x)], heights[colAt(mouse.x + 12)]) : 0;
          setSweepCursor(tool && piling() && top > 0.8 && mouse.y >= h - top - 20 ? tool : null);
        };
        const leave = () => { mouse.px = -1; setSweepCursor(null); };
        queueMicrotask(() => { reset(); raf = requestAnimationFrame(frame); });
        addEventListener("resize", resize);
        addEventListener("pointermove", move, { passive: true });
        document.addEventListener("pointerleave", leave);
        onCleanup(() => { setSweepCursor(null); cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); });
        return <canvas ref={canvas} class="ambient-canvas" aria-hidden="true" />;
      })()}
    </Show>
  );
}
