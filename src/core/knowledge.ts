import { extractWikilinks, noteBaseName, parseFrontmatter } from './markdown';
import type {
  DiffLine,
  Flashcard,
  HeadingItem,
  KanbanColumn,
  MindmapNode,
  Note
} from './types';

export function resolveNoteByLink(notes: Note[], target: string): Note | undefined {
  const clean = target.split('#')[0].split('|')[0].trim().replace(/\.md$/i, '');
  if (!clean) return undefined;
  return notes.find(
    n =>
      n.path.replace(/\.md$/i, '').toLowerCase() === clean.toLowerCase() ||
      noteBaseName(n.path).toLowerCase() === clean.toLowerCase()
  );
}

export function renameNoteInVault(
  notes: Note[],
  oldPath: string,
  newNameRaw: string
): { notes: Note[]; newPath: string; updatedLinks: number } | null {
  const target = notes.find(n => n.path === oldPath);
  const cleanNew = newNameRaw.replace(/\.md$/i, '').trim();
  if (!target || !cleanNew) return null;

  const dir = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/') + 1) : '';
  const newPath = `${dir}${cleanNew}.md`;
  if (newPath === oldPath) return null;
  if (notes.some(n => n.path.toLowerCase() === newPath.toLowerCase())) return null;

  const oldBase = noteBaseName(oldPath);
  const escaped = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`\\[\\[${escaped}((?:\\|[^\\]]+|#[^\\]]+)?)\\]\\]`, 'gi');

  let updatedLinks = 0;
  const updatedNotes = notes.map(n => {
    let nextContent = n.content;
    if (rx.test(nextContent)) {
      rx.lastIndex = 0;
      nextContent = nextContent.replace(rx, `[[${cleanNew}$1]]`);
      updatedLinks++;
    }
    if (n.path === oldPath) {
      return { ...n, path: newPath, content: nextContent, updatedAt: Date.now() };
    }
    if (nextContent !== n.content) {
      return { ...n, content: nextContent };
    }
    return n;
  });

  return { notes: updatedNotes, newPath, updatedLinks };
}

export function getBacklinks(
  notes: Note[],
  targetNote: Note | null
): { linked: Note[]; unlinked: Note[] } {
  if (!targetNote) return { linked: [], unlinked: [] };
  const name = noteBaseName(targetNote.path).toLowerCase();
  const linked: Note[] = [];
  const unlinked: Note[] = [];

  for (const n of notes) {
    if (n.path === targetNote.path) continue;
    const resolvedPaths = extractWikilinks(n.content)
      .map(l => resolveNoteByLink(notes, l)?.path)
      .filter(Boolean);
    if (resolvedPaths.includes(targetNote.path)) {
      linked.push(n);
    } else if (name.length >= 3 && n.content.toLowerCase().includes(name)) {
      unlinked.push(n);
    }
  }
  return { linked, unlinked };
}

export function findSmartRelatedNotes(
  notes: Note[],
  activeNote: Note | null,
  topN = 4
): Array<{ note: Note; score: number }> {
  if (!activeNote || notes.length < 2) return [];
  const tokenize = (txt: string) => txt.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const docs = notes.map(n => ({
    note: n,
    tokens: tokenize(`${noteBaseName(n.path)} ${n.content}`)
  }));

  const df = new Map<string, number>();
  docs.forEach(d => {
    new Set(d.tokens).forEach(tok => df.set(tok, (df.get(tok) || 0) + 1));
  });

  const N = docs.length;
  const vectorize = (tokens: string[]) => {
    const tf = new Map<string, number>();
    tokens.forEach(tok => tf.set(tok, (tf.get(tok) || 0) + 1));
    const vec = new Map<string, number>();
    let norm = 0;
    tf.forEach((cnt, tok) => {
      const idf = Math.log((N + 1) / ((df.get(tok) || 0) + 1)) + 1;
      const w = (cnt / Math.max(1, tokens.length)) * idf;
      vec.set(tok, w);
      norm += w * w;
    });
    return { vec, norm: Math.sqrt(norm) || 1 };
  };

  const activeDoc = docs.find(d => d.note.path === activeNote.path);
  if (!activeDoc) return [];
  const vA = vectorize(activeDoc.tokens);
  const alreadyLinkedPaths = new Set(
    extractWikilinks(activeNote.content)
      .map(x => resolveNoteByLink(notes, x)?.path)
      .filter((p): p is string => Boolean(p))
  );

  return docs
    .filter(
      d =>
        d.note.path !== activeNote.path &&
        !alreadyLinkedPaths.has(d.note.path)
    )
    .map(d => {
      const vB = vectorize(d.tokens);
      let dot = 0;
      vA.vec.forEach((w, tok) => {
        const bW = vB.vec.get(tok);
        if (bW !== undefined) dot += w * bW;
      });
      return { note: d.note, score: dot / (vA.norm * vB.norm) };
    })
    .filter(r => r.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function extractHeadings(content: string): HeadingItem[] {
  const { body } = parseFrontmatter(content);
  const headings: HeadingItem[] = [];
  let inFence = false;
  body.split(/\r?\n/).forEach(line => {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (m) {
      headings.push({
        index: headings.length,
        level: m[1].length,
        text: m[2].trim()
      });
    }
  });
  return headings;
}

import { extractFlashcardsAdvanced } from './flashcards';

export function extractFlashcards(notes: Note[]): Flashcard[] {
  return extractFlashcardsAdvanced(notes, { headers: false, bullets: false, tables: true });
}

export function parseKanbanFromNote(content: string): {
  preamble: string[];
  columns: KanbanColumn[];
} {
  const { body } = parseFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const preamble: string[] = [];
  const columns: KanbanColumn[] = [];
  let currentCol: KanbanColumn | null = null;
  let cardSeq = 0;

  lines.forEach(line => {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      currentCol = { title: h2[1].trim(), cards: [], otherLines: [] };
      columns.push(currentCol);
    } else if (!currentCol) {
      preamble.push(line);
    } else {
      const task = line.match(/^[-*+]\s+\[([ xX])\]\s+(.+)/);
      if (task) {
        currentCol.cards.push({
          id: `card-${cardSeq++}`,
          done: task[1].toLowerCase() === 'x',
          text: task[2].trim()
        });
      } else if (line.trim()) {
        currentCol.otherLines.push(line);
      }
    }
  });

  return { preamble, columns };
}

export function serializeKanbanToBody(preamble: string[], columns: KanbanColumn[]): string {
  const out = [...preamble];
  while (out.length && !out[out.length - 1].trim()) out.pop();
  if (out.length) out.push('');

  columns.forEach((col, i) => {
    out.push(`## ${col.title}`);
    col.cards.forEach(c => out.push(`- [${c.done ? 'x' : ' '}] ${c.text}`));
    col.otherLines.forEach(l => out.push(l));
    if (i < columns.length - 1) out.push('');
  });

  return out.join('\n').trim() + '\n';
}

export function buildMindmapTree(note: Pick<Note, 'path' | 'content'>): MindmapNode {
  const { body } = parseFrontmatter(note.content);
  const root: MindmapNode = {
    id: 'root',
    text: noteBaseName(note.path),
    level: 0,
    children: []
  };
  const stack: MindmapNode[] = [root];
  let inFence = false;

  body.split(/\r?\n/).forEach((line, idx) => {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const hm = line.match(/^(#{1,4})\s+(.+)/);
    const lm = line.match(/^([ \t]*)[-*+]\s+(?:\[[ xX]\]\s+)?(.+)/);
    if (hm) {
      const lvl = hm[1].length;
      const node: MindmapNode = {
        id: `h-${idx}`,
        text: hm[2].replace(/[*`[\]]/g, '').trim(),
        level: lvl,
        children: []
      };
      while (stack.length > 1 && stack[stack.length - 1].level >= lvl) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (lm) {
      const indent = Math.floor(lm[1].length / 2);
      const lvl = 5 + indent;
      const node: MindmapNode = {
        id: `l-${idx}`,
        text: lm[2].replace(/[*`]/g, '').slice(0, 56),
        level: lvl,
        children: []
      };
      while (stack.length > 1 && stack[stack.length - 1].level >= lvl) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
  });

  return root;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diff: DiffLine[] = [];

  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const c = newLines[i];
    if (o === c) {
      diff.push({ type: 'same', text: c ?? '' });
    } else {
      if (o !== undefined) diff.push({ type: 'del', text: o });
      if (c !== undefined) diff.push({ type: 'add', text: c });
    }
  }
  return diff;
}
