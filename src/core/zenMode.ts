import type { ZenBlock, ZenRewardHistoryItem, ZenStudioConfig } from './types';
import { createDefaultSoundChannels } from './utils/audio';

export function createDefaultZenConfig(): ZenStudioConfig {
  return {
    goalTitle: 'Deep Focus Session',
    rewardText: 'Hot tea & 10-minute walk',
    blocks: [
      { id: 'zb-1', kind: 'focus', label: 'Focus Block 1', minutes: 25 },
      { id: 'zb-2', kind: 'break', label: 'Short Break', minutes: 5 },
      { id: 'zb-3', kind: 'focus', label: 'Focus Block 2', minutes: 25 }
    ],
    chimeWarningEnabled: true,
    oneMinuteWarningEnabled: true,
    musicTrack: 'lofi',
    musicVolume: 0.35,
    soundChannels: createDefaultSoundChannels(),
    completedSessions: 0,
    claimedRewards: []
  };
}

export function normalizeZenConfig(raw: Partial<ZenStudioConfig> | null | undefined): ZenStudioConfig {
  const base = createDefaultZenConfig();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    blocks: Array.isArray(raw.blocks) && raw.blocks.length > 0 ? raw.blocks : base.blocks,
    soundChannels: {
      ...base.soundChannels,
      ...(raw.soundChannels || {})
    },
    claimedRewards: Array.isArray(raw.claimedRewards) ? raw.claimedRewards : base.claimedRewards
  };
}

export function addBreakAfterBlock(
  blocks: ZenBlock[],
  afterIndex: number,
  minutes = 5,
  label = 'Break'
): ZenBlock[] {
  const clampedMins = Math.max(1, Math.min(60, Math.round(minutes)));
  const newBreak: ZenBlock = {
    id: `zb-brk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    kind: 'break',
    label: label.trim() || 'Break',
    minutes: clampedMins
  };
  const idx = Math.max(-1, Math.min(blocks.length - 1, afterIndex));
  const next = [...blocks];
  next.splice(idx + 1, 0, newBreak);
  return next;
}

export function addFocusBlock(
  blocks: ZenBlock[],
  minutes = 25,
  label?: string
): ZenBlock[] {
  const focusCount = blocks.filter(b => b.kind === 'focus').length + 1;
  const clampedMins = Math.max(1, Math.min(180, Math.round(minutes)));
  const newFocus: ZenBlock = {
    id: `zb-foc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    kind: 'focus',
    label: label?.trim() || `Focus Block ${focusCount}`,
    minutes: clampedMins
  };
  return [...blocks, newFocus];
}

export function removeZenBlock(blocks: ZenBlock[], blockId: string): ZenBlock[] {
  if (blocks.length <= 1) return blocks;
  return blocks.filter(b => b.id !== blockId);
}

export function updateZenBlock(
  blocks: ZenBlock[],
  blockId: string,
  patch: Partial<Pick<ZenBlock, 'label' | 'minutes' | 'kind'>>
): ZenBlock[] {
  return blocks.map(b =>
    b.id === blockId
      ? {
          ...b,
          ...patch,
          minutes:
            patch.minutes !== undefined
              ? Math.max(1, Math.min(180, Math.round(patch.minutes)))
              : b.minutes
        }
      : b
  );
}

export function computeZenSequenceProgress(
  blocks: ZenBlock[],
  activeIndex: number,
  remainingSecondsInActiveBlock: number
): {
  totalSeconds: number;
  elapsedSeconds: number;
  percent: number;
  activeBlockTotalSeconds: number;
  activeBlockPercent: number;
} {
  if (blocks.length === 0) {
    return {
      totalSeconds: 0,
      elapsedSeconds: 0,
      percent: 0,
      activeBlockTotalSeconds: 0,
      activeBlockPercent: 0
    };
  }
  const safeIdx = Math.max(0, Math.min(blocks.length - 1, activeIndex));
  const totalSeconds = blocks.reduce((sum, b) => sum + b.minutes * 60, 0);
  let completedBefore = 0;
  for (let i = 0; i < safeIdx; i++) {
    completedBefore += blocks[i].minutes * 60;
  }
  const activeBlockTotalSeconds = blocks[safeIdx].minutes * 60;
  const clampedRem = Math.max(0, Math.min(activeBlockTotalSeconds, remainingSecondsInActiveBlock));
  const activeElapsed = activeBlockTotalSeconds - clampedRem;
  const elapsedSeconds = completedBefore + activeElapsed;

  return {
    totalSeconds,
    elapsedSeconds,
    percent: totalSeconds > 0 ? Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)) : 0,
    activeBlockTotalSeconds,
    activeBlockPercent:
      activeBlockTotalSeconds > 0
        ? Math.min(100, Math.round((activeElapsed / activeBlockTotalSeconds) * 100))
        : 0
  };
}

export function claimZenReward(
  config: ZenStudioConfig,
  now = Date.now()
): ZenStudioConfig {
  const totalMinutes = config.blocks
    .filter(b => b.kind === 'focus')
    .reduce((sum, b) => sum + b.minutes, 0);

  const entry: ZenRewardHistoryItem = {
    id: `rew-${now.toString(36)}`,
    rewardText: config.rewardText.trim() || 'Well-earned break!',
    goalText: config.goalTitle.trim() || 'Focus Session',
    claimedAt: now,
    totalMinutes
  };

  return {
    ...config,
    completedSessions: config.completedSessions + 1,
    claimedRewards: [entry, ...config.claimedRewards].slice(0, 30)
  };
}
