import type {
  PetAccessoryItem,
  PetActivityState,
  PetFoodItem,
  PetSpecies,
  PetState
} from './types';

export interface PetSpeciesMeta {
  id: PetSpecies;
  name: string;
  tagline: string;
  accent: string;
  houseStyle: 'den' | 'observatory' | 'sunroom' | 'pavilion';
  houseTitle: string;
  houseDescription: string;
  houseThemeGradient: string;
}

export const PET_SPECIES_INFO: PetSpeciesMeta[] = [
  {
    id: 'fox',
    name: 'Carbon Fox',
    tagline: 'Sharp focus & late-night research',
    accent: '#2563eb',
    houseStyle: 'den',
    houseTitle: 'Cozy Burrow Study Den',
    houseDescription: 'Warm timber bookshelves, amber reading lamp, and forest burrow alcove.',
    houseThemeGradient: 'from-amber-950/80 via-slate-950/70 to-blue-950/80'
  },
  {
    id: 'owl',
    name: 'Archivist Owl',
    tagline: 'Wisdom keeper & card reviewer',
    accent: '#0ea5e9',
    houseStyle: 'observatory',
    houseTitle: 'Starlight Canopy Observatory',
    houseDescription: 'Elevated glass treehouse dome with brass astrolabe and nocturnal library.',
    houseThemeGradient: 'from-sky-950/80 via-indigo-950/75 to-slate-950/85'
  },
  {
    id: 'cat',
    name: 'Sakura Cat',
    tagline: 'Calm writing desk companion',
    accent: '#ec4899',
    houseStyle: 'sunroom',
    houseTitle: 'Sakura Sunroom Loft',
    houseDescription: 'Sunlit tatami bay window, blossom breeze, and plush velvet cushions.',
    houseThemeGradient: 'from-rose-950/75 via-fuchsia-950/65 to-slate-950/80'
  },
  {
    id: 'panda',
    name: 'Bamboo Panda',
    tagline: 'Steady patience & mindful deep work',
    accent: '#10b981',
    houseStyle: 'pavilion',
    houseTitle: 'Bamboo Tea Pavilion',
    houseDescription: 'Misty bamboo grove veranda, warm tea table, and serene stone lanterns.',
    houseThemeGradient: 'from-emerald-950/80 via-teal-950/70 to-slate-950/80'
  },
  {
    id: 'bunny',
    name: 'Meadow Bunny',
    tagline: 'Quick reviews and light reading',
    accent: '#f9a8d4',
    houseStyle: 'sunroom',
    houseTitle: 'Clover Meadow Nook',
    houseDescription: 'Soft clover rug, carrot basket and a sunny window.',
    houseThemeGradient: ''
  },
  {
    id: 'pup',
    name: 'Golden Pup',
    tagline: 'Loyal company for long sessions',
    accent: '#f59e0b',
    houseStyle: 'den',
    houseTitle: 'Fireside Kennel',
    houseDescription: 'Warm blanket, chew toy and a fireplace.',
    houseThemeGradient: ''
  }
];

export const PET_FOOD_MENU: PetFoodItem[] = [
  {
    id: 'blueberry-tart',
    name: 'Blueberry Tart',
    cost: 20,
    hungerBoost: 24,
    happinessBoost: 14,
    healthBoost: 10,
    xpBoost: 18,
    accent: '#2563eb',
    speciesAffinity: 'fox'
  },
  {
    id: 'honey-matcha',
    name: 'Honey Matcha',
    cost: 24,
    hungerBoost: 18,
    happinessBoost: 24,
    healthBoost: 12,
    xpBoost: 22,
    accent: '#ec4899',
    speciesAffinity: 'cat'
  },
  {
    id: 'starlight-seed',
    name: 'Starlight Seeds',
    cost: 18,
    hungerBoost: 22,
    happinessBoost: 12,
    healthBoost: 10,
    xpBoost: 15,
    accent: '#0ea5e9',
    speciesAffinity: 'owl'
  },
  {
    id: 'bamboo-mochi',
    name: 'Bamboo Mochi',
    cost: 22,
    hungerBoost: 26,
    happinessBoost: 20,
    healthBoost: 14,
    xpBoost: 20,
    accent: '#10b981',
    speciesAffinity: 'panda'
  },
  {
    id: 'warm-ramen',
    name: 'Midnight Ramen',
    cost: 35,
    hungerBoost: 40,
    happinessBoost: 28,
    healthBoost: 22,
    xpBoost: 32,
    accent: '#f59e0b'
  }
];

export const PET_ACCESSORY_SHOP: PetAccessoryItem[] = [
  {
    id: 'carbon-cap',
    name: 'Carbon Cap',
    slot: 'head',
    cost: 40,
    description: 'Signature NoSidian carbon-blue cap'
  },
  {
    id: 'scholar-glasses',
    name: 'Scholar Glasses',
    slot: 'head',
    cost: 55,
    description: 'Precision titanium reading frames'
  },
  {
    id: 'cozy-scarf',
    name: 'Arctic Scarf',
    slot: 'neck',
    cost: 45,
    description: 'Warm knit scarf for snowy themes'
  },
  {
    id: 'star-lantern',
    name: 'Star Lantern',
    slot: 'aura',
    cost: 70,
    description: 'Floating focus lantern beside your pet'
  },
  {
    id: 'headphones',
    name: 'Studio Headphones',
    slot: 'head',
    cost: 65,
    description: 'Lo-fi ambient study headset'
  }
];

const clampStat = (val: unknown, fallback: number): number => {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
};

export function createDefaultPetState(now = Date.now()): PetState {
  return {
    species: 'fox',
    name: 'Kuro',
    health: 92,
    hunger: 74,
    happiness: 80,
    energy: 85,
    activity: 'idle',
    level: 1,
    xp: 20,
    coins: 120,
    ownedAccessories: ['carbon-cap'],
    equippedAccessories: ['carbon-cap'],
    lastInteractionAt: now,
    playWindowStart: now,
    playCoinsUsedInWindow: 0,
    bornAt: now,
    bond: 20
  };
}

export function normalizePetState(raw?: Partial<PetState> | null, now = Date.now()): PetState {
  const base = createDefaultPetState(now);
  if (!raw || typeof raw !== 'object') return base;
  const validSpecies: PetSpecies[] = ['fox', 'owl', 'cat', 'panda', 'bunny', 'pup'];
  const validActivities: PetActivityState[] = ['idle', 'playing', 'sleep', 'feeding'];
  const normalizedEnergy = clampStat(raw.energy, base.energy);
  const rawActivity = validActivities.includes(raw.activity as PetActivityState)
    ? (raw.activity as PetActivityState)
    : 'idle';
  return {
    species: validSpecies.includes(raw.species as PetSpecies)
      ? (raw.species as PetSpecies)
      : base.species,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 28) : base.name,
    health: clampStat(raw.health, base.health),
    hunger: clampStat(raw.hunger, base.hunger),
    happiness: clampStat(raw.happiness, base.happiness),
    energy: normalizedEnergy,
    activity: normalizedEnergy === 0 ? 'sleep' : rawActivity,
    level: typeof raw.level === 'number' && raw.level >= 1 ? Math.floor(raw.level) : base.level,
    xp: typeof raw.xp === 'number' && raw.xp >= 0 ? Math.floor(raw.xp) : base.xp,
    coins: typeof raw.coins === 'number' && raw.coins >= 0 ? Math.floor(raw.coins) : base.coins,
    ownedAccessories: Array.isArray(raw.ownedAccessories)
      ? raw.ownedAccessories.filter((x): x is string => typeof x === 'string')
      : base.ownedAccessories,
    equippedAccessories: Array.isArray(raw.equippedAccessories)
      ? raw.equippedAccessories.filter((x): x is string => typeof x === 'string')
      : base.equippedAccessories,
    lastInteractionAt:
      typeof raw.lastInteractionAt === 'number' && Number.isFinite(raw.lastInteractionAt)
        ? raw.lastInteractionAt
        : now,
    playWindowStart:
      typeof raw.playWindowStart === 'number' && Number.isFinite(raw.playWindowStart)
        ? raw.playWindowStart
        : now,
    playCoinsUsedInWindow:
      typeof raw.playCoinsUsedInWindow === 'number' && raw.playCoinsUsedInWindow >= 0
        ? Math.floor(raw.playCoinsUsedInWindow)
        : 0,
    customModelId:
      typeof raw.customModelId === 'string' && raw.customModelId.trim()
        ? raw.customModelId.trim()
        : undefined,
    customModelName:
      typeof raw.customModelName === 'string' && raw.customModelName.trim()
        ? raw.customModelName.trim().slice(0, 64)
        : undefined,
    bornAt: typeof raw.bornAt === 'number' && Number.isFinite(raw.bornAt) && raw.bornAt <= now ? raw.bornAt : now,
    bond: typeof raw.bond === 'number' && Number.isFinite(raw.bond) ? Math.max(0, Math.min(100, Math.round(raw.bond * 10) / 10)) : 20
  };
}

/** Overall contentment (0..100) from the four needs, weighted toward mood and health. */
export function petSatisfaction(s: PetState): number {
  return Math.round(s.happiness * 0.35 + s.health * 0.25 + s.hunger * 0.25 + s.energy * 0.15);
}

/** Whole days since adoption. */
export function petAgeDays(s: PetState, now = Date.now()): number {
  return Math.max(0, Math.floor((now - (s.bornAt ?? now)) / 86_400_000));
}

export type BondTier = 'new' | 'friendly' | 'close' | 'best';
export function petBondTier(bond: number): BondTier {
  return bond >= 85 ? 'best' : bond >= 60 ? 'close' : bond >= 30 ? 'friendly' : 'new';
}

export function renamePet(state: PetState, nextName: string): PetState {
  const cleaned = nextName.trim().slice(0, 28);
  if (!cleaned) return state;
  return { ...state, name: cleaned };
}

export function setPetActivity(
  state: PetState,
  activity: PetActivityState,
  now = Date.now()
): PetState {
  return { ...state, activity, lastInteractionAt: now };
}

export function xpNeededForLevel(level: number): number {
  return 80 + (level - 1) * 45;
}

export function applyPetXp(state: PetState, deltaXp: number): PetState {
  let xp = state.xp + deltaXp;
  let level = state.level;
  while (xp >= xpNeededForLevel(level)) {
    xp -= xpNeededForLevel(level);
    level += 1;
  }
  return { ...state, xp, level };
}

export function feedPet(
  state: PetState,
  food: PetFoodItem,
  now = Date.now()
): { next: PetState; ok: boolean; bonusApplied: boolean } {
  if (state.coins < food.cost) {
    return { next: state, ok: false, bonusApplied: false };
  }
  const bonus = food.speciesAffinity === state.species ? 1.25 : 1;
  const hunger = Math.min(100, Math.round(state.hunger + food.hungerBoost * bonus));
  const happiness = Math.min(100, Math.round(state.happiness + food.happinessBoost * bonus));
  const healthBoost = food.healthBoost ?? 10;
  const health = Math.min(100, Math.round(state.health + healthBoost * bonus));
  const energy = Math.min(100, state.energy + 6);
  const updated = applyPetXp(
    {
      ...state,
      coins: state.coins - food.cost,
      hunger,
      happiness,
      health,
      energy,
      activity: 'feeding',
      lastInteractionAt: now
    },
    Math.round(food.xpBoost * bonus)
  );
  return { next: updated, ok: true, bonusApplied: bonus > 1 };
}

export const PET_PLAY_ENERGY_COST = 35;
export const PET_PLAY_MAX_COIN_REWARDS = 2;
export const PET_PLAY_COIN_WINDOW_MS = 15 * 60_000;
export const PET_PLAY_COIN_REWARD = 2;

export function getRemainingPlayCoinCharges(state: PetState, now = Date.now()): number {
  const inWindow =
    typeof state.playWindowStart === 'number' &&
    now - state.playWindowStart < PET_PLAY_COIN_WINDOW_MS;
  const used = inWindow ? Math.max(0, state.playCoinsUsedInWindow || 0) : 0;
  return Math.max(0, PET_PLAY_MAX_COIN_REWARDS - used);
}

export interface PetPlayOutcome {
  next: PetState;
  played: boolean;
  coinsAwarded: number;
  fellAsleep: boolean;
  chargesRemaining: number;
  reason?: 'sleeping' | 'exhausted' | 'cooldown';
}

export function performPetPlay(state: PetState, now = Date.now()): PetPlayOutcome {
  if (state.activity === 'sleep') {
    return {
      next: state,
      played: false,
      coinsAwarded: 0,
      fellAsleep: state.energy <= 0,
      chargesRemaining: getRemainingPlayCoinCharges(state, now),
      reason: 'sleeping'
    };
  }
  if (state.energy <= 0) {
    return {
      next: { ...state, energy: 0, activity: 'sleep', lastInteractionAt: now },
      played: false,
      coinsAwarded: 0,
      fellAsleep: true,
      chargesRemaining: getRemainingPlayCoinCharges(state, now),
      reason: 'exhausted'
    };
  }

  const nextEnergy = Math.max(0, state.energy - PET_PLAY_ENERGY_COST);
  const fellAsleep = nextEnergy === 0;
  const inWindow =
    typeof state.playWindowStart === 'number' &&
    now - state.playWindowStart < PET_PLAY_COIN_WINDOW_MS;
  const windowStart = inWindow ? state.playWindowStart! : now;
  const usedBefore = inWindow ? Math.max(0, state.playCoinsUsedInWindow || 0) : 0;
  const canEarnCoin = usedBefore < PET_PLAY_MAX_COIN_REWARDS;
  const coinsAwarded = canEarnCoin ? PET_PLAY_COIN_REWARD : 0;
  const nextUsed = canEarnCoin ? usedBefore + 1 : usedBefore;
  const chargesRemaining = Math.max(0, PET_PLAY_MAX_COIN_REWARDS - nextUsed);

  const happiness = Math.min(100, state.happiness + (canEarnCoin ? 10 : 4));
  const health = Math.min(100, state.health + (canEarnCoin ? 3 : 1));
  const next = applyPetXp(
    {
      ...state,
      happiness,
      health,
      energy: nextEnergy,
      activity: fellAsleep ? 'sleep' : 'playing',
      coins: state.coins + coinsAwarded,
      lastInteractionAt: now,
      playWindowStart: windowStart,
      playCoinsUsedInWindow: nextUsed
    },
    canEarnCoin ? 10 : 2
  );

  return {
    next,
    played: true,
    coinsAwarded,
    fellAsleep,
    chargesRemaining,
    reason: canEarnCoin ? undefined : 'cooldown'
  };
}

export function petInteractionPlay(state: PetState, now = Date.now()): PetState {
  return performPetPlay(state, now).next;
}

export function petInteractionSleep(state: PetState, now = Date.now()): PetState {
  return {
    ...state,
    activity: 'sleep',
    lastInteractionAt: now
  };
}

export function petInteractionWake(state: PetState, now = Date.now()): PetState {
  return {
    ...state,
    activity: 'idle',
    lastInteractionAt: now
  };
}

export function tickPetSleepRecovery(state: PetState, now = Date.now()): PetState {
  if (state.activity !== 'sleep') return state;
  const nextEnergy = Math.min(100, state.energy + 8);
  const nextHealth = Math.min(100, state.health + 2);
  const finished = nextEnergy >= 100;
  return {
    ...state,
    energy: nextEnergy,
    health: nextHealth,
    activity: finished ? 'idle' : 'sleep',
    lastInteractionAt: now
  };
}

export function buyOrToggleAccessory(
  state: PetState,
  item: PetAccessoryItem
): { next: PetState; ok: boolean; action: 'bought' | 'equipped' | 'unequipped' | 'insufficient' } {
  const owned = state.ownedAccessories.includes(item.id);
  if (!owned) {
    if (state.coins < item.cost) {
      return { next: state, ok: false, action: 'insufficient' };
    }
    const sameSlotIds = PET_ACCESSORY_SHOP.filter(a => a.slot === item.slot).map(a => a.id);
    const nextEquipped = [
      ...state.equippedAccessories.filter(id => !sameSlotIds.includes(id)),
      item.id
    ];
    return {
      next: {
        ...state,
        coins: state.coins - item.cost,
        ownedAccessories: [...state.ownedAccessories, item.id],
        equippedAccessories: nextEquipped
      },
      ok: true,
      action: 'bought'
    };
  }

  const isEquipped = state.equippedAccessories.includes(item.id);
  if (isEquipped) {
    return {
      next: {
        ...state,
        equippedAccessories: state.equippedAccessories.filter(id => id !== item.id)
      },
      ok: true,
      action: 'unequipped'
    };
  }

  const sameSlotIds = PET_ACCESSORY_SHOP.filter(a => a.slot === item.slot).map(a => a.id);
  return {
    next: {
      ...state,
      equippedAccessories: [
        ...state.equippedAccessories.filter(id => !sameSlotIds.includes(id)),
        item.id
      ]
    },
    ok: true,
    action: 'equipped'
  };
}

export function getPetMoodLabel(state: PetState): 'Ecstatic' | 'Happy' | 'Hungry' | 'Sleepy' {
  if (state.activity === 'sleep') return 'Sleepy';
  if (state.hunger < 30 || state.health < 35) return 'Hungry';
  if (state.energy < 25) return 'Sleepy';
  if (state.happiness >= 80 && state.hunger >= 60) return 'Ecstatic';
  return 'Happy';
}

export const PET_STUDY_COIN_INTERVAL_SEC = 30;
export const PET_STUDY_COINS_PER_INTERVAL = 3;

export function awardPetStudyCoins(
  state: PetState,
  accumulatedSeconds: number,
  now = Date.now(),
  intervalSec = PET_STUDY_COIN_INTERVAL_SEC,
  coinsPerInterval = PET_STUDY_COINS_PER_INTERVAL
): { next: PetState; awardedCoins: number; remainderSeconds: number } {
  if (accumulatedSeconds < intervalSec || intervalSec <= 0) {
    return { next: state, awardedCoins: 0, remainderSeconds: Math.max(0, accumulatedSeconds) };
  }
  const intervals = Math.floor(accumulatedSeconds / intervalSec);
  const remainderSeconds = accumulatedSeconds % intervalSec;
  const awardedCoins = intervals * coinsPerInterval;
  const updated = applyPetXp(
    {
      ...state,
      coins: state.coins + awardedCoins,
      happiness: Math.min(100, state.happiness + intervals),
      lastInteractionAt: now
    },
    intervals * 4
  );
  return { next: updated, awardedCoins, remainderSeconds };
}

export type PetVaultActivityKind =
  | 'create-note'
  | 'review-card'
  | 'complete-task'
  | 'snapshot'
  | 'zen-complete';

const VAULT_ACTIVITY_REWARDS: Record<PetVaultActivityKind, { coins: number; xp: number }> = {
  'create-note': { coins: 4, xp: 8 },
  'review-card': { coins: 3, xp: 6 },
  'complete-task': { coins: 4, xp: 8 },
  snapshot: { coins: 2, xp: 4 },
  'zen-complete': { coins: 12, xp: 20 }
};

export function awardPetVaultActivity(
  state: PetState,
  kind: PetVaultActivityKind,
  now = Date.now()
): { next: PetState; coinsAwarded: number } {
  const reward = VAULT_ACTIVITY_REWARDS[kind];
  const updated = applyPetXp(
    {
      ...state,
      coins: state.coins + reward.coins,
      happiness: Math.min(100, state.happiness + 2),
      lastInteractionAt: now
    },
    reward.xp
  );
  return { next: updated, coinsAwarded: reward.coins };
}

export function resolvePetMusicActivity(
  state: PetState,
  isAudioPlaying: boolean,
  now = Date.now()
): PetState {
  if (state.activity === 'sleep' && state.energy <= 20) {
    return state;
  }
  if (isAudioPlaying) {
    if (state.activity === 'playing') return state;
    return {
      ...state,
      activity: 'playing',
      lastInteractionAt: now
    };
  }
  if (state.activity === 'playing') {
    return {
      ...state,
      activity: 'idle',
      lastInteractionAt: now
    };
  }
  return state;
}
