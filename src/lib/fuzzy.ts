// Small fuzzy matcher for the quick switcher and command palette: every query
// character must appear in order; contiguous runs and word starts score higher.

export interface FuzzyResult { score: number; indices: number[] }

export function fuzzy(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return { score: 0, indices: [] };
  const s = text.toLocaleLowerCase();
  // A plain substring always wins over a scattered match.
  const at = s.indexOf(q);
  if (at >= 0) {
    const start = at === 0 || /[\s/_\-.]/.test(s[at - 1]) ? 30 : 0;
    return { score: 100 + start - at * 0.5 - (s.length - q.length) * 0.05, indices: [...q].map((_, i) => at + i) };
  }
  const indices: number[] = [];
  let score = 0;
  let prev = -2;
  let from = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const i = s.indexOf(ch, from);
    if (i < 0) return null;
    score += i === prev + 1 ? 5 : 1;
    if (i === 0 || /[\s/_\-.]/.test(s[i - 1])) score += 3;
    indices.push(i);
    prev = i;
    from = i + 1;
  }
  return { score: score - (s.length - q.length) * 0.05, indices };
}

/** Rank items by fuzzy score on `key`; unmatched items are dropped. */
export function rank<T>(items: T[], query: string, key: (x: T) => string, limit = 50): { item: T; match: FuzzyResult }[] {
  const out: { item: T; match: FuzzyResult }[] = [];
  for (const item of items) {
    const match = fuzzy(query, key(item));
    if (match) out.push({ item, match });
  }
  if (query.trim()) out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
