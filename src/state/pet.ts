// Companion pet: stats and coins live app-wide (not per vault). Study time,
// reviews, finished tasks and focus sessions earn coins; needs decay slowly.
import { appDoc } from "./persist";
import { awardPetStudyCoins, awardPetVaultActivity, normalizePetState, tickPetSleepRecovery, type PetVaultActivityKind } from "../core/pet";
import type { PetState } from "../core/types";
import { settings } from "./settings";

export const pet = appDoc<PetState>("pet", () => normalizePetState(null));

export function setPet(next: PetState): void {
  pet.replace(normalizePetState(next));
}

export function rewardPet(kind: PetVaultActivityKind): number {
  if (!settings.petEnabled) return 0;
  const r = awardPetVaultActivity(JSON.parse(JSON.stringify(pet.state)), kind);
  setPet(r.next);
  return r.coinsAwarded;
}

let studySeconds = 0;
/** Called once a second while the user is actively studying or writing. */
export function petStudyTick(): void {
  if (!settings.petEnabled) return;
  studySeconds++;
  const r = awardPetStudyCoins(JSON.parse(JSON.stringify(pet.state)), studySeconds);
  studySeconds = r.remainderSeconds;
  if (r.awardedCoins) setPet(r.next);
}

/** Slow decay of hunger/energy and sleep recovery; runs every minute. */
if (typeof window !== "undefined") {
  setInterval(() => {
    if (!settings.petEnabled || !pet.ready()) return;
    const s = JSON.parse(JSON.stringify(pet.state)) as PetState;
    let next = tickPetSleepRecovery(s);
    if (next.activity !== "sleep") next = { ...next, hunger: Math.max(0, next.hunger - 0.4), energy: Math.max(0, next.energy - 0.2), happiness: Math.max(0, next.happiness - (next.hunger < 25 ? 0.5 : 0.1)) };
    setPet(next);
  }, 60_000);
}

// Vault activity from anywhere (notes created, cards reviewed, tasks done).
if (typeof window !== "undefined") {
  window.addEventListener("nosidian:activity", (e) => rewardPet((e as CustomEvent<PetVaultActivityKind>).detail));
}
