import { extractTags, noteBaseName, parseFrontmatter } from './markdown';
import type {
  CardKind,
  ExtractionOptions,
  Flashcard,
  ImageOcclusionData,
  Note,
  SRSCardState
} from './types';

function hashStr(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function makeCardId(
  blockId: string | undefined,
  notePath: string,
  kind: CardKind,
  question: string,
  suffix = ''
): { id: string; siblingKey: string } {
  const base = blockId
    ? `blk:${blockId}`
    : `card:${hashStr(`${notePath}::${kind}::${question.slice(0, 120)}`)}`;
  return {
    id: suffix ? `${base}:${suffix}` : base,
    siblingKey: base
  };
}

function parseBlockAndSrsMetadata(text: string): {
  clean: string;
  blockId?: string;
  inlineSrs?: Partial<SRSCardState>;
  hint?: string;
  extra?: string;
  dependencies: string[];
} {
  let clean = text;
  let blockId: string | undefined;
  let inlineSrs: Partial<SRSCardState> | undefined;
  let hint: string | undefined;
  let extra: string | undefined;
  const dependencies: string[] = [];

  const srsMatch = clean.match(/<!--\s*an-srs\s+(\{[\s\S]*?\})\s*-->/i);
  if (srsMatch) {
    try {
      inlineSrs = JSON.parse(srsMatch[1]) as Partial<SRSCardState>;
    } catch {
      // ignore malformed comment
    }
    clean = clean.replace(srsMatch[0], '');
  }

  const hintMatch = clean.match(/<!--\s*hint:\s*([\s\S]*?)\s*-->/i);
  if (hintMatch) {
    hint = hintMatch[1].trim();
    clean = clean.replace(hintMatch[0], '');
  }

  const extraMatch = clean.match(/<!--\s*extra:\s*([\s\S]*?)\s*-->/i);
  if (extraMatch) {
    extra = extraMatch[1].trim();
    clean = clean.replace(extraMatch[0], '');
  }

  const depMatch = clean.match(/(?:depends|prereq):\s*([^\n]+)/i);
  if (depMatch) {
    depMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^\[\[|\]\]$/g, ''))
      .filter(Boolean)
      .forEach(d => dependencies.push(d));
  }

  const blkMatch = clean.match(/\s\^([a-zA-Z0-9_-]{3,})\s*$/);
  if (blkMatch) {
    blockId = blkMatch[1];
    clean = clean.slice(0, clean.length - blkMatch[0].length);
  }

  return {
    clean: clean.trim(),
    blockId,
    inlineSrs,
    hint,
    extra,
    dependencies
  };
}

function mergeFollowingMetaLines(
  lines: string[],
  currentIndex: number,
  baseMeta: ReturnType<typeof parseBlockAndSrsMetadata>
): { meta: ReturnType<typeof parseBlockAndSrsMetadata>; consumedLines: number } {
  let consumed = 0;
  const merged = { ...baseMeta, dependencies: [...baseMeta.dependencies] };
  let idx = currentIndex + 1;
  while (idx < lines.length) {
    const nxt = lines[idx].trim();
    if (
      /^(?:depends|prereq):/i.test(nxt) ||
      /^<!--\s*(?:hint|extra|an-srs)\b/i.test(nxt)
    ) {
      const nxtMeta = parseBlockAndSrsMetadata(nxt);
      if (nxtMeta.blockId && !merged.blockId) merged.blockId = nxtMeta.blockId;
      if (nxtMeta.inlineSrs && !merged.inlineSrs) merged.inlineSrs = nxtMeta.inlineSrs;
      if (nxtMeta.hint && !merged.hint) merged.hint = nxtMeta.hint;
      if (nxtMeta.extra && !merged.extra) merged.extra = nxtMeta.extra;
      if (nxtMeta.dependencies.length) merged.dependencies.push(...nxtMeta.dependencies);
      consumed++;
      idx++;
    } else {
      break;
    }
  }
  return { meta: merged, consumedLines: consumed };
}

export function stripSrsCommentsForPreview(markdown: string): string {
  return markdown
    .replace(/<!--\s*an-srs\s+\{[\s\S]*?\}\s*-->/gi, '')
    .replace(/<!--\s*(?:hint|extra):\s*[\s\S]*?\s*-->/gi, '')
    .replace(/<!--\s*an-occlusion\s+(\{[\s\S]*?\})\s*-->/gi, (_, jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr) as ImageOcclusionData;
        return `\n> [!info] Image Occlusion: ${data.title || 'Diagram'} (${data.boxes?.length || 0} masked regions · ${data.mode === 'hide-all-guess-one' ? 'Hide All, Guess One' : 'Hide One Only'})\n`;
      } catch {
        return '';
      }
    });
}

export function renderFuriganaHtml(text: string): string {
  return text.replace(
    /\{([^{}|\n]+)\|([^{}|\n]+)\}/g,
    '<ruby class="aether-ruby">$1<rt>$2</rt></ruby>'
  );
}

export function extractClozeIndices(text: string): number[] {
  const set = new Set<number>();
  const rx = /\{\{c(\d+)::[\s\S]+?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

export function formatClozePrompt(
  text: string,
  activeIndex: number,
  revealAll = false,
  progressive = true
): { promptText: string; answerText: string } {
  const promptText = text.replace(
    /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g,
    (_, idxStr: string, ans: string, hint: string | undefined) => {
      const idx = Number(idxStr);
      if (revealAll) return `**${ans}**`;
      if (idx === activeIndex) {
        return hint ? `[${hint}]` : `[...]`;
      }
      if (progressive && idx > activeIndex) {
        return hint ? `[${hint}]` : `[...]`;
      }
      return ans;
    }
  );

  const answerText = text.replace(
    /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g,
    (_, idxStr: string, ans: string) => {
      const idx = Number(idxStr);
      return idx === activeIndex ? `==${ans}==` : ans;
    }
  );

  return { promptText, answerText };
}

export function convertHighlightToCloze(
  body: string,
  selStart: number,
  selEnd: number
): { nextBody: string; nextCursor: number } {
  const existing = extractClozeIndices(body);
  const nextIndex = existing.length ? Math.max(...existing) + 1 : 1;

  if (selStart !== selEnd) {
    const selected = body.slice(selStart, selEnd);
    const stripped = selected.replace(/^==|==$/g, '').trim();
    if (stripped) {
      const replacement = `{{c${nextIndex}::${stripped}}}`;
      const nextBody = body.slice(0, selStart) + replacement + body.slice(selEnd);
      return { nextBody, nextCursor: selStart + replacement.length };
    }
  }

  const rx = /==([^=\n]+)==/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body)) !== null) {
    const matchEnd = m.index + m[0].length;
    if (selStart <= matchEnd + 2 || selStart === 0) {
      const replacement = `{{c${nextIndex}::${m[1].trim()}}}`;
      const nextBody = body.slice(0, m.index) + replacement + body.slice(matchEnd);
      return { nextBody, nextCursor: m.index + replacement.length };
    }
  }

  const tpl = `{{c${nextIndex}::answer::hint}}`;
  const nextBody = body.slice(0, selStart) + tpl + body.slice(selEnd);
  return { nextBody, nextCursor: selStart + tpl.length };
}

export function buildImageOcclusionComment(data: ImageOcclusionData): string {
  return `\n<!-- an-occlusion ${JSON.stringify(data)} -->\n`;
}

/**
 * Checks whether lines starting at `startIdx` form a multi-line card whose Front
 * ends with `??` on its own line (and optionally terminates with `+++` on its own line).
 */
function findDelimitedBlockAhead(
  lines: string[],
  startIdx: number,
  afterExplicitSeparator: boolean
): { delimIdx: number; endIdx: number; hasPlusEnd: boolean } | null {
  let inCodeFence = false;
  let delimIdx = -1;

  for (let j = startIdx; j < lines.length; j++) {
    const lt = lines[j].trim();
    if (lt.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    if (lt === '+++') {
      // Reached end of card or separator before seeing ?? -> no card here
      return null;
    }
    if (lt === '---') return null;

    if (lt === '??') {
      delimIdx = j;
      break;
    }

    // If not explicitly inside a +++ block, don't cross blank lines or headings or inline cards to reach ??
    if (!afterExplicitSeparator) {
      if (!lt) return null;
      if (/^#{1,6}\s+/.test(lt) && j === startIdx) {
        // A heading on startIdx can be part of front ONLY if contiguous with ?? below it!
        continue;
      }
      if (/^#{1,6}\s+/.test(lt) && j > startIdx) return null;
      if (/^(?:.+?\s+(?::::|<>|::)\s+.+)$/.test(lt)) return null;
    }
  }

  if (delimIdx <= startIdx) return null;

  // Now find where the Back ends: prefer explicit `+++` on its own line
  let codeFenceBack = false;
  let hasPlusEnd = false;
  let endIdx = lines.length;

  for (let k = delimIdx + 1; k < lines.length; k++) {
    const lt = lines[k].trim();
    if (lt.startsWith('```')) {
      codeFenceBack = !codeFenceBack;
      continue;
    }
    if (codeFenceBack) continue;
    if (lt === '+++') {
      hasPlusEnd = true;
      endIdx = k;
      break;
    }
  }

  if (!hasPlusEnd) {
    // Fallback without +++: stop at blank line (after content), heading, or ---
    let seenContent = false;
    let fence = false;
    for (let k = delimIdx + 1; k < lines.length; k++) {
      const lt = lines[k].trim();
      if (lt.startsWith('```')) {
        fence = !fence;
        seenContent = true;
        continue;
      }
      if (fence) continue;
      if (!lt && seenContent) {
        endIdx = k;
        break;
      }
      if (/^#{1,6}\s+/.test(lt) || lt === '---') {
        endIdx = k;
        break;
      }
      if (lt) seenContent = true;
    }
  }

  return { delimIdx, endIdx, hasPlusEnd };
}

export function extractFlashcardsAdvanced(
  notes: Note[],
  options: ExtractionOptions = { headers: false, bullets: false, tables: true }
): Flashcard[] {
  const cards: Flashcard[] = [];

  for (const n of notes) {
    const { body, rawYaml } = parseFrontmatter(n.content);
    const yamlOffset = rawYaml ? rawYaml.split(/\r?\n/).length + 2 : 0;
    const noteTags = extractTags(n);
    const folder = n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : 'Root';
    const noteName = noteBaseName(n.path);
    const lines = body.split(/\r?\n/);

    const headingStack: Array<{ level: number; text: string }> = [];
    const buildContext = (lineIdx: number): string => {
      const crumbs = [noteName, ...headingStack.map(h => h.text)].join(' > ');
      const prevLine = lineIdx > 0 ? lines[lineIdx - 1]?.trim() : '';
      if (prevLine && !prevLine.startsWith('#') && !prevLine.includes('::') && prevLine !== '+++' && prevLine.length < 140) {
        return `${crumbs} · ${prevLine}`;
      }
      return crumbs;
    };

    const pushCard = (c: Flashcard) => {
      cards.push(c);
    };

    let i = 0;
    let afterPlusSeparator = false;

    while (i < lines.length) {
      const rawLine = lines[i];
      const lineNum = i + 1 + yamlOffset;
      const trimmed = rawLine.trim();

      if (trimmed === '+++') {
        afterPlusSeparator = true;
        i++;
        continue;
      }

      if (!trimmed) {
        i++;
        continue;
      }

      // 0. Multi-line `Front ... \n??\nBack ... \n+++` card block
      const multiBlock = findDelimitedBlockAhead(lines, i, afterPlusSeparator);
      if (multiBlock) {
        const frontRaw = lines.slice(i, multiBlock.delimIdx).join('\n').trim();
        const backRaw = lines.slice(multiBlock.delimIdx + 1, multiBlock.endIdx).join('\n').trim();
        const qMeta = parseBlockAndSrsMetadata(frontRaw);
        const aMeta = parseBlockAndSrsMetadata(backRaw);
        if (qMeta.clean && aMeta.clean) {
          const blk = aMeta.blockId || qMeta.blockId;
          const { id, siblingKey } = makeCardId(blk, n.path, 'multiline', qMeta.clean);
          pushCard({
            id,
            siblingKey,
            blockId: blk,
            kind: 'multiline',
            question: qMeta.clean,
            answer: aMeta.clean,
            hint: qMeta.hint || aMeta.hint,
            extra: aMeta.extra || qMeta.extra,
            context: buildContext(i),
            sourcePath: n.path,
            sourceName: noteName,
            lineNumber: lineNum,
            endLineNumber: multiBlock.endIdx + yamlOffset,
            tags: [...noteTags],
            folder,
            dependencies: [...qMeta.dependencies, ...aMeta.dependencies],
            inlineSrs: aMeta.inlineSrs || qMeta.inlineSrs
          });
        }
        if (multiBlock.hasPlusEnd) {
          afterPlusSeparator = true;
          i = multiBlock.endIdx + 1;
        } else {
          afterPlusSeparator = false;
          i = multiBlock.endIdx;
        }
        continue;
      }

      afterPlusSeparator = false;

      // 1. Image Occlusion comment block
      const occMatch = rawLine.match(/<!--\s*an-occlusion\s+(\{[\s\S]*?\})\s*-->/i);
      if (occMatch) {
        try {
          const data = JSON.parse(occMatch[1]) as ImageOcclusionData;
          if (Array.isArray(data.boxes) && data.boxes.length > 0) {
            const sibKey = `occ:${data.id}`;
            data.boxes.forEach((box, bIdx) => {
              pushCard({
                id: `${sibKey}:${box.id}`,
                siblingKey: sibKey,
                kind: 'occlusion',
                question: `${data.title || 'Image Occlusion'} — Region ${bIdx + 1}`,
                answer: box.label || `Region ${bIdx + 1}`,
                context: buildContext(i),
                sourcePath: n.path,
                sourceName: noteName,
                lineNumber: lineNum,
                endLineNumber: lineNum,
                tags: [...noteTags],
                folder,
                dependencies: [],
                occlusion: { data, activeBoxId: box.id }
              });
            });
          }
        } catch {
          // skip invalid JSON
        }
        i++;
        continue;
      }

      // 2. Fenced Code Blocks (check for Code Cloze!)
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const startIdx = i;
        i++;
        const codeLines: string[] = [];
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        const codeText = codeLines.join('\n');
        const clozeIdxs = extractClozeIndices(codeText);
        if (clozeIdxs.length > 0) {
          const meta = parseBlockAndSrsMetadata(lines[i + 1] || '');
          clozeIdxs.forEach(cIdx => {
            const { promptText, answerText } = formatClozePrompt(codeText, cIdx, false, true);
            const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'code-cloze', codeText, `c${cIdx}`);
            pushCard({
              id,
              siblingKey,
              blockId: meta.blockId,
              kind: 'code-cloze',
              question: `\`\`\`${lang}\n${promptText}\n\`\`\``,
              answer: `\`\`\`${lang}\n${answerText}\n\`\`\``,
              hint: meta.hint,
              extra: meta.extra,
              context: buildContext(startIdx),
              sourcePath: n.path,
              sourceName: noteName,
              lineNumber: startIdx + 1 + yamlOffset,
              endLineNumber: i + 1 + yamlOffset,
              tags: [...noteTags],
              folder,
              dependencies: meta.dependencies,
              clozeIndex: cIdx,
              clozeTotal: clozeIdxs.length,
              codeLanguage: lang || 'text',
              inlineSrs: meta.inlineSrs
            });
          });
        }
        i++;
        continue;
      }

      // Track headings breadcrumb
      const hMatch = rawLine.match(/^(#{1,6})\s+(.+)/);
      if (hMatch) {
        const level = hMatch[1].length;
        const hText = hMatch[2].replace(/\s\^[a-zA-Z0-9_-]+$/, '').trim();
        while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, text: hText });

        const enableHeaderCards = options.headers || /#flashcards\b/i.test(hMatch[2]);
        if (enableHeaderCards) {
          const answerLines: string[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const nxt = lines[j];
            const nxtH = nxt.match(/^(#{1,6})\s+/);
            if (nxtH && nxtH[1].length <= level) break;
            if (nxt.trim() === '---' || nxt.trim() === '+++') break;
            answerLines.push(nxt);
            j++;
          }
          const ansBody = answerLines.join('\n').trim();
          if (ansBody) {
            const meta = parseBlockAndSrsMetadata(hMatch[2]);
            const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'header', meta.clean);
            pushCard({
              id,
              siblingKey,
              blockId: meta.blockId,
              kind: 'header',
              question: meta.clean.replace(/#[\p{L}\p{N}_/-]+/gu, '').trim(),
              answer: ansBody,
              hint: meta.hint,
              extra: meta.extra,
              context: [noteName, ...headingStack.slice(0, -1).map(h => h.text)].join(' > '),
              sourcePath: n.path,
              sourceName: noteName,
              lineNumber: lineNum,
              endLineNumber: j + yamlOffset,
              tags: [...noteTags],
              folder,
              dependencies: meta.dependencies,
              inlineSrs: meta.inlineSrs
            });
          }
        }
        i++;
        continue;
      }

      // 3. Single `?` multi-line block card (legacy ? syntax)
      const nxtTrimmed = lines[i + 1]?.trim();
      if (trimmed && nxtTrimmed === '?' && !trimmed.startsWith('|')) {
        const qMeta = parseBlockAndSrsMetadata(rawLine);
        const ansLines: string[] = [];
        let j = i + 2;
        while (j < lines.length) {
          const l = lines[j];
          const lt = l.trim();
          if (!lt && ansLines.length > 0) {
            break;
          }
          if (/^#{1,6}\s+/.test(lt) || lt === '---' || lt === '+++') break;
          if (lt.startsWith('```')) {
            ansLines.push(l);
            j++;
            while (j < lines.length && !lines[j].trim().startsWith('```')) {
              ansLines.push(lines[j]);
              j++;
            }
            if (j < lines.length) ansLines.push(lines[j]);
            j++;
            continue;
          }
          if (lt) ansLines.push(l);
          j++;
        }
        const rawAns = ansLines.join('\n').trim();
        const aMeta = parseBlockAndSrsMetadata(rawAns);
        if (qMeta.clean && aMeta.clean) {
          const blk = aMeta.blockId || qMeta.blockId;
          const { id, siblingKey } = makeCardId(blk, n.path, 'multiline', qMeta.clean);
          pushCard({
            id,
            siblingKey,
            blockId: blk,
            kind: 'multiline',
            question: qMeta.clean,
            answer: aMeta.clean,
            hint: qMeta.hint || aMeta.hint,
            extra: aMeta.extra || qMeta.extra,
            context: buildContext(i),
            sourcePath: n.path,
            sourceName: noteName,
            lineNumber: lineNum,
            endLineNumber: j + yamlOffset,
            tags: [...noteTags],
            folder,
            dependencies: [...qMeta.dependencies, ...aMeta.dependencies],
            inlineSrs: aMeta.inlineSrs || qMeta.inlineSrs
          });
        }
        i = j + 1;
        continue;
      }

      // 4. Table-to-Card
      if (
        options.tables &&
        trimmed.startsWith('|') &&
        lines[i + 1] &&
        /^\s*\|?\s*:?-{2,}:?\s*\|/.test(lines[i + 1])
      ) {
        const headers = trimmed
          .split('|')
          .map(s => s.trim())
          .filter(Boolean);
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|')) {
          const rowLine = lines[j];
          const meta = parseBlockAndSrsMetadata(rowLine);
          const cells = meta.clean
            .split('|')
            .map(s => s.trim())
            .filter((_, idx, arr) => !(idx === 0 && !arr[0]) && !(idx === arr.length - 1 && !arr[arr.length - 1]));
          if (cells.length >= 2) {
            const qHead = headers[0] ? `${headers[0]}: ` : '';
            const aHead = headers.slice(1).join(' / ');
            const qText = `${qHead}${cells[0]}`;
            const aText = aHead ? `${aHead} → ${cells.slice(1).join(' · ')}` : cells.slice(1).join(' · ');
            const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'table', qText);
            pushCard({
              id,
              siblingKey,
              blockId: meta.blockId,
              kind: 'table',
              question: qText,
              answer: aText,
              hint: meta.hint,
              extra: meta.extra,
              context: buildContext(i),
              sourcePath: n.path,
              sourceName: noteName,
              lineNumber: j + 1 + yamlOffset,
              endLineNumber: j + 1 + yamlOffset,
              tags: [...noteTags],
              folder,
              dependencies: meta.dependencies,
              inlineSrs: meta.inlineSrs
            });
          }
          j++;
        }
        i = j;
        continue;
      }

      // 5. Inline Cloze Deletions {{c1::answer::hint}} (outside inline code)
      const lineWithoutInlineCode = rawLine.replace(/`[^`]*`/g, '');
      const clozeIndices = extractClozeIndices(lineWithoutInlineCode);
      if (clozeIndices.length > 0) {
        const { meta, consumedLines } = mergeFollowingMetaLines(lines, i, parseBlockAndSrsMetadata(rawLine));
        clozeIndices.forEach(cIdx => {
          const { promptText, answerText } = formatClozePrompt(meta.clean, cIdx, false, true);
          const rx = new RegExp(`\\{\\{c${cIdx}::[^:}]+?(?:::([^}]+?))?\\}\\}`);
          const hM = meta.clean.match(rx);
          const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'cloze', meta.clean, `c${cIdx}`);
          pushCard({
            id,
            siblingKey,
            blockId: meta.blockId,
            kind: 'cloze',
            question: promptText,
            answer: answerText,
            hint: meta.hint || hM?.[1]?.trim(),
            extra: meta.extra,
            context: buildContext(i),
            sourcePath: n.path,
            sourceName: noteName,
            lineNumber: lineNum,
            endLineNumber: lineNum,
            tags: [...noteTags],
            folder,
            dependencies: meta.dependencies,
            clozeIndex: cIdx,
            clozeTotal: clozeIndices.length,
            inlineSrs: meta.inlineSrs
          });
        });
        i += 1 + consumedLines;
        continue;
      }

      // 6. Reversible Inline (::: or <>) and Single-Sided Inline (::)
      const baseMeta = parseBlockAndSrsMetadata(rawLine);
      const noCodeClean = baseMeta.clean.replace(/`[^`]*`/g, '');
      const revColonMatch = noCodeClean.match(/^(.+?)\s+:::\s+(.+)$/);
      const revDiamondMatch = !revColonMatch ? noCodeClean.match(/^(.+?)\s+<>\s+(.+)$/) : null;
      const singleMatch =
        !revColonMatch && !revDiamondMatch ? noCodeClean.match(/^(.+?)\s+::\s+(.+)$/) : null;

      if (revColonMatch || revDiamondMatch) {
        const { meta, consumedLines } = mergeFollowingMetaLines(lines, i, baseMeta);
        const sep = revColonMatch ? ':::' : '<>';
        const parts = meta.clean.split(new RegExp(`\\s+${sep === ':::' ? ':::' : '<>'}\\s+`));
        const q = (parts[0] || '').trim();
        const a = parts.slice(1).join(` ${sep} `).trim();
        if (q && a) {
          const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'reversible', q);
          pushCard({
            id,
            siblingKey,
            blockId: meta.blockId,
            kind: 'reversible',
            question: q,
            answer: a,
            hint: meta.hint,
            extra: meta.extra,
            context: buildContext(i),
            sourcePath: n.path,
            sourceName: noteName,
            lineNumber: lineNum,
            endLineNumber: lineNum,
            tags: [...noteTags],
            folder,
            dependencies: meta.dependencies,
            inlineSrs: meta.inlineSrs
          });
          pushCard({
            id: `${id}:rev`,
            siblingKey,
            blockId: meta.blockId,
            kind: 'reversible',
            question: a,
            answer: q,
            hint: meta.hint,
            extra: meta.extra,
            context: buildContext(i),
            sourcePath: n.path,
            sourceName: noteName,
            lineNumber: lineNum,
            endLineNumber: lineNum,
            tags: [...noteTags],
            folder,
            dependencies: meta.dependencies,
            inlineSrs: meta.inlineSrs
          });
        }
        i += 1 + consumedLines;
        continue;
      }

      if (singleMatch) {
        const { meta, consumedLines } = mergeFollowingMetaLines(lines, i, baseMeta);
        const idxSep = meta.clean.indexOf(' :: ');
        if (idxSep > 0) {
          const q = meta.clean.slice(0, idxSep).trim();
          const a = meta.clean.slice(idxSep + 4).trim();
          if (q && a) {
            const { id, siblingKey } = makeCardId(meta.blockId, n.path, 'basic', q);
            pushCard({
              id,
              siblingKey,
              blockId: meta.blockId,
              kind: 'basic',
              question: q,
              answer: a,
              hint: meta.hint,
              extra: meta.extra,
              context: buildContext(i),
              sourcePath: n.path,
              sourceName: noteName,
              lineNumber: lineNum,
              endLineNumber: lineNum,
              tags: [...noteTags],
              folder,
              dependencies: meta.dependencies,
              inlineSrs: meta.inlineSrs
            });
          }
        }
        i += 1 + consumedLines;
        continue;
      }

      // 7. Nested Bullets
      if (options.bullets) {
        const parentM = rawLine.match(/^[-*+]\s+(?!\[[ xX]\])(.+)/);
        if (parentM) {
          const children: string[] = [];
          let j = i + 1;
          while (j < lines.length && /^[ \t]{2,}[-*+]\s+/.test(lines[j])) {
            children.push(lines[j].replace(/^[ \t]+[-*+]\s+/, '').trim());
            j++;
          }
          if (children.length > 0) {
            const pMeta = parseBlockAndSrsMetadata(parentM[1]);
            const { id, siblingKey } = makeCardId(pMeta.blockId, n.path, 'bullet', pMeta.clean);
            pushCard({
              id,
              siblingKey,
              blockId: pMeta.blockId,
              kind: 'bullet',
              question: pMeta.clean,
              answer: children.map(c => `- ${c}`).join('\n'),
              hint: pMeta.hint,
              extra: pMeta.extra,
              context: buildContext(i),
              sourcePath: n.path,
              sourceName: noteName,
              lineNumber: lineNum,
              endLineNumber: j + yamlOffset,
              tags: [...noteTags],
              folder,
              dependencies: pMeta.dependencies,
              inlineSrs: pMeta.inlineSrs
            });
            i = j;
            continue;
          }
        }
      }

      i++;
    }
  }

  return cards;
}

export function upsertInlineSrsCommentInNote(
  content: string,
  lineNumber: number,
  blockId: string,
  srsState?: SRSCardState
): string {
  const lines = content.split(/\r?\n/);
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return content;

  let line = lines[idx];
  line = line.replace(/\s*<!--\s*an-srs\s+\{[\s\S]*?\}\s*-->/gi, '');
  if (!/\s\^[a-zA-Z0-9_-]{3,}$/.test(line)) {
    line = `${line.trimEnd()} ^${blockId}`;
  }
  if (srsState) {
    const compact = {
      algorithm: srsState.algorithm,
      reps: srsState.reps,
      lapses: srsState.lapses,
      intervalDays: Number(srsState.intervalDays.toFixed(2)),
      ease: Number(srsState.ease.toFixed(2)),
      stability: Number(srsState.stability.toFixed(2)),
      difficulty: Number(srsState.difficulty.toFixed(2)),
      dueAt: srsState.dueAt
    };
    line = `${line} <!-- an-srs ${JSON.stringify(compact)} -->`;
  }
  lines[idx] = line;
  return lines.join('\n');
}

export function updateCardLineInNote(
  content: string,
  card: Flashcard,
  nextQuestion: string,
  nextAnswer: string
): string {
  const lines = content.split(/\r?\n/);
  const idx = card.lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return content;

  const orig = lines[idx];
  const trailingBlock = orig.match(/(\s+\^[a-zA-Z0-9_-]+(?:\s*<!--\s*an-srs[\s\S]*?-->)?)\s*$/)?.[1] || '';

  if (card.kind === 'basic') {
    lines[idx] = `${nextQuestion.trim()} :: ${nextAnswer.trim()}${trailingBlock}`;
    return lines.join('\n');
  }
  if (card.kind === 'reversible') {
    const isRev = card.id.endsWith(':rev');
    const sep = orig.includes(' <> ') ? '<>' : ':::';
    const front = isRev ? nextAnswer.trim() : nextQuestion.trim();
    const back = isRev ? nextQuestion.trim() : nextAnswer.trim();
    lines[idx] = `${front} ${sep} ${back}${trailingBlock}`;
    return lines.join('\n');
  }
  if (card.kind === 'multiline') {
    const startIdx = idx;
    const endIdx = Math.max(startIdx + 2, card.endLineNumber - 1);
    const hasPlus = lines[endIdx]?.trim() === '+++';
    const replacement = hasPlus
      ? [...nextQuestion.trim().split('\n'), '??', ...nextAnswer.trim().split('\n'), '+++']
      : [...nextQuestion.trim().split('\n'), '?', ...nextAnswer.trim().split('\n')];
    lines.splice(startIdx, endIdx - startIdx + 1, ...replacement);
    return lines.join('\n');
  }
  return content;
}

export function exportCardsToCsv(cards: Flashcard[], delimiter = ','): string {
  const esc = (val: string) => {
    const s = String(val ?? '').replace(/\r?\n/g, '<br>');
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = ['Question', 'Answer', 'Tags', 'Source', 'Context'].join(delimiter);
  const rows = cards.map(c =>
    [
      esc(c.question),
      esc(c.answer),
      esc(c.tags.join(' ')),
      esc(c.sourcePath),
      esc(c.context || '')
    ].join(delimiter)
  );
  return [header, ...rows].join('\n');
}

export function importCsvToMarkdownNote(csvText: string, deckTitle = 'Imported Flashcards'): string {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return `# ${deckTitle}\n\n`;

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const out: string[] = [`---`, `tags: [flashcards, imported]`, `---`, `# ${deckTitle}`, ''];
  lines.forEach((line, idx) => {
    if (line.startsWith('#')) return;
    const cols = parseLine(line);
    if (cols.length < 2) return;
    if (idx === 0 && /^question|front$/i.test(cols[0]) && /^answer|back$/i.test(cols[1])) return;
    const q = cols[0].replace(/<br\s*\/?>/gi, ' ').trim();
    const a = cols[1].replace(/<br\s*\/?>/gi, ' ').trim();
    if (q && a) out.push(`${q} :: ${a}`);
  });
  return out.join('\n') + '\n';
}

export async function exportCardsToApkgBlob(cards: Flashcard[], deckName = 'NoSidian Deck'): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    'deck.json',
    JSON.stringify(
      {
        format: 'nosidian-apkg-v1',
        deckName,
        exportedAt: new Date().toISOString(),
        cards: cards.map(c => ({
          id: c.id,
          kind: c.kind,
          question: c.question,
          answer: c.answer,
          hint: c.hint,
          extra: c.extra,
          tags: c.tags,
          context: c.context
        }))
      },
      null,
      2
    )
  );
  zip.file('cards.tsv', exportCardsToCsv(cards, '\t'));
  return zip.generateAsync({ type: 'blob' });
}

export async function importApkgArrayBuffer(buffer: ArrayBuffer): Promise<{
  deckName: string;
  markdown: string;
  count: number;
}> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const deckFile = zip.file('deck.json');
  if (deckFile) {
    const data = JSON.parse(await deckFile.async('string')) as {
      deckName?: string;
      cards?: Array<{ question: string; answer: string; hint?: string }>;
    };
    const deckName = data.deckName || 'Imported Anki Deck';
    const cardLines = (data.cards || [])
      .filter(c => c.question && c.answer)
      .map(c => {
        const hint = c.hint ? ` <!-- hint: ${c.hint} -->` : '';
        return `${c.question.replace(/\n+/g, ' ')} :: ${c.answer.replace(/\n+/g, ' ')}${hint}`;
      });
    return {
      deckName,
      markdown: `---\ntags: [flashcards, anki-import]\n---\n# ${deckName}\n\n${cardLines.join('\n')}\n`,
      count: cardLines.length
    };
  }
  const tsvFile = zip.file('cards.tsv') || zip.file(/\.txt$|\.csv$|\.tsv$/i)[0];
  if (tsvFile) {
    const raw = await tsvFile.async('string');
    const md = importCsvToMarkdownNote(raw, 'Imported Package Deck');
    const count = md.split('\n').filter(l => l.includes(' :: ')).length;
    return { deckName: 'Imported Package Deck', markdown: md, count };
  }
  throw new Error('No supported deck.json or cards.tsv found inside .apkg archive.');
}
