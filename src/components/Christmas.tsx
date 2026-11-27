// The Christmas theme pack: a garland of lights along the top, falling snow
// behind the panels, a Santa hat on the logo, small Christmas figures
// (reindeer, gingerbread man, candy cane, snowflake, bauble) and Christmas
// icons on the toolbar. Everything here only shows while the Christmas theme
// is on; choosing another theme brings the normal look back.
import { Show, type JSX } from "solid-js";
import { Bell, CandyCane, CloudSnow, Cookie, Gift, Snowflake, Star, TreePine } from "lucide-solid";
import { settings } from "../state/settings";

export const isXmas = () => settings.appearance.theme === "christmas";

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
/** The icon to show for `key`: its Christmas version while that theme is on. */
export function themedIcon<T>(key: string, normal: T): T {
  return (isXmas() && XMAS_ICONS[key] ? XMAS_ICONS[key] : normal) as T;
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

/** A row of figures for the start page. */
export function XmasFriends() {
  return (
    <Show when={isXmas()}>
      <div class="xmas-friends" aria-hidden="true">
        <Reindeer size={44} /><Bauble size={30} /><Gingerbread size={40} /><SnowflakeFig size={28} /><CandyCaneFig size={38} />
      </div>
    </Show>
  );
}

/** Garland along the top of the window and snow behind the panels. */
export function XmasDecor() {
  return (
    <Show when={isXmas()}>
      <div class="xmas-garland" aria-hidden="true"><i /><i /></div>
    </Show>
  );
}
