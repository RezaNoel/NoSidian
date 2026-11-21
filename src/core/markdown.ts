import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import { renderFuriganaHtml, stripSrsCommentsForPreview } from './flashcards';
import type { Note } from './types';

export function escHtml(str: string): string {
  return String(str ?? '').replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m
  ));
}

export function noteBaseName(path: string): string {
  return (path || '').split('/').pop()?.replace(/\.(md|markdown|txt)$/i, '') || '';
}

export interface ParsedFrontmatter {
  props: Record<string, string | string[]>;
  body: string;
  rawYaml: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const safeContent = typeof content === 'string' ? content : '';
  const match = safeContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { props: {}, body: safeContent, rawYaml: '' };
  const yaml = match[1];
  const props: Record<string, string | string[]> = {};
  yaml.split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      let v: string | string[] = line.slice(idx + 1).trim();
      if (v.startsWith('[') && v.endsWith(']')) {
        v = v
          .slice(1, -1)
          .split(',')
          .map(x => x.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
      props[k] = v;
    }
  });
  return { props, body: safeContent.slice(match[0].length), rawYaml: yaml };
}

export function buildFrontmatter(
  props: Record<string, string | string[]>,
  body: string
): string {
  const entries = Object.entries(props).filter(([k]) => k.trim());
  if (!entries.length) return body;
  const lines = entries.map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

export function extractTags(note: Pick<Note, 'content'> | string): string[] {
  const tags = new Set<string>();
  const raw = typeof note === 'string' ? note : note?.content ?? '';
  const { props, body } = parseFrontmatter(raw);
  if (Array.isArray(props.tags)) {
    props.tags.forEach(tg => tg && tags.add(tg.replace(/^#/, '')));
  } else if (typeof props.tags === 'string' && props.tags) {
    props.tags.split(/[,\s]+/).forEach(tg => tg && tags.add(tg.replace(/^#/, '')));
  }
  const cleanBody = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  const rx = /(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(cleanBody)) !== null) {
    if (!/^\d+$/.test(m[1])) tags.add(m[1]);
  }
  return [...tags];
}

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const clean = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  const rx = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(clean)) !== null) {
    const raw = m[1];
    const target = raw.split('|')[0].split('#')[0].trim();
    if (target) links.push(target);
  }
  return [...new Set(links)];
}

export function computeNoteStats(content: string): { words: number; chars: number; minutes: number } {
  const body = parseFrontmatter(content).body.trim();
  const words = body ? body.split(/\s+/).length : 0;
  const chars = body.length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  return { words, chars, minutes };
}

export function toggleCheckboxInMarkdown(content: string, taskIndex: number, checked: boolean): string {
  let current = 0;
  const { props, body } = parseFrontmatter(content);
  const updatedBody = body.replace(/^([ \t]*[-*+]\s+\[)([ xX])(\])/gm, (m, a, _stateChar, b) => {
    if (current++ === taskIndex) {
      return `${a}${checked ? 'x' : ' '}${b}`;
    }
    return m;
  });
  return buildFrontmatter(props, updatedBody);
}

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  hint: 'Hint',
  info: 'Info',
  warning: 'Warning',
  caution: 'Caution',
  danger: 'Danger',
  error: 'Error',
  bug: 'Bug',
  example: 'Example',
  abstract: 'Abstract',
  quote: 'Quote',
  cite: 'Cite',
  success: 'Success',
  check: 'Check',
  question: 'Question',
  faq: 'FAQ',
  todo: 'Todo'
};

export interface MediaResolution {
  url: string;
  kind?: 'image' | 'audio';
  name?: string;
}

const AUDIO_EXT_RX = /\.(mp3|wav|ogg|m4a|webm|aac|flac)(?:[?#].*)?$/i;
const IMAGE_EXT_RX = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/i;

function isSafeMediaUrl(url: string): boolean {
  return /^(https?:\/\/|blob:|data:(image|audio)\/|\/)/i.test(url.trim());
}

export function renderMarkdownToHtml(
  rawContent: string,
  resolveNote: (target: string) => Note | undefined,
  resolveMediaUrl?: (ref: string) => MediaResolution | undefined
): string {
  const { body } = parseFrontmatter(rawContent);
  const placeholders: string[] = [];
  const addPH = (html: string) => {
    const id = `@@AETHER_PH_${placeholders.length}@@`;
    placeholders.push(html);
    return id;
  };

  let md = stripSrsCommentsForPreview(body);

  // 1. Protect Mermaid, Live Project Queries & Fenced Code Blocks
  md = md.replace(/```([\w-]*)\r?\n([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const l = (lang || '').toLowerCase();
    if (l === 'mermaid') {
      return addPH(`<div class="mermaid">${escHtml(code.trim())}</div>`);
    }
    if (l === 'nosidian-query' || l === 'query' || l === 'tasks' || l === 'dataview') {
      return addPH(
        `<div class="nosidian-query-slot" data-query-spec="${escHtml(code.trim())}"></div>`
      );
    }
    let highlighted = escHtml(code);
    try {
      highlighted =
        l && hljs.getLanguage(l)
          ? hljs.highlight(code, { language: l }).value
          : hljs.highlightAuto(code).value;
    } catch {
      highlighted = escHtml(code);
    }
    return addPH(
      `<div class="code-block-wrap"><div class="code-block-header"><span>${escHtml(l || 'text')}</span><button class="code-copy-btn" type="button">Copy</button></div><pre><code>${highlighted}</code></pre></div>`
    );
  });

  // 2. Protect Inline Code
  md = md.replace(/`([^`\n]+)`/g, (_, c: string) => addPH(`<code>${escHtml(c)}</code>`));

  // 3. Protect Display Math $$...$$ & Inline Math $...$
  md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
    try {
      return addPH(
        `<div class="math-block">${katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`
      );
    } catch {
      return addPH(`<pre>$$${escHtml(tex)}$$</pre>`);
    }
  });
  md = md.replace(/\$([^\s$][^$\n]*?)\$/g, (_, tex: string) => {
    try {
      return addPH(katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }));
    } catch {
      return addPH(`<code>$${escHtml(tex)}$</code>`);
    }
  });

  // 4. Highlights ==text==, Underline ++text++, & Furigana {漢字|かんじ}
  md = md.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  md = md.replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>');
  md = renderFuriganaHtml(md);

  // 5. Standard Markdown Media ![alt](url) -> Zoomable Image or Custom Audio Player
  md = md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (full: string, alt: string, rawUrl: string) => {
    const resolved = resolveMediaUrl?.(rawUrl);
    const finalUrl = resolved?.url || rawUrl;
    if (!isSafeMediaUrl(finalUrl)) {
      return full;
    }
    const isAudio =
      resolved?.kind === 'audio' ||
      /^audio:/i.test(alt.trim()) ||
      AUDIO_EXT_RX.test(rawUrl) ||
      /^data:audio\//i.test(finalUrl);

    if (isAudio) {
      const displayName = alt.replace(/^audio:/i, '').trim() || resolved?.name || 'Audio Clip';
      return addPH(
        `<div class="nosidian-audio-slot" data-audio-src="${escHtml(finalUrl)}" data-audio-name="${escHtml(displayName)}"></div>`
      );
    }

    const cleanAlt = alt || resolved?.name || 'Image';
    return addPH(
      `<figure class="nosidian-img-wrap"><img src="${escHtml(finalUrl)}" alt="${escHtml(cleanAlt)}" class="nosidian-zoom-img" data-zoom-src="${escHtml(finalUrl)}" referrerpolicy="no-referrer" /><figcaption class="nosidian-img-caption">${escHtml(cleanAlt)}</figcaption></figure>`
    );
  });

  // 6. Subtle block-id anchor hiding in reader mode
  md = md.replace(/\s\^([a-zA-Z0-9_-]{3,})(?=\r?\n|$)/g, '<span class="block-anchor" title="^$1">^$1</span>');

  // 7. Wikilinks ![[...]] & [[...]]
  md = md.replace(/(!?)\[\[([^\]]+)\]\]/g, (_, embed: string, inner: string) => {
    const [targetPart, aliasPart] = inner.split('|');
    const [noteTarget, heading] = targetPart.split('#');
    const display = (aliasPart || targetPart).trim();
    const targetNote = resolveNote(noteTarget);
    if (embed === '!') {
      const mediaMatch = resolveMediaUrl?.(noteTarget.trim());
      if (mediaMatch && isSafeMediaUrl(mediaMatch.url)) {
        if (mediaMatch.kind === 'audio' || AUDIO_EXT_RX.test(noteTarget)) {
          return addPH(
            `<div class="nosidian-audio-slot" data-audio-src="${escHtml(mediaMatch.url)}" data-audio-name="${escHtml(mediaMatch.name || display)}"></div>`
          );
        }
        return addPH(
          `<figure class="nosidian-img-wrap"><img src="${escHtml(mediaMatch.url)}" alt="${escHtml(display)}" class="nosidian-zoom-img" data-zoom-src="${escHtml(mediaMatch.url)}" referrerpolicy="no-referrer" /></figure>`
        );
      }
      if (AUDIO_EXT_RX.test(noteTarget) && isSafeMediaUrl(noteTarget)) {
        return addPH(
          `<div class="nosidian-audio-slot" data-audio-src="${escHtml(noteTarget)}" data-audio-name="${escHtml(display)}"></div>`
        );
      }
      if (IMAGE_EXT_RX.test(noteTarget) && isSafeMediaUrl(noteTarget)) {
        return addPH(
          `<figure class="nosidian-img-wrap"><img src="${escHtml(noteTarget)}" alt="${escHtml(display)}" class="nosidian-zoom-img" data-zoom-src="${escHtml(noteTarget)}" referrerpolicy="no-referrer" /></figure>`
        );
      }
      if (targetNote) {
        const snippet = parseFrontmatter(targetNote.content).body.slice(0, 260);
        return `<div class="callout" data-callout="note"><div class="callout-title">Embedded: ${escHtml(noteBaseName(targetNote.path))}</div><div class="callout-content"><p dir="auto">${escHtml(snippet)}...</p></div></div>`;
      }
    }
    const cls = targetNote ? 'wikilink' : 'wikilink is-unresolved';
    return `<a href="#" class="${cls}" data-target="${escHtml(noteTarget.trim())}" data-heading="${escHtml((heading || '').trim())}">${escHtml(display)}</a>`;
  });

  // 8. Inline Tags #tag
  md = md.replace(/(^|[\s(])#([\p{L}\p{N}_/-]+)/gu, (full: string, pre: string, tag: string) => {
    if (/^\d+$/.test(tag)) return full;
    return `${pre}<button type="button" class="inline-tag" data-tag="${escHtml(tag)}">#${escHtml(tag)}</button>`;
  });

  // 9. Parse Markdown via marked
  let html = marked.parse(md, { gfm: true, breaks: true }) as string;

  // 10. Sanitize in browser context (keep <u>, <ins>, and safe interactive tags intact)
  if (typeof window !== 'undefined' && typeof DOMPurify?.sanitize === 'function') {
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['mark', 'button', 'ruby', 'rt', 'u', 'ins', 'figure', 'figcaption'],
      ADD_ATTR: [
        'dir',
        'data-target',
        'data-heading',
        'data-tag',
        'data-callout',
        'open',
        'type',
        'checked',
        'href',
        'title',
        'class'
      ]
    });
  }

  // 11. Restore placeholders (KaTeX, hljs, mermaid, validated media slots & zoomable images)
  html = html.replace(/@@AETHER_PH_(\d+)@@/g, (_, idx: string) => placeholders[Number(idx)] || '');

  // 12. Post-process DOM for Callouts, Bidirectional dir="auto", Interactive Checkboxes & Heading IDs
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('blockquote').forEach(bq => {
      const firstP = bq.querySelector('p');
      if (!firstP) return;
      const m = firstP.innerHTML.match(/^\[!([\w-]+)\]([+-])?\s*([^\n<]*)?(?:<br\s*\/?>)?([\s\S]*)/i);
      if (!m) return;
      const type = m[1].toLowerCase();
      const fold = m[2];
      const title = (m[3] || CALLOUT_LABELS[type] || type).trim();
      const rest = m[4] || '';

      const callout = document.createElement('div');
      callout.className = 'callout' + (fold === '-' ? ' is-collapsed' : '');
      callout.setAttribute('data-callout', type);

      const titleEl = document.createElement('button');
      titleEl.type = 'button';
      titleEl.className = 'callout-title';
      titleEl.setAttribute('dir', 'auto');
      titleEl.innerHTML =
        `<span class="callout-badge">${escHtml(CALLOUT_LABELS[type] || type.toUpperCase())}</span>` +
        `<span class="callout-heading">${title}</span>` +
        (fold ? `<span class="callout-fold">${fold === '-' ? '+' : '−'}</span>` : '');

      const contentEl = document.createElement('div');
      contentEl.className = 'callout-content';
      if (rest.trim()) {
        const p = document.createElement('p');
        p.innerHTML = rest;
        contentEl.appendChild(p);
      }
      while (firstP.nextSibling) contentEl.appendChild(firstP.nextSibling);
      callout.append(titleEl, contentEl);
      bq.replaceWith(callout);
    });

    temp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote').forEach(el => {
      el.setAttribute('dir', 'auto');
    });

    let cbIdx = 0;
    temp.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.removeAttribute('disabled');
      (cb as HTMLInputElement).dataset.taskIndex = String(cbIdx++);
      if ((cb as HTMLInputElement).checked && cb.parentElement) {
        cb.parentElement.classList.add('task-done');
      }
    });

    let hIdx = 0;
    temp.querySelectorAll('h1, h2, h3, h4').forEach(h => {
      h.id = 'heading-' + hIdx++;
    });

    return temp.innerHTML;
  }

  return html;
}
