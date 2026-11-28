// Shareable PNG cards for books and films: one title (cover, score, stars,
// a favourite line) or a "best of my life" ranking. Drawn in the user's theme.
import { locale, t } from "../../i18n";
import type { BookEntry, CinemaEntry } from "../../core/types";
import { blobUrl } from "../../lib/attachments";
import { cardBytes, drawCover, fitLine, loadImage, newCard, roundRect, wrapText, type CardCtx } from "../../lib/cardCanvas";
export { safeFileName as safeName } from "../../lib/cardCanvas";
import { personal } from "../../state/personal";

export type Entry = BookEntry | CinemaEntry;
export const isBook = (e: Entry): e is BookEntry => "author" in e;

const COVERS = ["#35507a", "#6b4a3a", "#2f5d50", "#5a3f6b", "#7a5a2c", "#3e4a5c", "#6a3440", "#2c5566", "#4f5a2e", "#5c4a6e"];
export const coverColor = (title: string) => { let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COVERS[h % COVERS.length]; };

export const subtitle = (e: Entry) => (isBook(e) ? e.author : [e.year, e.director].filter(Boolean).join(" · "));
export const scoreText = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });

async function coverImage(e: Entry): Promise<HTMLImageElement | null> {
  if (!e.cover) return null;
  try { return await loadImage(await blobUrl(e.cover)); } catch { return null; }
}

/** A cover box: the chosen image, or a calm colour field with the title set in type, like the shelf. */
async function paintCover(c: CardCtx, e: Entry, x: number, y: number, w: number, h: number, r: number, titleSize: number) {
  const { ctx, rtl } = c;
  const img = await coverImage(e);
  if (img) { drawCover(ctx, img, x, y, w, h, r); return; }
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = coverColor(e.title || "?");
  ctx.fill();
  ctx.clip();
  if (isBook(e)) {
    // Spine shade on the binding side.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(rtl ? x + w - w * 0.035 : x, y, w * 0.035, h);
  }
  const pad = Math.max(8, w * 0.09);
  const serif = `Georgia, "Times New Roman", ${c.font}`;
  ctx.textAlign = rtl ? "right" : "left";
  const tx = rtl ? x + w - pad : x + pad;
  ctx.font = `700 ${titleSize}px ${serif}`;
  const lines = wrapText(ctx, e.title, w - pad * 2, 4);
  const sub = subtitle(e);
  const subSize = Math.round(titleSize * 0.5);
  let by = y + h - pad - (sub && titleSize > 20 ? subSize * 1.6 : 0);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  if (sub && titleSize > 20) {
    ctx.font = `400 ${subSize}px ${c.font}`;
    ctx.fillText(fitLine(ctx, sub, w - pad * 2), tx, y + h - pad - subSize / 2);
  }
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `700 ${titleSize}px ${serif}`;
  const lh = titleSize * 1.18;
  for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], tx, by - lh / 2); by -= lh; }
  ctx.restore();
}

function stars(c: CardCtx, x: number, y: number, value: number, size: number) {
  const { ctx, C, rtl } = c;
  for (let i = 0; i < 5; i++) {
    const cx = rtl ? x - i * size * 1.25 - size / 2 : x + i * size * 1.25 + size / 2;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? size * 0.22 : size * 0.5;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = i < value ? C.accent : C.line;
    ctx.fill();
  }
}

/** Card for one book or film. `rank` is its place in "best of my life", if any. */
export async function renderEntryCard(e: Entry, rank: number | null): Promise<Uint8Array> {
  const c = await newCard();
  const { ctx, W, H, C, font, start, alignStart, rtl } = c;
  const book = isBook(e);
  // Cover, centred.
  const cw = book ? 430 : 440, ch = book ? 640 : 640;
  await paintCover(c, e, (W - cw) / 2, 180, cw, ch, 28, 46);
  if (rank) {
    // Rank badge on the cover's top corner.
    const bx = rtl ? (W - cw) / 2 + 22 : (W + cw) / 2 - 22 - 150;
    roundRect(ctx, bx, 200, 150, 64, 32);
    ctx.fillStyle = C.accent;
    ctx.fill();
    ctx.fillStyle = C.accentInk;
    ctx.font = `700 34px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(`#${c.num(rank)}`, bx + 75, 233);
  }
  let y = 880;
  ctx.textAlign = alignStart;
  ctx.fillStyle = C.text;
  ctx.font = `700 60px ${font}`;
  for (const line of wrapText(ctx, e.title, W - 192, 2)) { ctx.fillText(line, start, y); y += 70; }
  const sub = subtitle(e);
  if (sub) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 32px ${font}`;
    ctx.fillText(fitLine(ctx, sub, W - 192), start, y);
    y += 62;
  }
  // When it was finished or watched.
  const when = book ? (e.status === "finished" ? e.finishedDate : undefined) : e.status === "watched" ? e.watchedDate : undefined;
  if (when) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 28px ${font}`;
    const d = new Date(`${when}T12:00:00`).toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" });
    ctx.fillText(fitLine(ctx, t(book ? "media-card-finished" : "media-card-watched", { date: d }), W - 192), start, y - 8);
    y += 52;
  }
  // Score and stars on one line.
  if (e.score || e.rating) {
    let x = start;
    if (e.score) {
      ctx.fillStyle = C.accent;
      ctx.font = `800 56px ${font}`;
      const s = scoreText(e.score);
      ctx.fillText(s, x, y);
      const sw = ctx.measureText(s).width;
      ctx.fillStyle = C.muted;
      ctx.font = `500 30px ${font}`;
      const tail = ` / ${c.num(10)}`;
      ctx.fillText(tail, rtl ? x - sw : x + sw, y + 6);
      x = rtl ? x - sw - ctx.measureText(tail).width - 40 : x + sw + ctx.measureText(tail).width + 40;
    }
    if (e.rating) stars(c, x, y, e.rating, 40);
    y += 76;
  }
  // A favourite line, when there is one.
  const quote = book ? e.highlights[0]?.quote : e.favoriteQuotes[0];
  if (quote && y < H - 220) {
    ctx.fillStyle = C.text;
    ctx.font = `italic 400 34px ${font}`;
    const lines = wrapText(ctx, `“${quote}”`, W - 192, Math.max(1, Math.floor((H - 160 - y) / 48)));
    for (const l of lines) { ctx.fillText(l, start, y); y += 48; }
  }
  footer(c, rank ? t(book ? "best-card-books" : "best-card-films") : "");
  return cardBytes(c);
}

/** Card for a "best of my life" ranking (up to ten). */
export async function renderBestCard(list: Entry[], kind: "books" | "films"): Promise<Uint8Array> {
  const n = Math.min(10, list.length);
  // Fewer titles get bigger rows; the card grows from square to portrait.
  const rowH = n <= 3 ? 190 : n <= 5 ? 150 : n <= 7 ? 118 : 92;
  const c = await newCard(1080, Math.max(1080, Math.min(1350, 300 + n * rowH + 150)));
  const { ctx, W, C, font, start, alignStart, rtl } = c;
  ctx.textAlign = alignStart;
  ctx.fillStyle = C.text;
  ctx.font = `800 64px ${font}`;
  ctx.fillText(fitLine(ctx, t(kind === "books" ? "best-card-books" : "best-card-films"), W - 192), start, 220);
  const rows = list.slice(0, 10);
  const top = 300, thumbH = rowH - 20, thumbW = thumbH * 0.66;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const y = top + i * rowH;
    // Rank number.
    ctx.textAlign = "center";
    ctx.fillStyle = i < 3 ? C.accent : C.muted;
    ctx.font = `800 ${Math.round(Math.min(64, rowH * 0.42))}px ${font}`;
    const rx = rtl ? W - 96 - 36 : 96 + 36;
    ctx.fillText(c.num(i + 1), rx, y + rowH / 2);
    // Cover thumbnail.
    const tx = rtl ? W - 96 - 84 - thumbW : 96 + 84;
    await paintCover(c, e, tx, y + 10, thumbW, thumbH, 10, Math.round(thumbW * 0.13));
    // Title, subtitle, score.
    const textX = rtl ? tx - 28 : tx + thumbW + 28;
    const maxW = W - 96 - (rtl ? W - textX : textX) - 150;
    ctx.textAlign = alignStart;
    ctx.fillStyle = C.text;
    ctx.font = `700 ${Math.round(Math.min(48, rowH * 0.3))}px ${font}`;
    ctx.fillText(fitLine(ctx, e.title, maxW), textX, y + rowH * 0.4);
    const sub = subtitle(e);
    if (sub) {
      ctx.fillStyle = C.muted;
      ctx.font = `400 ${Math.round(Math.min(32, rowH * 0.2))}px ${font}`;
      ctx.fillText(fitLine(ctx, sub, maxW), textX, y + rowH * 0.72);
    }
    if (e.score) {
      ctx.textAlign = c.alignEnd;
      ctx.fillStyle = C.accent;
      ctx.font = `800 ${Math.round(Math.min(56, rowH * 0.34))}px ${font}`;
      ctx.fillText(scoreText(e.score), c.end, y + rowH / 2);
    }
    if (i < rows.length - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(96, y + rowH - 1, W - 192, 1);
    }
  }
  footer(c, "");
  return cardBytes(c);
}

function footer(c: CardCtx, fallback: string) {
  const { ctx, W, H, C, font } = c;
  const owner = personal.state.name.trim();
  const text = owner ? t("media-card-owner", { owner }) : fallback;
  if (!text) return;
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.font = `400 30px ${font}`;
  ctx.fillText(text, W / 2, H - 70);
}
