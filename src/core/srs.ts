import type {
  DeckPreset,
  Flashcard,
  FlashcardReviewLog,
  Note,
  SRSCardState,
  SRSRating,
  StreakFreezeConfig
} from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

export const DEFAULT_DECK_PRESET: DeckPreset = {
  id: 'default',
  name: 'Balanced Mastery',
  algorithm: 'fsrs',
  newPerDay: 20,
  reviewsPerDay: 120,
  difficultyMultiplier: 1.0,
  order: 'due-first',
  leechThreshold: 5,
  fuzzEnabled: true,
  loadBalanceEnabled: true,
  burySiblings: true
};

export const BUILTIN_PRESETS: DeckPreset[] = [
  DEFAULT_DECK_PRESET,
  {
    id: 'medical-intensive',
    name: 'Medical / Exam Intensive (FSRS)',
    algorithm: 'fsrs',
    newPerDay: 45,
    reviewsPerDay: 250,
    difficultyMultiplier: 0.88,
    order: 'due-first',
    leechThreshold: 6,
    fuzzEnabled: true,
    loadBalanceEnabled: true,
    burySiblings: true
  },
  {
    id: 'language-classic',
    name: 'Language Fluency (SM-2)',
    algorithm: 'sm2',
    newPerDay: 25,
    reviewsPerDay: 150,
    difficultyMultiplier: 1.0,
    order: 'new-first',
    leechThreshold: 4,
    fuzzEnabled: true,
    loadBalanceEnabled: true,
    burySiblings: true
  }
];

export function createInitialSRSState(
  cardId: string,
  algorithm: 'sm2' | 'fsrs' = 'fsrs',
  now = Date.now(),
  partial?: Partial<SRSCardState>
): SRSCardState {
  return {
    cardId,
    algorithm,
    reps: 0,
    lapses: 0,
    intervalDays: 0,
    ease: 2.5,
    stability: 0,
    difficulty: 5.0,
    dueAt: now,
    lastReviewedAt: 0,
    avgTimeMs: 0,
    reviewCount: 0,
    updatedAt: now,
    ...partial
  };
}

function deterministicFuzz(cardId: string, reps: number, intervalDays: number): number {
  if (intervalDays < 4) return intervalDays;
  let h = 0;
  const seed = `${cardId}:${reps}`;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const pct = ((Math.abs(h) % 11) - 5) / 100; // -5% .. +5%
  return Math.max(1, intervalDays * (1 + pct));
}

function loadBalanceDays(
  targetDays: number,
  allStates: Record<string, SRSCardState>,
  now: number
): number {
  if (targetDays < 3) return targetDays;
  const baseDay = Math.floor((now + targetDays * DAY_MS) / DAY_MS);
  const window = targetDays >= 14 ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
  const counts = new Map<number, number>();
  window.forEach(d => counts.set(baseDay + d, 0));

  Object.values(allStates).forEach(st => {
    if (st.suspended) return;
    const dueDay = Math.floor(st.dueAt / DAY_MS);
    if (counts.has(dueDay)) {
      counts.set(dueDay, (counts.get(dueDay) || 0) + 1);
    }
  });

  let bestOffset = 0;
  let bestCount = counts.get(baseDay) || 0;
  for (const off of window) {
    const c = counts.get(baseDay + off) || 0;
    if (c < bestCount) {
      bestCount = c;
      bestOffset = off;
    }
  }
  return Math.max(1, targetDays + bestOffset);
}

export function scheduleCardReview(
  prevState: SRSCardState | undefined,
  cardId: string,
  rating: SRSRating,
  preset: DeckPreset,
  now = Date.now(),
  allStates: Record<string, SRSCardState> = {},
  durationMs = 4000
): SRSCardState {
  const algo = preset.algorithm;
  const st = prevState ? { ...prevState } : createInitialSRSState(cardId, algo, now);
  st.algorithm = algo;

  let nextIntervalDays = 0;

  if (algo === 'sm2') {
    const qMap: Record<SRSRating, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };
    const q = qMap[rating];
    if (rating === 1) {
      st.reps = 0;
      st.lapses += 1;
      nextIntervalDays = 10 / (24 * 60); // 10 minutes
      st.ease = Math.max(1.3, st.ease - 0.2);
    } else {
      if (st.reps === 0) {
        nextIntervalDays = rating === 2 ? 0.5 : rating === 3 ? 1 : 4;
      } else if (st.reps === 1) {
        nextIntervalDays = rating === 2 ? 3 : rating === 3 ? 6 : 8;
      } else {
        const mult = rating === 2 ? 1.2 : rating === 3 ? st.ease : st.ease * 1.3;
        nextIntervalDays = Math.max(1, st.intervalDays * mult);
      }
      st.reps += 1;
      st.ease = Math.max(1.3, st.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    }
  } else {
    // FSRS-inspired stability & difficulty scheduler
    const elapsedDays = st.lastReviewedAt > 0 ? Math.max(0.01, (now - st.lastReviewedAt) / DAY_MS) : 0;
    const initStability: Record<SRSRating, number> = { 1: 0.4, 2: 1.2, 3: 3.5, 4: 7.5 };
    const initDiff: Record<SRSRating, number> = { 1: 7.5, 2: 6.2, 3: 4.8, 4: 3.2 };

    if (st.reps === 0) {
      st.stability = initStability[rating];
      st.difficulty = initDiff[rating];
      if (rating === 1) {
        st.lapses += 1;
        nextIntervalDays = 10 / (24 * 60);
      } else {
        st.reps = 1;
        nextIntervalDays = st.stability;
      }
    } else {
      const retrievability = Math.pow(1 + elapsedDays / (9 * Math.max(0.4, st.stability)), -1);
      // Mean-reversion difficulty update
      const deltaD = -0.6 * (rating - 3);
      st.difficulty = Math.min(10, Math.max(1, 0.9 * (st.difficulty + deltaD) + 0.1 * 5));

      if (rating === 1) {
        st.lapses += 1;
        st.reps = 1;
        st.stability = Math.max(0.4, st.stability * 0.28);
        nextIntervalDays = 10 / (24 * 60);
      } else {
        const hardPenalty = rating === 2 ? 0.72 : 1;
        const easyBonus = rating === 4 ? 1.38 : 1;
        const gain =
          1 +
          Math.exp(1.1) *
            (11 - st.difficulty) *
            Math.pow(Math.max(0.5, st.stability), -0.25) *
            (Math.exp((1 - retrievability) * 1.4) - 1) *
            hardPenalty *
            easyBonus;
        st.stability = Math.min(3650, Math.max(1, st.stability * Math.max(1.15, gain)));
        st.reps += 1;
        nextIntervalDays = st.stability;
      }
    }
  }

  // Apply deck preset difficulty multiplier for intervals >= 0.5 day
  if (nextIntervalDays >= 0.4) {
    nextIntervalDays = Math.max(0.5, nextIntervalDays * preset.difficultyMultiplier);
  }

  if (preset.fuzzEnabled && nextIntervalDays >= 4) {
    nextIntervalDays = deterministicFuzz(cardId, st.reps, nextIntervalDays);
  }

  if (preset.loadBalanceEnabled && nextIntervalDays >= 3) {
    nextIntervalDays = loadBalanceDays(Math.round(nextIntervalDays), allStates, now);
  }

  const isLeech = st.lapses >= preset.leechThreshold;
  st.leech = isLeech;
  if (isLeech && rating === 1) {
    st.suspended = true;
  }

  st.intervalDays = nextIntervalDays;
  st.lastReviewedAt = now;
  st.dueAt = now + nextIntervalDays * DAY_MS;
  st.reviewCount += 1;
  st.avgTimeMs =
    st.reviewCount === 1
      ? durationMs
      : Math.round((st.avgTimeMs * (st.reviewCount - 1) + durationMs) / st.reviewCount);
  st.updatedAt = now;

  return st;
}

export function formatIntervalShort(days: number): string {
  if (days <= 0) return 'Now';
  const mins = Math.round(days * 24 * 60);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(days * 24);
  if (hrs < 24) return `${hrs}h`;
  const d = Math.round(days);
  if (d < 30) return `${d}d`;
  if (d < 365) return `${(d / 30).toFixed(1)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export function previewRatingIntervals(
  prevState: SRSCardState | undefined,
  cardId: string,
  preset: DeckPreset,
  now = Date.now(),
  allStates: Record<string, SRSCardState> = {}
): Record<SRSRating, string> {
  const noLoadPreset = { ...preset, loadBalanceEnabled: false, fuzzEnabled: false };
  return {
    1: formatIntervalShort(scheduleCardReview(prevState, cardId, 1, noLoadPreset, now, allStates).intervalDays),
    2: formatIntervalShort(scheduleCardReview(prevState, cardId, 2, noLoadPreset, now, allStates).intervalDays),
    3: formatIntervalShort(scheduleCardReview(prevState, cardId, 3, noLoadPreset, now, allStates).intervalDays),
    4: formatIntervalShort(scheduleCardReview(prevState, cardId, 4, noLoadPreset, now, allStates).intervalDays)
  };
}

export function getEndOfDayTs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function isCardDue(state: SRSCardState | undefined, now = Date.now()): boolean {
  if (!state) return true;
  if (state.suspended) return false;
  if (state.buriedUntil && state.buriedUntil > now) return false;
  return state.dueAt <= now;
}

export function isCardLockedByDependency(
  card: Flashcard,
  allCards: Flashcard[],
  states: Record<string, SRSCardState>
): { locked: boolean; unmet: string[] } {
  if (!card.dependencies.length) return { locked: false, unmet: [] };
  const unmet: string[] = [];
  for (const dep of card.dependencies) {
    const cleanDep = dep.replace(/^\^/, '').toLowerCase();
    const prereqs = allCards.filter(
      c =>
        c.id !== card.id &&
        (c.blockId?.toLowerCase() === cleanDep ||
          c.sourceName.toLowerCase() === cleanDep ||
          c.sourcePath.toLowerCase() === cleanDep)
    );
    if (prereqs.length > 0) {
      const mastered = prereqs.every(p => {
        const st = states[p.id];
        return st && st.reps >= 1 && st.intervalDays >= 1;
      });
      if (!mastered) unmet.push(dep);
    }
  }
  return { locked: unmet.length > 0, unmet };
}

export interface DiffSegment {
  text: string;
  status: 'match' | 'missing' | 'extra';
}

export function diffTypedAnswer(
  typed: string,
  expected: string,
  opts: { ignoreCase: boolean; ignorePunctuation: boolean; ignoreDiacritics: boolean }
): { accuracy: number; isExact: boolean; segments: DiffSegment[] } {
  const normalize = (s: string) => {
    let out = s.trim();
    if (opts.ignoreDiacritics) {
      out = out.normalize('NFD').replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '');
    }
    if (opts.ignorePunctuation) {
      out = out.replace(/[^\p{L}\p{N}\s]/gu, '');
    }
    if (opts.ignoreCase) {
      out = out.toLowerCase();
    }
    return out.replace(/\s+/g, ' ').trim();
  };

  const cleanExpected = expected.replace(/==|\*\*|`/g, '');
  const normTyped = normalize(typed);
  const normExpected = normalize(cleanExpected);

  if (normTyped === normExpected) {
    return {
      accuracy: 100,
      isExact: true,
      segments: [{ text: cleanExpected, status: 'match' }]
    };
  }

  const a = normTyped.split(' ').filter(Boolean);
  const b = normExpected.split(' ').filter(Boolean);
  const expectedDisplayWords = cleanExpected.split(/\s+/).filter(Boolean);

  const segments: DiffSegment[] = [];
  let matches = 0;
  const maxLen = Math.max(a.length, b.length, 1);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const tw = a[i];
    const ew = b[i];
    const disp = expectedDisplayWords[i] || ew || '';
    if (tw && ew && tw === ew) {
      matches++;
      segments.push({ text: disp, status: 'match' });
    } else {
      if (tw && !b.includes(tw)) {
        segments.push({ text: tw, status: 'extra' });
      }
      if (ew) {
        segments.push({ text: disp, status: 'missing' });
      }
    }
  }

  const accuracy = Math.round((matches / maxLen) * 100);
  return { accuracy, isExact: false, segments };
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export function computeContributionHeatmap(
  logs: FlashcardReviewLog[],
  days = 140,
  now = Date.now()
): ContributionDay[] {
  const counts = new Map<string, number>();
  logs.forEach(l => {
    const key = new Date(l.timestamp).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const out: ContributionDay[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * DAY_MS).toISOString().slice(0, 10);
    const count = counts.get(date) || 0;
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
    out.push({ date, count, level });
  }
  return out;
}

export function computeStreakWithFreeze(
  logs: FlashcardReviewLog[],
  freezeConfig: StreakFreezeConfig,
  now = Date.now()
): { currentStreak: number; longestStreak: number; freezesUsedThisWeek: number } {
  const activeDates = new Set(logs.map(l => new Date(l.timestamp).toISOString().slice(0, 10)));
  let currentStreak = 0;
  let longestStreak = 0;
  let running = 0;
  let freezesLeft = freezeConfig.freezeDaysPerWeek;
  let freezesUsed = 0;

  for (let d = 0; d < 180; d++) {
    const dt = new Date(now - d * DAY_MS);
    const iso = dt.toISOString().slice(0, 10);
    const weekday = dt.getDay();

    if (activeDates.has(iso)) {
      running++;
      longestStreak = Math.max(longestStreak, running);
    } else if (freezeConfig.restWeekdays.includes(weekday)) {
      // Scheduled rest day preserves streak
      continue;
    } else if (d === 0) {
      // Today hasn't been studied yet; don't break yesterday's active streak
      continue;
    } else if (freezesLeft > 0) {
      freezesLeft--;
      freezesUsed++;
      continue;
    } else {
      if (currentStreak === 0) currentStreak = running;
      running = 0;
    }

    if (d % 7 === 6) {
      freezesLeft = freezeConfig.freezeDaysPerWeek;
    }
  }
  if (currentStreak === 0) currentStreak = running;
  return { currentStreak, longestStreak, freezesUsedThisWeek: freezesUsed };
}

export function computeTrueRetention(logs: FlashcardReviewLog[]): {
  rate: number;
  passed: number;
  total: number;
} {
  const nonCram = logs.filter(l => !l.cram);
  if (nonCram.length === 0) return { rate: 0, passed: 0, total: 0 };
  const passed = nonCram.filter(l => l.rating >= 2).length;
  return {
    rate: Math.round((passed / nonCram.length) * 100),
    passed,
    total: nonCram.length
  };
}

export function computeWorkloadForecast(
  cards: Flashcard[],
  states: Record<string, SRSCardState>,
  days = 30,
  now = Date.now()
): Array<{ dayOffset: number; label: string; count: number }> {
  const buckets = new Array<number>(days).fill(0);
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);

  cards.forEach(c => {
    const st = states[c.id];
    if (st?.suspended) return;
    const due = st ? st.dueAt : now;
    const diff = Math.max(0, Math.floor((due - startOfToday) / DAY_MS));
    if (diff < days) {
      buckets[diff]++;
    }
  });

  return buckets.map((count, dayOffset) => {
    const d = new Date(startOfToday + dayOffset * DAY_MS);
    return {
      dayOffset,
      label: dayOffset === 0 ? 'Today' : `${d.getMonth() + 1}/${d.getDate()}`,
      count
    };
  });
}

export function computeTagBreakdown(
  cards: Flashcard[],
  states: Record<string, SRSCardState>
): Array<{ tag: string; total: number; due: number; lapses: number; avgTimeSec: number }> {
  const map = new Map<
    string,
    { total: number; due: number; lapses: number; timeSum: number; timeCnt: number }
  >();
  const now = Date.now();

  cards.forEach(c => {
    const st = states[c.id];
    const tags = c.tags.length ? c.tags : [c.folder];
    tags.forEach(tg => {
      const cur = map.get(tg) || { total: 0, due: 0, lapses: 0, timeSum: 0, timeCnt: 0 };
      cur.total++;
      if (isCardDue(st, now)) cur.due++;
      if (st) {
        cur.lapses += st.lapses;
        if (st.avgTimeMs > 0) {
          cur.timeSum += st.avgTimeMs;
          cur.timeCnt++;
        }
      }
      map.set(tg, cur);
    });
  });

  return [...map.entries()]
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      due: v.due,
      lapses: v.lapses,
      avgTimeSec: v.timeCnt ? Number((v.timeSum / v.timeCnt / 1000).toFixed(1)) : 0
    }))
    .sort((a, b) => b.total - a.total);
}

export function computeNoteCardHeatmap(
  notes: Note[],
  cards: Flashcard[],
  states: Record<string, SRSCardState>,
  now = Date.now()
): Record<string, { total: number; due: number; leeches: number; masteryRatio: number }> {
  const out: Record<string, { total: number; due: number; leeches: number; masteryRatio: number }> = {};
  notes.forEach(n => {
    const noteCards = cards.filter(c => c.sourcePath === n.path);
    if (noteCards.length === 0) {
      out[n.path] = { total: 0, due: 0, leeches: 0, masteryRatio: 1 };
      return;
    }
    let due = 0;
    let leeches = 0;
    let mastered = 0;
    noteCards.forEach(c => {
      const st = states[c.id];
      if (isCardDue(st, now)) due++;
      if (st?.leech) leeches++;
      if (st && st.reps >= 2 && !isCardDue(st, now)) mastered++;
    });
    out[n.path] = {
      total: noteCards.length,
      due,
      leeches,
      masteryRatio: mastered / noteCards.length
    };
  });
  return out;
}

export function mergeSrsSyncData(
  localStates: Record<string, SRSCardState>,
  remoteStates: Record<string, SRSCardState>,
  localLogs: FlashcardReviewLog[],
  remoteLogs: FlashcardReviewLog[]
): {
  mergedStates: Record<string, SRSCardState>;
  mergedLogs: FlashcardReviewLog[];
  conflictsResolved: number;
} {
  const mergedStates: Record<string, SRSCardState> = { ...localStates };
  let conflictsResolved = 0;

  Object.entries(remoteStates).forEach(([cardId, rState]) => {
    const lState = mergedStates[cardId];
    if (!lState) {
      mergedStates[cardId] = rState;
    } else if (rState.updatedAt !== lState.updatedAt) {
      conflictsResolved++;
      if (rState.updatedAt > lState.updatedAt) {
        mergedStates[cardId] = rState;
      }
    }
  });

  const logMap = new Map<string, FlashcardReviewLog>();
  localLogs.forEach(l => logMap.set(l.id, l));
  remoteLogs.forEach(l => {
    if (!logMap.has(l.id)) logMap.set(l.id, l);
  });

  const mergedLogs = [...logMap.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { mergedStates, mergedLogs, conflictsResolved };
}

export function computeFsrsRetrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + Math.max(0, elapsedDays) / (9 * Math.max(0.4, stability)), -1);
}

export interface FsrsRetentionMetrics {
  trueRetentionRate: number;
  passedReviews: number;
  totalReviews: number;
  avgRetrievability: number | null;
  avgStabilityDays: number;
  targetRetention: number;
  matureCount: number;
  learningCount: number;
  newCount: number;
  dueNowCount: number;
  ratingCounts: { again: number; hard: number; good: number; easy: number };
}

export function computeFsrsRetentionMetrics(
  cards: Flashcard[],
  states: Record<string, SRSCardState>,
  logs: FlashcardReviewLog[],
  now = Date.now()
): FsrsRetentionMetrics {
  const tr = computeTrueRetention(logs);
  const nonCramLogs = logs.filter(l => !l.cram);
  const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  nonCramLogs.forEach(l => {
    if (l.rating === 1) ratingCounts.again++;
    else if (l.rating === 2) ratingCounts.hard++;
    else if (l.rating === 3) ratingCounts.good++;
    else if (l.rating === 4) ratingCounts.easy++;
  });

  let rSum = 0;
  let rCnt = 0;
  let stabSum = 0;
  let matureCount = 0;
  let learningCount = 0;
  let newCount = 0;
  let dueNowCount = 0;

  cards.forEach(c => {
    const st = states[c.id];
    if (st?.suspended) return;
    if (isCardDue(st, now)) dueNowCount++;

    if (!st || st.reps === 0) {
      newCount++;
      return;
    }

    if (st.stability >= 21) matureCount++;
    else learningCount++;

    if (st.stability > 0 && st.lastReviewedAt > 0) {
      const elapsedDays = Math.max(0, (now - st.lastReviewedAt) / DAY_MS);
      rSum += computeFsrsRetrievability(elapsedDays, st.stability);
      stabSum += st.stability;
      rCnt++;
    }
  });

  return {
    trueRetentionRate: tr.rate,
    passedReviews: tr.passed,
    totalReviews: tr.total,
    avgRetrievability: rCnt > 0 ? Math.round((rSum / rCnt) * 100) : null,
    avgStabilityDays: rCnt > 0 ? Number((stabSum / rCnt).toFixed(1)) : 0,
    targetRetention: 90,
    matureCount,
    learningCount,
    newCount,
    dueNowCount,
    ratingCounts
  };
}

export interface FsrsForecastDay {
  dayOffset: number;
  label: string;
  scheduled: number;
  projected: number;
  total: number;
}

export function computeFsrsWorkloadForecast(
  cards: Flashcard[],
  states: Record<string, SRSCardState>,
  preset: DeckPreset,
  days = 30,
  now = Date.now()
): {
  days: FsrsForecastDay[];
  totalScheduled: number;
  totalProjected: number;
  totalReviews: number;
  peakCount: number;
  peakLabel: string;
} {
  const scheduled = new Array<number>(days).fill(0);
  const projected = new Array<number>(days).fill(0);
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const fsrsSimPreset: DeckPreset = {
    ...preset,
    algorithm: 'fsrs',
    fuzzEnabled: false,
    loadBalanceEnabled: false
  };

  cards.forEach(c => {
    const st = states[c.id];
    if (st?.suspended) return;

    const firstDueTs = st ? st.dueAt : now;
    const firstOffset = Math.max(0, Math.floor((firstDueTs - startOfToday) / DAY_MS));
    if (firstOffset >= days) return;

    scheduled[firstOffset]++;

    // Project subsequent FSRS reviews within the 30-day horizon assuming a Good (3) rating
    let simState = st ? { ...st } : undefined;
    let simOffset = firstOffset;
    for (let step = 0; step < 6; step++) {
      const simNow = startOfToday + simOffset * DAY_MS + 12 * 60 * 60 * 1000;
      const nextSt = scheduleCardReview(simState, c.id, 3, fsrsSimPreset, simNow, {});
      const stepDays = Math.max(1, Math.round(nextSt.intervalDays));
      simOffset += stepDays;
      if (simOffset >= days) break;
      projected[simOffset]++;
      simState = nextSt;
    }
  });

  let totalScheduled = 0;
  let totalProjected = 0;
  let peakCount = 0;
  let peakLabel = 'Today';

  const resultDays: FsrsForecastDay[] = scheduled.map((sched, dayOffset) => {
    const proj = projected[dayOffset];
    const total = sched + proj;
    totalScheduled += sched;
    totalProjected += proj;
    const d = new Date(startOfToday + dayOffset * DAY_MS);
    const label = dayOffset === 0 ? 'Today' : `${d.getMonth() + 1}/${d.getDate()}`;
    if (total > peakCount) {
      peakCount = total;
      peakLabel = label;
    }
    return { dayOffset, label, scheduled: sched, projected: proj, total };
  });

  return {
    days: resultDays,
    totalScheduled,
    totalProjected,
    totalReviews: totalScheduled + totalProjected,
    peakCount,
    peakLabel
  };
}

