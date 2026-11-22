// Companion card and studio: stats, feeding, play, sleep, renaming, species,
// accessory shop and custom glTF/GLB models. Coins come from studying.
import { dismissPetLine, petLine } from "../../state/petTalk";
import { For, Show, createSignal } from "solid-js";
import { Cake, Coins, Gamepad2, Heart, Moon, PawPrint, Pencil, Share2, Smile, Star, Sun, Upload, X } from "lucide-solid";
import { locale, t } from "../../i18n";
import { PET_ACCESSORY_SHOP, PET_FOOD_MENU, PET_SPECIES_INFO, buyOrToggleAccessory, feedPet, getPetMoodLabel, petAgeDays, petBondTier, petSatisfaction, performPetPlay, petInteractionSleep, petInteractionWake, renamePet, setPetActivity, xpNeededForLevel } from "../../core/pet";
import type { Pet3DInteractAction } from "../../core/pet3dKinematics";
import { saveCustomPetModelFile, deleteCustomPetModel } from "../../core/utils/petModelStore";
import { bumpBond, pet, setPet } from "../../state/pet";
import { shareImage } from "../../backend/share";
import { cardFileName, renderPetCard } from "./shareCard";
import { askText, isMobile, toast } from "../../state/ui";
import { pref, setPref } from "../../state/prefs";
import { Modal } from "../Modal";
import { PetViewport } from "./PetViewport";
import { activePath } from "../../state/vault";

const [studioOpen, setStudioOpen] = createSignal(false);
export const openPetStudio = () => setStudioOpen(true);
const num = (n: number) => n.toLocaleString(locale());
const snap = () => JSON.parse(JSON.stringify(pet.state)) as typeof pet.state;

function Bar(props: { label: string; value: number }) {
  return (
    <div class="pet-bar">
      <span>{props.label}</span>
      <div class="meter" role="meter" aria-label={props.label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(props.value)}><span style={{ width: `${props.value}%` }} /></div>
    </div>
  );
}

export function feed(foodId: string) {
  const food = PET_FOOD_MENU.find((f) => f.id === foodId);
  if (!food) return;
  const r = feedPet(snap(), food);
  if (!r.ok) return toast(t("pet-no-coins"), true);
  setPet(setPetActivity(r.next, "feeding"));
  bumpBond(1.5);
  setTimeout(() => setPet(setPetActivity(snap(), "idle")), 2500);
  toast(t("pet-fed", { name: pet.state.name }));
}
export function play() {
  const r = performPetPlay(snap());
  if (!r.played) return toast(t(r.reason === "sleeping" ? "pet-sleeping" : r.reason === "exhausted" ? "pet-tired" : "pet-cooldown"));
  setPet(r.next);
  bumpBond(2);
  setTimeout(() => { if (pet.state.activity === "playing") setPet(setPetActivity(snap(), "idle")); }, 4000);
  if (r.coinsAwarded) toast(t("pet-play-coins", { coins: r.coinsAwarded }));
}
export const toggleSleep = () => setPet(pet.state.activity === "sleep" ? petInteractionWake(snap()) : petInteractionSleep(snap()));
const onAction = (a: Pet3DInteractAction) => (a === "eat" ? feed(PET_FOOD_MENU[0].id) : a === "play" ? play() : a === "sleep" ? toggleSleep() : (setPet({ ...snap(), happiness: Math.min(100, pet.state.happiness + 1) }), bumpBond(0.5)));

export function PetCard(props: { compact?: boolean }) {
  const mood = () => getPetMoodLabel(pet.state).toLowerCase();
  return (
    <div class="pet-card" classList={{ compact: props.compact }}>
      <PetViewport species={pet.state.species} activity={pet.state.activity} accessories={pet.state.equippedAccessories} customModelId={pet.state.customModelId} variant={props.compact ? "mini" : "card"} label={t("pet-label", { name: pet.state.name, mood: t(`pet-mood-${mood()}` as "pet-mood-happy") })} onAction={onAction} />
      <div class="pet-info">
        <strong dir="auto">{pet.state.name}</strong>
        <span class="muted">{t("pet-level", { level: pet.state.level })} · {t(`pet-mood-${mood()}` as "pet-mood-happy")}</span>
        <span class="coins"><Coins aria-hidden="true" />{pet.state.coins}</span>
        <button class="btn sm" onClick={openPetStudio}>{t("pet-open")}</button>
      </div>
    </div>
  );
}

export function PetStudio() {
  let capture: (() => string) | null = null;
  const [sharing, setSharing] = createSignal(false);
  const share = async () => {
    if (sharing()) return;
    setSharing(true);
    try {
      const bytes = await renderPetCard(pet.state, capture?.() ?? null);
      if (await shareImage(cardFileName(pet.state.name), bytes)) toast(t("pet-card-saved"));
    } catch { toast(t("pet-card-failed"), true); } finally { setSharing(false); }
  };
  const label = () => t("pet-label", { name: pet.state.name, mood: t(`pet-mood-${getPetMoodLabel(pet.state).toLowerCase()}` as "pet-mood-happy") });
  const bond = () => pet.state.bond ?? 20;
  return (
    <Show when={studioOpen()}>
      <Modal title={t("pet-studio")} onClose={() => setStudioOpen(false)} class="modal-xl">
        <div class="pet-studio">
          <div class="pet-stage">
            <PetViewport species={pet.state.species} activity={pet.state.activity} accessories={pet.state.equippedAccessories} customModelId={pet.state.customModelId} variant="studio" label={label()} onAction={onAction} onCapture={(c) => { capture = c; }} />
            <p class="muted sm">{t("pet-stage-hint")}</p>
          </div>
          <div class="pet-side stack">
            <div class="row">
              <h3 dir="auto">{pet.state.name}</h3>
              <button class="icon-btn sm" aria-label={t("pet-rename")} title={t("pet-rename")} onClick={async () => { const v = await askText(t("pet-rename"), pet.state.name, t("action-rename")); if (v) setPet(renamePet(snap(), v)); }}><Pencil /></button>
              <span class="tb-fill" />
              <span class="coins" title={t("pet-coins")}><Coins aria-hidden="true" />{num(pet.state.coins)}</span>
              <button class="icon-btn sm" aria-label={t("pet-card-share")} title={t("pet-card-share")} disabled={sharing()} onClick={() => void share()}><Share2 /></button>
            </div>
            <div class="pet-facts">
              <div class="pet-fact" title={t("pet-age")}><Cake aria-hidden="true" /><strong>{num(petAgeDays(pet.state))}</strong><span>{t("pet-age-unit")}</span></div>
              <div class="pet-fact" title={t("pet-satisfaction")}><Smile aria-hidden="true" /><strong>{num(petSatisfaction(pet.state))}%</strong><span>{t("pet-satisfaction")}</span></div>
              <div class="pet-fact" title={t("pet-bond")}><Heart aria-hidden="true" /><strong>{num(Math.round(bond()))}%</strong><span>{t(`pet-bond-${petBondTier(bond())}` as "pet-bond-new")}</span></div>
              <div class="pet-fact" title={t("pet-xp", { xp: Math.round(pet.state.xp), next: xpNeededForLevel(pet.state.level) })}><Star aria-hidden="true" /><strong>{num(pet.state.level)}</strong><span>{t("pet-level-short")}</span></div>
            </div>
            <Bar label={t("pet-health")} value={pet.state.health} />
            <Bar label={t("pet-hunger")} value={pet.state.hunger} />
            <Bar label={t("pet-happiness")} value={pet.state.happiness} />
            <Bar label={t("pet-energy")} value={pet.state.energy} />
            <div class="row">
              <button class="btn sm" onClick={play}><Gamepad2 />{t("pet-play")}</button>
              <button class="btn sm" onClick={toggleSleep}>{pet.state.activity === "sleep" ? <><Sun />{t("pet-wake")}</> : <><Moon />{t("pet-sleep")}</>}</button>
            </div>
            <h4 class="section-title">{t("pet-food")}</h4>
            <div class="chip-grid">
              <For each={PET_FOOD_MENU}>{(f) => <button class="chip" disabled={pet.state.coins < f.cost} onClick={() => feed(f.id)}>{t(`pet-food-${f.id}` as "pet-food-warm-ramen")} · {num(f.cost)}</button>}</For>
            </div>
            <h4 class="section-title">{t("pet-shop")}</h4>
            <div class="chip-grid">
              <For each={PET_ACCESSORY_SHOP}>{(a) => {
                const owned = () => pet.state.ownedAccessories.includes(a.id);
                const on = () => pet.state.equippedAccessories.includes(a.id);
                return <button class="chip" aria-pressed={on()} onClick={() => { const r = buyOrToggleAccessory(snap(), a); if (r.action === "insufficient") toast(t("pet-no-coins"), true); else setPet(r.next); }}>{t(`pet-acc-${a.id}` as "pet-acc-headphones")} · {owned() ? (on() ? t("pet-equipped") : t("pet-owned")) : num(a.cost)}</button>;
              }}</For>
            </div>
            <h4 class="section-title">{t("pet-species")}</h4>
            <div class="chip-grid">
              <For each={PET_SPECIES_INFO}>{(sp) => <button class="chip" aria-pressed={!pet.state.customModelId && pet.state.species === sp.id} onClick={() => setPet({ ...snap(), species: sp.id, customModelId: undefined, customModelName: undefined })}>{t(`pet-species-${sp.id}`)}</button>}</For>
            </div>
          </div>
        </div>
      </Modal>
    </Show>
  );
}

/** Upload or remove a custom glTF/GLB companion model (lives in Settings). */
export function PetModelControls() {
  const upload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".glb,.gltf,model/gltf-binary";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const meta = await saveCustomPetModelFile(f);
        setPet({ ...snap(), customModelId: meta.id, customModelName: meta.name });
      } catch { toast(t("pet-model-failed"), true); }
    };
    input.click();
  };
  return (
    <div class="row wrap">
      <button class="btn sm" onClick={upload}><Upload />{t("pet-model-upload")}</button>
      <Show when={pet.state.customModelId}>
        <span class="muted sm" dir="auto">{pet.state.customModelName}</span>
        <button class="btn sm" onClick={() => { void deleteCustomPetModel(pet.state.customModelId!); setPet({ ...snap(), customModelId: undefined, customModelName: undefined }); }}><X />{t("pet-model-remove")}</button>
      </Show>
    </div>
  );
}

/** Small always-visible companion in the corner of the workspace. */
/** The start page has its own running companion, so the corner one steps aside. */
const onStartPage = () => { const a = activePath(); return !a || a === "app:start"; };

/** What the companion is saying: above the floating pet, or as a small card when it's hidden. */
export function PetBubble() {
  const floating = () => pref("petFloating") && !studioOpen() && !onStartPage() && !isMobile();
  return (
    <Show when={petLine()} keyed>
      {(l) => (
        <div class="pet-bubble glass-modal" classList={{ docked: floating() }} role="status" aria-live="polite" onClick={dismissPetLine}>
          <Show when={!floating()}><span class="pet-bubble-avatar" aria-hidden="true"><PawPrint /></span></Show>
          <span class="pet-bubble-text" dir="auto"><strong>{pet.state.name}</strong>{l.text}</span>
        </div>
      )}
    </Show>
  );
}

export function PetCompanion() {
  return (
    <Show when={pref("petFloating") && !studioOpen() && !onStartPage() && !isMobile()}>
      <div class="pet-float glass">
        <button class="pet-float-btn" aria-label={t("pet-open")} title={t("pet-open")} onClick={openPetStudio}>
          <PetViewport species={pet.state.species} activity={pet.state.activity} accessories={pet.state.equippedAccessories} customModelId={pet.state.customModelId} variant="mini" label={t("pet-label", { name: pet.state.name, mood: t(`pet-mood-${getPetMoodLabel(pet.state).toLowerCase()}` as "pet-mood-happy") })} />
        </button>
        <button class="icon-btn sm pet-float-close" aria-label={t("pet-hide")} title={t("pet-hide")} onClick={() => setPref("petFloating", false)}><X /></button>
      </div>
    </Show>
  );
}
