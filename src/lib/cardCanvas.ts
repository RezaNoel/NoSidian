// Shared drawing helpers for the shareable PNG cards (companion, books and
// films). Colours come from the user's current theme so a card matches the
// app as they see it.
import logoUrl from "../assets/logo.png";
import { dir, locale } from "../i18n";

export interface CardTheme { bg: string; card: string; line: string; text: string; muted: string; accent: string; accentInk: string }

const FALLBACK: CardTheme = { bg: "#15171c", card: "#1d2027", line: "#2a2e37", text: "#eef0f4", muted: "#9aa1ad", accent: "#3b7ddd", accentInk: "#ffffff" };

/** Read the live theme colours from CSS variables. */
export function cardTheme(): CardTheme {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => {
    const x = cs.getPropertyValue(name).trim();
    // Canvas can't paint var() chains or transparent theme layers well; use solid values only.
    return x && !x.startsWith("var(") && x !== "transparent" ? x : fb;
  };
  return {
    bg: v("--bg-primary", FALLBACK.bg),
    card: v("--bg-secondary", FALLBACK.card),
    line: v("--border-strong", v("--border", FALLBACK.line)),
    text: v("--text-primary", FALLBACK.text),
    muted: v("--text-muted", FALLBACK.muted),
    accent: v("--accent", FALLBACK.accent),
    accentInk: v("--accent-ink", FALLBACK.accentInk),
  };
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw an image to cover the box (cropping the overflow), with rounded corners. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

/** Break text into lines that fit `maxW`; the last line gets an ellipsis if cut. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/** Shrink a single line with an ellipsis until it fits. */
export function fitLine(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

export interface CardCtx {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  C: CardTheme;
  rtl: boolean;
  font: string;
  /** Inline-start x for a given margin, honouring direction. */
  start: number;
  end: number;
  alignStart: CanvasTextAlign;
  alignEnd: CanvasTextAlign;
  num: (n: number) => string;
}

/** A blank card filled with the theme background, with logo, name and date on top. */
export async function newCard(W = 1080, H = 1350, margin = 96): Promise<CardCtx> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rtl = dir() === "rtl";
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const C = cardTheme();
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const c: CardCtx = {
    ctx, canvas, W, H, C, rtl, font,
    start: rtl ? W - margin : margin, end: rtl ? margin : W - margin,
    alignStart: rtl ? "right" : "left", alignEnd: rtl ? "left" : "right",
    num: (n) => n.toLocaleString(locale()),
  };
  try {
    const logo = await loadImage(logoUrl);
    ctx.drawImage(logo, rtl ? W - margin - 64 : margin, 72, 64, 64);
  } catch { /* the name alone is fine */ }
  ctx.fillStyle = C.text;
  ctx.font = `600 40px ${font}`;
  ctx.textAlign = c.alignStart;
  ctx.fillText("NoSidian", rtl ? W - margin - 84 : margin + 84, 104);
  ctx.fillStyle = C.muted;
  ctx.font = `400 28px ${font}`;
  ctx.textAlign = c.alignEnd;
  ctx.fillText(new Date().toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" }), c.end, 104);
  return c;
}

export async function cardBytes(c: CardCtx): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => c.canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("canvas");
  return new Uint8Array(await blob.arrayBuffer());
}

export const safeFileName = (name: string, fallback: string) => `${name.replace(/[\\/:*?"<>|]+/g, "").trim() || fallback}.png`;
