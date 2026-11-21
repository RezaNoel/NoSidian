// Background particle effects (snow, leaves, petals, fireflies, rain, stars,
// embers, aurora) drawn on one canvas behind the UI. Off with reduced motion.
import { Show, createEffect, onCleanup } from "solid-js";
import { ambient } from "../../state/focus";
import { settings } from "../../state/settings";

interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; s: number; hue: number }

const COLORS: Record<string, (p: P) => string> = {
  snow: () => "rgba(255,255,255,0.85)",
  autumn: (p) => `hsla(${20 + p.hue * 30},80%,${45 + p.hue * 10}%,0.9)`,
  sakura: () => "rgba(255,183,213,0.9)",
  fireflies: (p) => `rgba(255,236,140,${0.35 + 0.65 * Math.abs(Math.sin(p.a))})`,
  rain: () => "rgba(170,200,255,0.55)",
  starfield: (p) => `rgba(255,255,255,${0.3 + 0.7 * Math.abs(Math.sin(p.a))})`,
  embers: (p) => `rgba(255,${120 + Math.round(p.hue * 80)},60,${0.5 + 0.5 * Math.abs(Math.sin(p.a))})`,
};

function spawn(kind: string, w: number, h: number, initial: boolean): P {
  const rnd = Math.random;
  const p: P = { x: rnd() * w, y: initial ? rnd() * h : -10, vx: 0, vy: 0, r: 1, a: rnd() * Math.PI * 2, s: rnd() * 0.02 + 0.01, hue: rnd() };
  switch (kind) {
    case "snow": p.r = rnd() * 2.4 + 0.8; p.vy = rnd() * 0.6 + 0.3; break;
    case "autumn": case "sakura": p.r = rnd() * 4 + 3; p.vy = rnd() * 0.7 + 0.4; break;
    case "rain": p.r = rnd() * 10 + 8; p.vy = rnd() * 6 + 7; break;
    case "fireflies": p.r = rnd() * 1.8 + 1; p.y = rnd() * h; p.vx = (rnd() - 0.5) * 0.4; p.vy = (rnd() - 0.5) * 0.4; break;
    case "starfield": p.r = rnd() * 1.4 + 0.3; p.y = rnd() * h; break;
    case "embers": p.r = rnd() * 2 + 1; p.y = initial ? rnd() * h : h + 10; p.vy = -(rnd() * 0.9 + 0.4); break;
  }
  return p;
}

export function AmbientOverlay() {
  const on = () => settings.ambientEffectsEnabled && !settings.accessibility.reduceMotion && ambient.state.effect !== "none";
  return (
    <Show when={on()}>
      {(() => {
        let canvas!: HTMLCanvasElement;
        let raf = 0;
        let parts: P[] = [];
        let tFrame = 0;
        const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
        createEffect(() => {
          const kind = ambient.state.effect;
          const n = kind === "aurora" ? 0 : Math.round((ambient.state.density / 100) * (kind === "rain" ? 220 : kind === "starfield" ? 260 : 140));
          queueMicrotask(() => {
            resize();
            parts = Array.from({ length: n }, () => spawn(kind, canvas.width, canvas.height, true));
          });
        });
        const frame = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const { width: w, height: h } = canvas;
          const kind = ambient.state.effect;
          const wind = ambient.state.wind * 0.12;
          tFrame += 0.01;
          ctx.clearRect(0, 0, w, h);
          if (kind === "aurora") {
            for (let i = 0; i < 3; i++) {
              const g = ctx.createLinearGradient(0, 0, w, h * 0.6);
              const hue = 140 + i * 40 + Math.sin(tFrame + i) * 20;
              g.addColorStop(0, `hsla(${hue},80%,60%,0)`);
              g.addColorStop(0.5, `hsla(${hue},80%,60%,${0.08 + 0.04 * Math.sin(tFrame * 2 + i)})`);
              g.addColorStop(1, `hsla(${hue + 30},80%,60%,0)`);
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.moveTo(0, h * (0.15 + i * 0.08));
              for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h * (0.15 + i * 0.08) + Math.sin(x / 180 + tFrame * 2 + i) * 40);
              ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.fill();
            }
          }
          const color = COLORS[kind];
          for (const p of parts) {
            p.a += p.s * 3;
            if (kind === "fireflies") { p.vx += (Math.random() - 0.5) * 0.05; p.vy += (Math.random() - 0.5) * 0.05; p.vx *= 0.98; p.vy *= 0.98; }
            if (kind !== "starfield") { p.x += p.vx + wind + (kind === "snow" || kind === "sakura" || kind === "autumn" ? Math.sin(p.a) * 0.4 : 0); p.y += p.vy; }
            if (p.y > h + 20 || p.y < -30 || p.x < -30 || p.x > w + 30) {
              if (kind === "fireflies") { p.x = Math.random() * w; p.y = Math.random() * h; } else Object.assign(p, spawn(kind, w, h, false), kind === "embers" ? {} : { x: Math.random() * w });
            }
            ctx.fillStyle = color?.(p) ?? "#fff";
            if (kind === "rain") { ctx.fillRect(p.x, p.y, 1, p.r); continue; }
            if (kind === "autumn" || kind === "sakura") {
              ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
              ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
              continue;
            }
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }
          raf = requestAnimationFrame(frame);
        };
        queueMicrotask(() => { resize(); raf = requestAnimationFrame(frame); });
        addEventListener("resize", resize);
        onCleanup(() => { cancelAnimationFrame(raf); removeEventListener("resize", resize); });
        return <canvas ref={canvas} class="ambient-canvas" aria-hidden="true" />;
      })()}
    </Show>
  );
}
