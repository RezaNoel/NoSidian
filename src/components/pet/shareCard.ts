// Shareable companion card: a PNG with the app logo and name, the pet's
// picture, name, species, level, age and a few stats. Drawn on a canvas so it
// works offline; text follows the UI language and direction.
import { t } from "../../i18n";
import { petAgeDays, petBondTier, petSatisfaction } from "../../core/pet";
import type { PetState } from "../../core/types";
import { personal } from "../../state/personal";
import { cardBytes, loadImage, newCard, roundRect, safeFileName } from "../../lib/cardCanvas";

/** Renders the card and returns PNG bytes. `petImage` is a data URL of the pet render. */
export async function renderPetCard(state: PetState, petImage: string | null): Promise<Uint8Array> {
  const card = await newCard();
  const { ctx, W, H, C, rtl, font, num, start, alignStart, alignEnd } = card;

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

  return cardBytes(card);
}

export const cardFileName = (name: string) => safeFileName(name, "companion");
