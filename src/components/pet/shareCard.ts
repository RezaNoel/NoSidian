// Shareable companion card: a PNG with the app logo and name, the pet's
// picture, name, species, level, age and a few stats. Drawn on a canvas so it
// works offline; text follows the UI language and direction.
import logoUrl from "../../assets/logo.png";
import { dir, locale, t } from "../../i18n";
import { petAgeDays, petBondTier, petSatisfaction } from "../../core/pet";
import type { PetState } from "../../core/types";
import { personal } from "../../state/personal";

const W = 1080, H = 1350;
const C = { bg: "#15171c", card: "#1d2027", line: "#2a2e37", text: "#eef0f4", muted: "#9aa1ad", accent: "#3b7ddd" };

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders the card and returns PNG bytes. `petImage` is a data URL of the pet render. */
export async function renderPetCard(state: PetState, petImage: string | null): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rtl = dir() === "rtl";
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const num = (n: number) => n.toLocaleString(locale());
  ctx.direction = rtl ? "rtl" : "ltr";
  const start = rtl ? W - 96 : 96, end = rtl ? 96 : W - 96;
  const alignStart: CanvasTextAlign = rtl ? "right" : "left", alignEnd: CanvasTextAlign = rtl ? "left" : "right";

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: logo and app name.
  try {
    const logo = await loadImage(logoUrl);
    ctx.drawImage(logo, rtl ? W - 96 - 64 : 96, 72, 64, 64);
  } catch { /* the name alone is fine */ }
  ctx.fillStyle = C.text;
  ctx.font = `600 40px ${font}`;
  ctx.textAlign = alignStart;
  ctx.textBaseline = "middle";
  ctx.fillText("NoSidian", rtl ? W - 96 - 84 : 96 + 84, 104);
  ctx.fillStyle = C.muted;
  ctx.font = `400 28px ${font}`;
  ctx.textAlign = alignEnd;
  ctx.fillText(new Date().toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" }), end, 104);

  // Picture.
  roundRect(ctx, 96, 180, W - 192, 560, 36);
  ctx.fillStyle = C.card;
  ctx.fill();
  if (petImage) {
    try {
      const img = await loadImage(petImage);
      const scale = Math.min((W - 232) / img.width, 520 / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, 200 + (520 - h) / 2, w, h);
    } catch { /* leave the panel plain */ }
  }

  // Name and details.
  ctx.textAlign = alignStart;
  ctx.fillStyle = C.text;
  ctx.font = `700 72px ${font}`;
  ctx.fillText(state.name, start, 820);
  ctx.fillStyle = C.muted;
  ctx.font = `400 32px ${font}`;
  const age = petAgeDays(state);
  ctx.fillText(`${t(`pet-species-${state.species}` as "pet-species-fox")} · ${t("pet-level", { level: state.level })} · ${t("pet-age-days", { days: age })}`, start, 888);

  // Stats.
  const stats: [string, number][] = [
    [t("pet-satisfaction"), petSatisfaction(state)],
    [t("pet-bond"), Math.round(state.bond ?? 20)],
    [t("pet-happiness"), state.happiness],
    [t("pet-health"), state.health],
  ];
  const top = 960, rowH = 74, barW = 420;
  stats.forEach(([label, value], i) => {
    const y = top + i * rowH;
    ctx.textAlign = alignStart;
    ctx.fillStyle = C.text;
    ctx.font = `500 32px ${font}`;
    ctx.fillText(label, start, y);
    const bx = rtl ? 96 : W - 96 - barW;
    roundRect(ctx, bx, y - 9, barW, 18, 9);
    ctx.fillStyle = C.line;
    ctx.fill();
    const fw = Math.max(18, (barW * Math.max(0, Math.min(100, value))) / 100);
    roundRect(ctx, rtl ? bx + barW - fw : bx, y - 9, fw, 18, 9);
    ctx.fillStyle = C.accent;
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.font = `500 28px ${font}`;
    ctx.textAlign = alignEnd;
    ctx.fillText(num(Math.round(value)), rtl ? bx + barW + 20 : bx - 20, y);
  });

  // Footer: bond line with the owner's name when set.
  const owner = personal.state.name.trim();
  const tier = t(`pet-bond-${petBondTier(state.bond ?? 20)}` as "pet-bond-new");
  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.font = `400 30px ${font}`;
  ctx.fillText(owner ? t("pet-card-owner", { owner, tier }) : tier, W / 2, H - 70);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("canvas");
  return new Uint8Array(await blob.arrayBuffer());
}

export const cardFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "").trim() || "companion"}.png`;
