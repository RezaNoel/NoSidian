import { computeNoteStats, extractTags, noteBaseName, parseFrontmatter } from './markdown';
import type {
  GraphGroupBy,
  GraphSettings,
  GraphSubLabelMode,
  Note
} from './types';

export const GRAPH_PALETTE_PRESETS: Array<{ id: string; label: string; colors: string[] }> = [
  {
    id: 'oceanic',
    label: 'Carbon & Cyan',
    colors: ['#2563eb', '#0891b2', '#10b981', '#7c3aed', '#f59e0b', '#e11d48']
  },
  {
    id: 'nordic',
    label: 'Arctic Pastel',
    colors: ['#5e81ac', '#88c0d0', '#a3be8c', '#b48ead', '#ebcb8b', '#bf616a']
  },
  {
    id: 'sunset',
    label: 'Amber & Rose',
    colors: ['#f97316', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981']
  },
  {
    id: 'emerald',
    label: 'Forest Canopy',
    colors: ['#059669', '#10b981', '#14b8a6', '#0ea5e9', '#84cc16', '#f59e0b']
  }
];

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  localOnly: false,
  showOrphans: true,
  linkMode: false,
  groupBy: 'folder',
  colorMode: 'group',
  customPalette: GRAPH_PALETTE_PRESETS[0].colors,
  nodeShape: 'circle',
  nodeSize: 7,
  scaleByDegree: true,
  repulsion: 760,
  linkDistance: 165,
  edgeWidth: 1.3,
  edgeOpacity: 0.28,
  subLabelMode: 'title',
  labelFontSize: 12
};

export function resolveNoteCreationTimestamp(note: Note, indexFallback = 0): number {
  if (typeof note.createdAt === 'number' && note.createdAt > 0) {
    return note.createdAt;
  }
  const { props } = parseFrontmatter(note.content);
  const rawDate = props.created || props.date;
  if (typeof rawDate === 'string' && rawDate.trim()) {
    const parsed = Date.parse(rawDate.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (note.snapshots && note.snapshots.length > 0) {
    const firstSnap = note.snapshots[0]?.time;
    if (typeof firstSnap === 'number' && firstSnap > 0) return firstSnap;
  }
  return note.updatedAt || indexFallback;
}

export function computeNodeGroupKey(
  note: Note,
  degree: number,
  groupBy: GraphGroupBy
): string {
  if (groupBy === 'none') return 'all';
  if (groupBy === 'folder') {
    return note.path.includes('/') ? note.path.split('/')[0] : 'root';
  }
  if (groupBy === 'tag') {
    const tags = extractTags(note);
    return tags[0] ? `#${tags[0]}` : 'untagged';
  }
  if (groupBy === 'degree') {
    if (degree === 0) return 'Isolated (0)';
    if (degree <= 2) return '1–2 links';
    if (degree <= 4) return '3–4 links';
    return 'Hub (5+)';
  }
  const ts = resolveNoteCreationTimestamp(note);
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatNodeSubLabel(note: Note, mode: GraphSubLabelMode): string {
  if (mode === 'none') return '';
  const title = noteBaseName(note.path);
  if (mode === 'title') return title;
  if (mode === 'title+tags') {
    const tags = extractTags(note).slice(0, 2);
    return tags.length ? `${title} · ${tags.map(t => `#${t}`).join(' ')}` : title;
  }
  if (mode === 'title+words') {
    const words = computeNoteStats(note.content).words;
    return `${title} (${words}w)`;
  }
  if (mode === 'title+date') {
    const ts = resolveNoteCreationTimestamp(note);
    return `${title} · ${new Date(ts).toISOString().slice(0, 10)}`;
  }
  return title;
}

export function sortNotesForCreationTimelapse(notes: Note[]): Note[] {
  return notes
    .map((note, idx) => ({
      note,
      created: resolveNoteCreationTimestamp(note, idx),
      idx
    }))
    .sort((a, b) => a.created - b.created || a.idx - b.idx)
    .map(item => item.note);
}

export interface TimelapseRevealFrame {
  revealedCount: number;
  alphas: Record<string, number>;
  completed: boolean;
  currentNoteLabel: string | null;
}

/**
 * Pure computation of per-node fade-in alpha (0..1) given elapsed ms since timelapse started.
 */
export function computeTimelapseFrameState(
  orderedNodeIds: string[],
  elapsedMs: number,
  stepIntervalMs = 360,
  fadeDurationMs = 460
): TimelapseRevealFrame {
  if (orderedNodeIds.length === 0) {
    return { revealedCount: 0, alphas: {}, completed: true, currentNoteLabel: null };
  }
  const alphas: Record<string, number> = {};
  let revealedCount = 0;
  let lastStartedId: string | null = null;

  for (let i = 0; i < orderedNodeIds.length; i++) {
    const startAt = i * stepIntervalMs;
    const local = elapsedMs - startAt;
    if (local < 0) {
      alphas[orderedNodeIds[i]] = 0;
    } else {
      const alpha = Math.min(1, local / Math.max(1, fadeDurationMs));
      alphas[orderedNodeIds[i]] = alpha;
      revealedCount++;
      lastStartedId = orderedNodeIds[i];
    }
  }

  const totalDuration = (orderedNodeIds.length - 1) * stepIntervalMs + fadeDurationMs;
  return {
    revealedCount,
    alphas,
    completed: elapsedMs >= totalDuration,
    currentNoteLabel: lastStartedId ? noteBaseName(lastStartedId) : null
  };
}
