import { extractHeadings } from './knowledge';
import { extractTags, noteBaseName } from './markdown';
import type { Note, SearchLineMatch, SearchResultItem } from './types';

export interface IndexedLine {
  lineNumber: number;
  text: string;
  textLower: string;
  heading?: string;
}

export interface IndexedDocument {
  docId: number;
  note: Note;
  pathLower: string;
  title: string;
  titleLower: string;
  tags: string[];
  tagsLower: string[];
  headingsLower: string[];
  lines: IndexedLine[];
}

export interface FullTextSearchIndex {
  docs: IndexedDocument[];
  /** Maps normalized lowercase token -> Set of docIds containing that token */
  postings: Map<string, Set<number>>;
  builtAt: number;
}

export type SearchSortMode = 'relevance' | 'recent';

export interface SearchQueryOptions {
  sortBy?: SearchSortMode;
  maxLinesPerNote?: number;
}

const TOKEN_RX = /[\p{L}\p{N}_-]+/gu;

export function tokenizeText(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RX) || []).filter(tok => tok.length >= 1);
}

/**
 * Builds an inverted full-text search index across all vault notes.
 * Indexes note title, path, tags, headings, and every line (tracking nearest section heading).
 */
export function buildSearchIndex(notes: Note[]): FullTextSearchIndex {
  const postings = new Map<string, Set<number>>();
  const docs: IndexedDocument[] = notes.map((note, docId) => {
    const title = noteBaseName(note.path);
    const titleLower = title.toLowerCase();
    const pathLower = note.path.toLowerCase();
    const tags = extractTags(note);
    const tagsLower = tags.map(t => t.toLowerCase());
    const headings = extractHeadings(note.content);
    const headingsLower = headings.map(h => h.text.toLowerCase());

    const rawLines = note.content.split(/\r?\n/);
    const lines: IndexedLine[] = [];
    let currentHeading: string | undefined;
    let inYaml = rawLines[0]?.trim() === '---';
    let inFence = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (i > 0 && inYaml && line.trim() === '---') {
        inYaml = false;
      } else if (!inYaml) {
        if (line.trim().startsWith('```')) {
          inFence = !inFence;
        } else if (!inFence) {
          const hm = line.match(/^#{1,4}\s+(.+)/);
          if (hm) {
            currentHeading = hm[1].trim();
          }
        }
      }

      lines.push({
        lineNumber: i + 1,
        text: line,
        textLower: line.toLowerCase(),
        heading: currentHeading
      });
    }

    const allTokens = new Set<string>([
      ...tokenizeText(title),
      ...tokenizeText(note.path),
      ...tagsLower.flatMap(t => tokenizeText(t)),
      ...tokenizeText(note.content)
    ]);

    allTokens.forEach(tok => {
      let set = postings.get(tok);
      if (!set) {
        set = new Set<number>();
        postings.set(tok, set);
      }
      set.add(docId);
    });

    return {
      docId,
      note,
      pathLower,
      title,
      titleLower,
      tags,
      tagsLower,
      headingsLower,
      lines
    };
  });

  return {
    docs,
    postings,
    builtAt: Date.now()
  };
}

interface ParsedQuery {
  phrases: string[];
  tagFilters: string[];
  titleFilters: string[];
  pathFilters: string[];
  terms: string[];
}

function parseSearchQuery(rawQuery: string): ParsedQuery {
  const phrases: string[] = [];
  const tagFilters: string[] = [];
  const titleFilters: string[] = [];
  const pathFilters: string[] = [];
  const terms: string[] = [];

  let remainder = rawQuery.replace(/"([^"]+)"/g, (_, phrase: string) => {
    const clean = phrase.trim().toLowerCase();
    if (clean) phrases.push(clean);
    return ' ';
  });

  remainder = remainder
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => {
      const lower = part.toLowerCase();
      if (lower.startsWith('tag:') && lower.length > 4) {
        tagFilters.push(lower.slice(4).replace(/^#/, ''));
        return false;
      }
      if (lower.startsWith('#') && lower.length > 1) {
        tagFilters.push(lower.slice(1));
        return false;
      }
      if (lower.startsWith('title:') && lower.length > 6) {
        titleFilters.push(lower.slice(6));
        return false;
      }
      if (lower.startsWith('path:') && lower.length > 5) {
        pathFilters.push(lower.slice(5));
        return false;
      }
      return true;
    })
    .join(' ');

  if (remainder.trim()) {
    const toks = remainder
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    terms.push(...toks);
  }

  return { phrases, tagFilters, titleFilters, pathFilters, terms };
}

function findRangesInLine(lineLower: string, needles: string[]): Array<[number, number]> {
  const rawRanges: Array<[number, number]> = [];
  for (const needle of needles) {
    if (!needle) continue;
    let startIdx = 0;
    while (startIdx < lineLower.length) {
      const found = lineLower.indexOf(needle, startIdx);
      if (found === -1) break;
      rawRanges.push([found, found + needle.length]);
      startIdx = found + needle.length;
    }
  }
  if (rawRanges.length === 0) return [];
  rawRanges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [rawRanges[0]];
  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = rawRanges[i];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Queries the prebuilt full-text index and returns ranked note results
 * with highlighted line-level match locations for rapid cross-note navigation.
 */
export function searchVaultIndex(
  index: FullTextSearchIndex,
  rawQuery: string,
  options: SearchQueryOptions = {}
): SearchResultItem[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const { phrases, tagFilters, titleFilters, pathFilters, terms } = parseSearchQuery(trimmed);
  const allNeedles = [...phrases, ...terms];
  const maxLinesPerNote = options.maxLinesPerNote ?? 12;
  const sortBy = options.sortBy ?? 'relevance';

  // Narrow candidate docIds via inverted postings when terms/tags exist
  const intersectCandidateSets = (
    current: Set<number> | null,
    matchingIds: Set<number>
  ): Set<number> => {
    if (current === null) return new Set(matchingIds);
    const merged = new Set<number>();
    current.forEach(id => {
      if (matchingIds.has(id)) merged.add(id);
    });
    return merged;
  };

  let candidateIds: Set<number> | null = null;

  for (const term of terms) {
    const termMatches = new Set<number>();
    index.postings.forEach((docSet, token) => {
      if (token.includes(term)) {
        docSet.forEach(id => termMatches.add(id));
      }
    });
    // Also support substring hits across multi-word lines/paths if token boundary splits differently
    index.docs.forEach(doc => {
      if (
        !termMatches.has(doc.docId) &&
        (doc.pathLower.includes(term) || doc.note.content.toLowerCase().includes(term))
      ) {
        termMatches.add(doc.docId);
      }
    });
    candidateIds = intersectCandidateSets(candidateIds, termMatches);
    if (candidateIds.size === 0) return [];
  }

  for (const tagFilter of tagFilters) {
    const tagMatches = new Set<number>();
    index.docs.forEach(doc => {
      if (doc.tagsLower.some(t => t.includes(tagFilter))) {
        tagMatches.add(doc.docId);
      }
    });
    candidateIds = intersectCandidateSets(candidateIds, tagMatches);
    if (candidateIds.size === 0) return [];
  }

  const candidateDocs: IndexedDocument[] =
    candidateIds !== null
      ? Array.from(candidateIds).map(id => index.docs[id])
      : index.docs;

  const results: SearchResultItem[] = [];

  for (const doc of candidateDocs) {
    if (titleFilters.some(tf => !doc.titleLower.includes(tf))) continue;
    if (pathFilters.some(pf => !doc.pathLower.includes(pf))) continue;

    const fullContentLower = doc.note.content.toLowerCase();
    if (phrases.some(ph => !fullContentLower.includes(ph) && !doc.titleLower.includes(ph))) {
      continue;
    }

    let score = 0;
    let matchedInTitle = false;

    for (const needle of [...allNeedles, ...titleFilters]) {
      if (doc.titleLower === needle) {
        score += 65;
        matchedInTitle = true;
      } else if (doc.titleLower.startsWith(needle)) {
        score += 42;
        matchedInTitle = true;
      } else if (doc.titleLower.includes(needle)) {
        score += 28;
        matchedInTitle = true;
      } else if (doc.pathLower.includes(needle)) {
        score += 14;
      }

      if (doc.headingsLower.some(h => h.includes(needle))) {
        score += 18;
      }
    }

    const matchedTags = doc.tags.filter(tag => {
      const tl = tag.toLowerCase();
      return (
        tagFilters.some(tf => tl.includes(tf)) ||
        allNeedles.some(n => tl.includes(n))
      );
    });
    score += matchedTags.length * 16;

    const highlightNeedles = [
      ...allNeedles,
      ...tagFilters.map(t => `#${t}`),
      ...tagFilters
    ].filter(Boolean);

    const lineMatches: SearchLineMatch[] = [];
    let totalMatches = matchedInTitle ? 1 : 0;

    for (const line of doc.lines) {
      const trimmedLine = line.text.trim();
      if (!trimmedLine) continue;
      const ranges = findRangesInLine(trimmedLine.toLowerCase(), highlightNeedles);
      if (ranges.length > 0) {
        totalMatches += ranges.length;
        if (lineMatches.length < maxLinesPerNote) {
          lineMatches.push({
            lineNumber: line.lineNumber,
            lineText: trimmedLine,
            heading: line.heading,
            ranges
          });
        }
      }
    }

    // Score boost from line matches (logarithmic decay to prevent long repetitive files dominating title hits)
    score += Math.min(40, lineMatches.length * 6 + Math.sqrt(totalMatches) * 3);

    if (score > 0 || tagFilters.length > 0 || titleFilters.length > 0 || pathFilters.length > 0) {
      results.push({
        note: doc.note,
        title: doc.title,
        score: Math.round(score),
        totalMatches: Math.max(totalMatches, matchedTags.length),
        matchedInTitle,
        matchedTags,
        lineMatches
      });
    }
  }

  results.sort((a, b) => {
    if (sortBy === 'recent') {
      return b.note.updatedAt - a.note.updatedAt || b.score - a.score;
    }
    return b.score - a.score || b.totalMatches - a.totalMatches || a.title.localeCompare(b.title);
  });

  return results;
}
