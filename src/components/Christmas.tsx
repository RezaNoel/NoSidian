// The Christmas theme pack: a garland of lights along the top, falling snow
// behind the panels, a Santa hat on the logo, small Christmas figures
// (reindeer, gingerbread man, candy cane, snowflake, bauble) and Christmas
// icons on the toolbar. Everything here only shows while the Christmas theme
// is on; choosing another theme brings the normal look back.
//
// The Matrix theme gets a programming pack from the same file: digital rain
// behind the panels, code icons on the toolbar, a small terminal on the start
// page and binary digits that burst out of a ticked task.
import { Show, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import {
  Bell, Binary, Bug, CandyCane, CloudSnow, CodeXml, Cookie, Cpu, Database, FileCode, Gift, GitBranch,
  Snowflake, SquareTerminal, Star, TreePine,
} from "lucide-solid";
import { settings } from "../state/settings";
import { t } from "../i18n";

export const isXmas = () => settings.appearance.theme === "christmas";
export const isMatrix = () => settings.appearance.theme === "matrix";
const still = () => settings.accessibility.reduceMotion;

type IconC = (p: JSX.SvgSVGAttributes<SVGSVGElement>) => JSX.Element;
/** Toolbar icons that change with the Christmas theme (by tool or button key). */
const XMAS_ICONS: Record<string, IconC> = {
  "ribbon-dashboard": TreePine as IconC,
  "ribbon-flashcards": CandyCane as IconC,
  "ribbon-daily-note": Gift as IconC,
  "ribbon-focus": Bell as IconC,
  "ribbon-graph": Star as IconC,
  "pet-studio": Cookie as IconC,
  ambience: CloudSnow as IconC,
  settings: Snowflake as IconC,
};
/** Toolbar icons for the Matrix theme: programming tools. */
const MATRIX_ICONS: Record<string, IconC> = {
  "ribbon-dashboard": SquareTerminal as IconC,
  "ribbon-flashcards": Binary as IconC,
  "ribbon-daily-note": FileCode as IconC,
  "ribbon-focus": CodeXml as IconC,
  "ribbon-graph": GitBranch as IconC,
  "pet-studio": Bug as IconC,
  ambience: Database as IconC,
  settings: Cpu as IconC,
};
/** The icon to show for `key`: its themed version while a theme pack is on. */
export function themedIcon<T>(key: string, normal: T): T {
  const map = isXmas() ? XMAS_ICONS : isMatrix() ? MATRIX_ICONS : null;
  return (map?.[key] ?? normal) as T;
}

// ---------- Figures (flat SVG, sized by the caller) ----------

export function Gingerbread(props: { size?: number }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="#b8743a" stroke-linecap="round" fill="#b8743a">
        <line x1="14" y1="31" x2="50" y2="31" stroke-width="10" />
        <line x1="32" y1="38" x2="22" y2="56" stroke-width="11" />
        <line x1="32" y1="38" x2="42" y2="56" stroke-width="11" />
        <circle cx="32" cy="36" r="12" stroke="none" />
        <circle cx="32" cy="15" r="10" stroke="none" />
      </g>
      <g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round">
        <path d="M27 19 q5 4 10 0" />
        <path d="M12 28 q1.5 3 0 6 M52 28 q-1.5 3 0 6 M18 53 q3 2 6 0 M40 53 q3 2 6 0" />
      </g>
      <circle cx="28" cy="13" r="1.6" fill="#fff" /><circle cx="36" cy="13" r="1.6" fill="#fff" />
      <circle cx="32" cy="31" r="2" fill="#b11e31" /><circle cx="32" cy="39" r="2" fill="#1e6b45" /><circle cx="32" cy="46" r="2" fill="#b11e31" />
    </svg>
  );
}

export function Reindeer(props: { size?: number }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="#6b4226" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M25 24 C21 16 16 13 10 6 M18 15 L11 16 M21 19 L19 9" />
        <path d="M39 24 C43 16 48 13 54 6 M46 15 L53 16 M43 19 L45 9" />
      </g>
      <ellipse cx="20" cy="28" rx="6" ry="3" transform="rotate(-25 20 28)" fill="#8a5a3b" />
      <ellipse cx="44" cy="28" rx="6" ry="3" transform="rotate(25 44 28)" fill="#8a5a3b" />
      <ellipse cx="32" cy="38" rx="13" ry="15" fill="#8a5a3b" />
      <ellipse cx="32" cy="48" rx="9" ry="7" fill="#c99b6d" />
      <circle cx="27" cy="35" r="2" fill="#2a1215" /><circle cx="37" cy="35" r="2" fill="#2a1215" />
      <circle cx="32" cy="45" r="4.5" fill="#b11e31" /><circle cx="30.6" cy="43.6" r="1.3" fill="#fff" opacity="0.8" />
    </svg>
  );
}

export function CandyCaneFig(props: { size?: number }) {
  const d = "M38 58 L38 22 A9 9 0 0 0 20 22";
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <path d={d} fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" />
      <path d={d} fill="none" stroke="#b11e31" stroke-width="9" stroke-dasharray="5 6" />
      <path d={d} fill="none" stroke="rgb(0 0 0 / 0.12)" stroke-width="9.5" stroke-linecap="round" style={{ "mix-blend-mode": "multiply" }} opacity="0.25" />
    </svg>
  );
}

export function SnowflakeFig(props: { size?: number; color?: string }) {
  const arm = "M32 32 L32 8 M32 15 L26 10 M32 15 L38 10 M32 23 L27 19 M32 23 L37 19";
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke={props.color ?? "#b11e31"} stroke-width="2.6" stroke-linecap="round">
        {[0, 60, 120, 180, 240, 300].map((r) => <path d={arm} transform={`rotate(${r} 32 32)`} />)}
      </g>
      <circle cx="32" cy="32" r="3" fill={props.color ?? "#b11e31"} />
    </svg>
  );
}

export function Bauble(props: { size?: number; color?: string }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4 v8" stroke="#d9a441" stroke-width="2" />
      <rect x="26" y="11" width="12" height="7" rx="2" fill="#d9a441" />
      <circle cx="32" cy="38" r="20" fill={props.color ?? "#b11e31"} />
      <path d="M14 34 q18 8 36 0" fill="none" stroke="#fff" stroke-width="2.5" opacity="0.85" />
      <path d="M13 41 q19 8 38 0" fill="none" stroke="#d9a441" stroke-width="2" opacity="0.9" />
      <ellipse cx="24" cy="29" rx="4" ry="6" transform="rotate(30 24 29)" fill="#fff" opacity="0.45" />
    </svg>
  );
}

export function Holly(props: { size?: number }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 34 C24 22 12 26 6 20 C10 30 8 34 14 40 C20 38 26 40 32 34Z" fill="#1e6b45" />
      <path d="M32 34 C40 22 52 26 58 20 C54 30 56 34 50 40 C44 38 38 40 32 34Z" fill="#2a8a59" />
      <circle cx="28" cy="36" r="5" fill="#b11e31" /><circle cx="36" cy="36" r="5" fill="#c8283d" /><circle cx="32" cy="42" r="5" fill="#9e1a2c" />
      <circle cx="26.5" cy="34.5" r="1.4" fill="#fff" opacity="0.7" />
    </svg>
  );
}

export function Snowman(props: { size?: number }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="46" r="14" fill="#fff" stroke="#d5dde6" stroke-width="1.5" />
      <circle cx="32" cy="24" r="10" fill="#fff" stroke="#d5dde6" stroke-width="1.5" />
      <rect x="23" y="5" width="18" height="10" rx="1.5" fill="#2a1215" /><rect x="19" y="14" width="26" height="3.5" rx="1.5" fill="#2a1215" />
      <rect x="23" y="12" width="18" height="2.5" fill="#b11e31" />
      <circle cx="28.5" cy="22" r="1.5" fill="#2a1215" /><circle cx="35.5" cy="22" r="1.5" fill="#2a1215" />
      <path d="M32 25 L40 27 L32 28Z" fill="#e8772e" />
      <path d="M22 32 q10 5 20 0 l2 4 q-12 5 -24 0Z" fill="#b11e31" /><rect x="35" y="33" width="5" height="10" rx="1.5" fill="#b11e31" />
      <circle cx="32" cy="42" r="1.6" fill="#2a1215" /><circle cx="32" cy="49" r="1.6" fill="#2a1215" />
    </svg>
  );
}

export function XmasTree(props: { size?: number }) {
  return (
    <svg class="xmas-fig" width={props.size ?? 40} height={props.size ?? 40} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="28" y="52" width="8" height="9" rx="1" fill="#6b4226" />
      <path d="M32 8 L50 32 H42 L54 52 H10 L22 32 H14Z" fill="#1e6b45" />
      <path d="M20 40 q12 6 26 -2 M18 48 q14 5 30 -1" fill="none" stroke="#d9a441" stroke-width="1.6" />
      <circle cx="26" cy="30" r="2.4" fill="#b11e31" /><circle cx="38" cy="36" r="2.4" fill="#fff" /><circle cx="24" cy="46" r="2.4" fill="#d9a441" />
      <circle cx="40" cy="47" r="2.4" fill="#b11e31" /><circle cx="33" cy="22" r="2" fill="#d9a441" />
      <path d="M32 1 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7Z" fill="#d9a441" />
    </svg>
  );
}

/** Whole days until the next 25 December, 0 on the day itself. */
export function daysToChristmas(now = new Date()): number {
  const y = now.getMonth() === 11 && now.getDate() > 25 ? now.getFullYear() + 1 : now.getFullYear();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, 11, 25).getTime() - today.getTime()) / 86_400_000);
}

/** A Santa hat to sit on the app logo. */
export function SantaHat() {
  return (
    <svg class="xmas-hat" viewBox="0 0 64 52" aria-hidden="true">
      <path d="M8 40 C12 20 26 6 44 8 C52 9 58 16 56 26 C52 20 46 18 42 20 C40 30 44 36 46 40Z" fill="#b11e31" />
      <circle cx="56" cy="28" r="6" fill="#fff" />
      <rect x="4" y="36" width="46" height="12" rx="6" fill="#fff" />
    </svg>
  );
}

/** The logo with a Santa hat while the Christmas theme is on. */
export function HatOn(props: { children: JSX.Element }) {
  return (
    <Show when={isXmas()} fallback={props.children}>
      <span class="xmas-hatted">{props.children}<SantaHat /></span>
    </Show>
  );
}

/** A row of figures for the start page (or a small terminal in the Matrix theme). */
export function XmasFriends() {
  return (
    <>
    <Show when={isXmas()}>
      <div class="xmas-extra">
      <div class="xmas-friends" aria-hidden="true">
        <XmasTree size={42} /><Reindeer size={44} /><Bauble size={30} /><Gingerbread size={40} /><SnowflakeFig size={28} /><CandyCaneFig size={38} /><Snowman size={42} />
      </div>
      <p class="xmas-countdown"><Holly size={20} />{daysToChristmas() === 0 ? t("xmas-today") : t("xmas-countdown", { days: daysToChristmas() })}</p>
      </div>
    </Show>
    <Show when={isMatrix()}>
      <div class="mx-term" aria-hidden="true" dir="ltr">
        <div class="mx-term-bar"><i /><i /><i /><span>~/vault</span></div>
        <code><b>$</b> nosidian --focus <span class="mx-cursor" /></code>
      </div>
    </Show>
    </>
  );
}

/** Digital rain behind the panels for the Matrix theme. Slow and faint, and still when motion is reduced. */
function MatrixRain() {
  let canvas!: HTMLCanvasElement;
  onMount(() => {
    const g = canvas.getContext("2d");
    if (!g) return;
    const glyphs = "01{}[]<>/=;:+*#$&|abcdef0123456789ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";
    const size = 16;
    let drops: number[] = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.ceil(innerWidth / size) }, () => Math.random() * -innerHeight / size);
      g.fillStyle = "#020803"; g.fillRect(0, 0, innerWidth, innerHeight);
    };
    const frame = () => {
      g.fillStyle = "rgb(2 8 3 / 0.12)";
      g.fillRect(0, 0, innerWidth, innerHeight);
      g.font = `${size - 2}px ui-monospace, monospace`;
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * size;
        g.fillStyle = Math.random() < 0.06 ? "#d8ffd8" : "#00c83a";
        g.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y);
        drops[i] = y > innerHeight && Math.random() > 0.975 ? 0 : drops[i] + 1;
      }
    };
    resize();
    addEventListener("resize", resize);
    let id = 0;
    const start = () => { clearInterval(id); if (!still() && !document.hidden) id = window.setInterval(frame, 70); };
    createEffect(start);
    const vis = () => start();
    document.addEventListener("visibilitychange", vis);
    onCleanup(() => { clearInterval(id); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis); });
  });
  return <canvas class="mx-rain" ref={canvas} aria-hidden="true" />;
}

/** Little pieces that burst out of a ticked task: snowflakes for Christmas, binary for Matrix. */
function TaskBurst() {
  const [bits, setBits] = createSignal<{ id: number; x: number; y: number; dx: number; dy: number; ch: string }[]>([]);
  let n = 0;
  const onClick = (e: MouseEvent) => {
    if (still()) return;
    const el = (e.target as HTMLElement | null)?.closest?.("input[type=checkbox].task-box, .widget input[type=checkbox], .cm-task-box, .task-check") as HTMLInputElement | null;
    if (!el || ("checked" in el && !el.checked)) return;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const chars = isXmas() ? ["❄", "❅", "❆", "✦"] : ["0", "1", "{", "}", ";"];
    const made = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      const d = 22 + Math.random() * 18;
      return { id: ++n, x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d, ch: chars[i % chars.length] };
    });
    setBits((b) => [...b, ...made]);
    const ids = new Set(made.map((m) => m.id));
    setTimeout(() => setBits((b) => b.filter((m) => !ids.has(m.id))), 800);
  };
  onMount(() => document.addEventListener("click", onClick, true));
  onCleanup(() => document.removeEventListener("click", onClick, true));
  return (
    <div class="task-burst" aria-hidden="true">
      {bits().map((b) => (
        <span style={{ left: `${b.x}px`, top: `${b.y}px`, "--dx": `${b.dx}px`, "--dy": `${b.dy}px` }}>{b.ch}</span>
      ))}
    </div>
  );
}

/** Garland and snow for Christmas, digital rain for Matrix, and the task burst for both. */
export function XmasDecor() {
  return (
    <>
      <Show when={isXmas()}>
        <div class="xmas-garland" aria-hidden="true"><i /><i /></div>
      </Show>
      <Show when={isMatrix()}><MatrixRain /></Show>
      <Show when={isXmas() || isMatrix()}><TaskBurst /></Show>
    </>
  );
}
