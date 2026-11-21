export interface MarkdownHeadingLine {
  lineIndex: number;
  level: number;
  text: string;
}

export interface ScrollAnchor {
  sourceY: number;
  previewY: number;
}

export interface VisualLineLayout {
  totalVisualLines: number;
  lineVisualStart: number[];
}

function normalizeHeadingText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~=+]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extracts ATX headings (h1..h4) from Markdown body outside fenced code blocks
 * in exact document order matching `renderMarkdownToHtml` (#heading-0, #heading-1, ...).
 */
export function extractHeadingLines(markdownBody: string): {
  totalLines: number;
  headings: MarkdownHeadingLine[];
} {
  const lines = markdownBody.split(/\r?\n/);
  const headings: MarkdownHeadingLine[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      continue;
    }
    if (inFence) continue;

    const hMatch = line.match(/^\s{0,3}(#{1,4})\s+(.+?)(?:\s+#+\s*)?$/);
    if (hMatch) {
      headings.push({
        lineIndex: i,
        level: hMatch[1].length,
        text: normalizeHeadingText(hMatch[2])
      });
    }
  }

  return { totalLines: Math.max(1, lines.length), headings };
}

/**
 * Approximates cumulative wrapped visual line offsets for each logical line in a textarea.
 */
export function estimateVisualLineLayout(
  markdownBody: string,
  charsPerLine = 72
): VisualLineLayout {
  const safeWidth = Math.max(20, Math.floor(charsPerLine));
  const lines = markdownBody.split(/\r?\n/);
  const lineVisualStart: number[] = new Array(lines.length + 1);
  let cumulative = 0;

  for (let i = 0; i < lines.length; i++) {
    lineVisualStart[i] = cumulative;
    const len = lines[i].length;
    cumulative += Math.max(1, Math.ceil(len / safeWidth));
  }
  lineVisualStart[lines.length] = cumulative;

  return {
    totalVisualLines: Math.max(1, cumulative),
    lineVisualStart
  };
}

/**
 * Matches parsed Markdown headings to rendered preview heading DOM entries sequentially
 * by normalized text (allowing unmatched headings to be skipped safely).
 */
export function pairHeadingsByText(
  mdHeadings: MarkdownHeadingLine[],
  previewHeadings: Array<{ text: string; previewY: number }>,
  visualLayout: VisualLineLayout,
  textareaOffsetTop: number,
  textareaScrollHeight: number
): Array<{ sourceY: number; previewY: number }> {
  const pairs: Array<{ sourceY: number; previewY: number }> = [];
  let pCursor = 0;

  for (const mh of mdHeadings) {
    if (!mh.text) continue;
    let foundIdx = -1;
    for (let j = pCursor; j < previewHeadings.length; j++) {
      const pNorm = previewHeadings[j].text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (pNorm === mh.text) {
        foundIdx = j;
        break;
      }
    }
    if (foundIdx === -1) continue;

    const visualStart = visualLayout.lineVisualStart[mh.lineIndex] ?? 0;
    const ratio = visualStart / Math.max(1, visualLayout.totalVisualLines);
    const sourceY = textareaOffsetTop + ratio * textareaScrollHeight;
    pairs.push({
      sourceY,
      previewY: previewHeadings[foundIdx].previewY
    });
    pCursor = foundIdx + 1;
  }

  return pairs;
}

/**
 * Builds a strictly monotonically increasing list of scroll anchors spanning [0..maxScroll].
 */
export function buildScrollAnchors(
  sourceMaxScroll: number,
  previewMaxScroll: number,
  headingPairs: Array<{ sourceY: number; previewY: number }>
): ScrollAnchor[] {
  const sMax = Math.max(0, sourceMaxScroll);
  const pMax = Math.max(0, previewMaxScroll);
  if (sMax === 0 || pMax === 0) {
    return [{ sourceY: 0, previewY: 0 }];
  }

  const anchors: ScrollAnchor[] = [{ sourceY: 0, previewY: 0 }];
  const sorted = [...headingPairs].sort((a, b) => a.sourceY - b.sourceY);

  for (const pair of sorted) {
    const prev = anchors[anchors.length - 1];
    if (
      pair.sourceY > prev.sourceY + 1 &&
      pair.previewY > prev.previewY + 1 &&
      pair.sourceY < sMax - 1 &&
      pair.previewY < pMax - 1
    ) {
      anchors.push({ sourceY: pair.sourceY, previewY: pair.previewY });
    }
  }

  anchors.push({ sourceY: sMax, previewY: pMax });
  return anchors;
}

/**
 * Maps a scrollTop offset between source (editor) and target (preview) using piecewise-linear
 * interpolation across heading anchors, falling back cleanly to proportional mapping.
 */
export function mapScrollPosition(
  scrollPos: number,
  direction: 'source-to-preview' | 'preview-to-source',
  anchors: ScrollAnchor[],
  sourceMaxScroll: number,
  previewMaxScroll: number
): number {
  const fromMax = direction === 'source-to-preview' ? Math.max(0, sourceMaxScroll) : Math.max(0, previewMaxScroll);
  const toMax = direction === 'source-to-preview' ? Math.max(0, previewMaxScroll) : Math.max(0, sourceMaxScroll);
  if (fromMax <= 0 || toMax <= 0) return 0;

  const clamped = Math.max(0, Math.min(fromMax, scrollPos));
  if (anchors.length < 2) {
    return (clamped / fromMax) * toMax;
  }

  const getFrom = (a: ScrollAnchor) => (direction === 'source-to-preview' ? a.sourceY : a.previewY);
  const getTo = (a: ScrollAnchor) => (direction === 'source-to-preview' ? a.previewY : a.sourceY);

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const aFrom = getFrom(a);
    const bFrom = getFrom(b);
    if (clamped >= aFrom && clamped <= bFrom) {
      const span = bFrom - aFrom;
      if (span <= 0.0001) return Math.max(0, Math.min(toMax, getTo(a)));
      const t = (clamped - aFrom) / span;
      const mapped = getTo(a) + t * (getTo(b) - getTo(a));
      return Math.max(0, Math.min(toMax, mapped));
    }
  }

  return (clamped / fromMax) * toMax;
}
