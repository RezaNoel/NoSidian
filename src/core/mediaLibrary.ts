import type {
  BookEntry,
  BookHighlight,
  BookReadStatus,
  CinemaEntry,
  CinemaWatchStatus,
  MediaLibraryState
} from './types';

export function sanitizeMediaNoteSlug(title: string, fallback = 'Untitled'): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 72);
  return cleaned || fallback;
}

export function computeBookProgressPercent(book: Pick<BookEntry, 'currentPage' | 'totalPages' | 'status'>): number {
  if (book.status === 'finished') return 100;
  const total = Math.max(1, book.totalPages || 0);
  const current = Math.max(0, Math.min(total, book.currentPage || 0));
  return Math.round((current / total) * 100);
}

export function computeSeriesProgressPercent(
  entry: Pick<CinemaEntry, 'episodesWatched' | 'episodesTotal' | 'status' | 'mediaType'>
): number {
  if (entry.status === 'watched') return 100;
  if (entry.mediaType === 'movie') return entry.status === 'watching' ? 50 : 0;
  const total = Math.max(1, entry.episodesTotal || 1);
  const watched = Math.max(0, Math.min(total, entry.episodesWatched || 0));
  return Math.round((watched / total) * 100);
}

export function createDefaultMediaLibrary(now = Date.now()): MediaLibraryState {
  return {
    movies: [
      {
        id: 'mov-inception',
        title: 'Inception',
        mediaType: 'movie',
        status: 'watched',
        director: 'Christopher Nolan',
        year: '2010',
        genre: 'Sci-Fi · Thriller',
        runtimeMin: 148,
        episodesWatched: 1,
        episodesTotal: 1,
        rating: 5,
        watchedDate: '2026-10-12',
        favoriteQuotes: [
          'An idea is like a virus. Resilient. Highly contagious.'
        ],
        notes: 'Layered dream architecture and Hans Zimmer score make every rewatch reveal subtle visual clues.',
        createdAt: now - 86400_000 * 10,
        updatedAt: now - 86400_000 * 3
      },
      {
        id: 'mov-severance',
        title: 'Severance',
        mediaType: 'series',
        status: 'watching',
        director: 'Ben Stiller',
        year: '2022',
        genre: 'Mystery · Sci-Fi',
        runtimeMin: 50,
        episodesWatched: 6,
        episodesTotal: 9,
        rating: 5,
        favoriteQuotes: ['The work is mysterious and important.'],
        notes: 'Brutalist Lumon corridors amplify psychological tension and memory compartmentalization themes.',
        createdAt: now - 86400_000 * 5,
        updatedAt: now - 86400_000
      },
      {
        id: 'mov-past-lives',
        title: 'Past Lives',
        mediaType: 'movie',
        status: 'watchlist',
        director: 'Celine Song',
        year: '2023',
        genre: 'Drama · Romance',
        runtimeMin: 106,
        episodesWatched: 0,
        episodesTotal: 1,
        rating: 0,
        favoriteQuotes: [],
        notes: 'Queued for weekend cinema night — explore "In-Yun" dialogue themes.',
        createdAt: now - 86400_000 * 2,
        updatedAt: now - 86400_000 * 2
      }
    ],
    books: [
      {
        id: 'book-smart-notes',
        title: 'How to Take Smart Notes',
        author: 'Sönke Ahrens',
        status: 'reading',
        currentPage: 112,
        totalPages: 184,
        genre: 'PKM · Methodology',
        rating: 5,
        startedDate: '2026-10-28',
        highlights: [
          {
            id: 'hl-1',
            page: 47,
            quote: 'You should not write down ideas for the sake of collecting; write to think and connect.'
          },
          {
            id: 'hl-2',
            page: 89,
            quote: 'Permanent notes turn passive reading into an active lattice of arguments.'
          }
        ],
        notes: 'Core blueprint behind evergreen atomic notes and bidirectional wikilink synthesis.',
        createdAt: now - 86400_000 * 14,
        updatedAt: now - 86400_000
      },
      {
        id: 'book-dune',
        title: 'Dune',
        author: 'Frank Herbert',
        status: 'finished',
        currentPage: 688,
        totalPages: 688,
        genre: 'Sci-Fi Classic',
        rating: 5,
        startedDate: '2026-08-01',
        finishedDate: '2026-09-14',
        highlights: [
          {
            id: 'hl-3',
            page: 18,
            quote: 'I must not fear. Fear is the mind-killer.'
          }
        ],
        notes: 'Ecology, political statecraft, and prescience themes linked with worldbuilding notes.',
        createdAt: now - 86400_000 * 60,
        updatedAt: now - 86400_000 * 20
      },
      {
        id: 'book-clean-arch',
        title: 'Designing Data-Intensive Applications',
        author: 'Martin Kleppmann',
        status: 'to-read',
        currentPage: 0,
        totalPages: 611,
        genre: 'Software Engineering',
        rating: 0,
        highlights: [],
        notes: 'Planned deep technical read for distributed sync & CRDT patterns.',
        createdAt: now - 86400_000 * 4,
        updatedAt: now - 86400_000 * 4
      }
    ]
  };
}

export function normalizeMediaLibrary(raw?: Partial<MediaLibraryState> | null): MediaLibraryState {
  if (!raw) return createDefaultMediaLibrary();
  return {
    movies: Array.isArray(raw.movies) ? raw.movies : [],
    books: Array.isArray(raw.books) ? raw.books : []
  };
}

export function updateMovieProgress(
  entry: CinemaEntry,
  deltaEpisodes: number,
  now = Date.now()
): CinemaEntry {
  const maxEp = Math.max(1, entry.episodesTotal || 1);
  const nextEp = Math.max(0, Math.min(maxEp, entry.episodesWatched + deltaEpisodes));
  let nextStatus: CinemaWatchStatus = entry.status;
  if (nextEp >= maxEp) nextStatus = 'watched';
  else if (nextEp > 0) nextStatus = 'watching';
  return {
    ...entry,
    episodesWatched: nextEp,
    status: nextStatus,
    updatedAt: now
  };
}

export function updateBookReadingPage(
  book: BookEntry,
  nextPageRaw: number,
  now = Date.now()
): BookEntry {
  const total = Math.max(1, book.totalPages || 1);
  const nextPage = Math.max(0, Math.min(total, Math.round(nextPageRaw)));
  let nextStatus: BookReadStatus = book.status;
  if (nextPage >= total) nextStatus = 'finished';
  else if (nextPage > 0) nextStatus = 'reading';
  else if (book.status === 'finished') nextStatus = 'reading';
  return {
    ...book,
    currentPage: nextPage,
    status: nextStatus,
    finishedDate:
      nextStatus === 'finished' ? book.finishedDate || new Date(now).toISOString().slice(0, 10) : book.finishedDate,
    updatedAt: now
  };
}

export function addBookHighlight(
  book: BookEntry,
  quote: string,
  page?: number,
  note?: string,
  now = Date.now()
): BookEntry {
  const cleanQuote = quote.trim();
  if (!cleanQuote) return book;
  const item: BookHighlight = {
    id: `hl-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    quote: cleanQuote,
    ...(page !== undefined && Number.isFinite(page) && page > 0 ? { page: Math.round(page) } : {}),
    ...(note?.trim() ? { note: note.trim() } : {})
  };
  return {
    ...book,
    highlights: [item, ...book.highlights],
    updatedAt: now
  };
}

export function generateMovieNoteMarkdown(entry: CinemaEntry): string {
  const stars = entry.rating > 0 ? `${'★'.repeat(entry.rating)}${'☆'.repeat(5 - entry.rating)} (${entry.rating}/5)` : 'Unrated';
  const quotesBlock = entry.favoriteQuotes.length
    ? entry.favoriteQuotes.map(q => `> "${q}"`).join('\n\n')
    : '> "Add memorable dialogue or scene quote here..."';

  return `---
type: ${entry.mediaType}
status: ${entry.status}
director: ${entry.director || 'Unknown'}
year: ${entry.year || ''}
genre: ${entry.genre || ''}
rating: ${entry.rating}
runtime_min: ${entry.runtimeMin || 0}
tags: [cinema, ${entry.mediaType}]
---

# ${entry.title}

- **Type**: ${entry.mediaType === 'series' ? 'TV Series' : 'Feature Film'} · **Status**: \`${entry.status}\`
- **Director / Creator**: ${entry.director || '—'} · **Year**: ${entry.year || '—'}
- **Personal Rating**: ${stars}
${entry.mediaType === 'series' ? `- **Episodes**: ${entry.episodesWatched} / ${entry.episodesTotal}\n` : ''}
## Takeaways & Review
${entry.notes || 'Write your spoiler-free reflections, cinematography notes, and key themes here.'}

## Favorite Quotes & Scenes
${quotesBlock}

## Connections
- Related thoughts: [[Welcome]]
`;
}

export function generateBookNoteMarkdown(book: BookEntry): string {
  const pct = computeBookProgressPercent(book);
  const stars = book.rating > 0 ? `${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)} (${book.rating}/5)` : 'Unrated';
  const highlightsBlock = book.highlights.length
    ? book.highlights
        .map(h => `> ${h.quote}${h.page ? `\n> — *p. ${h.page}*` : ''}${h.note ? `\n\n- Note: ${h.note}` : ''}`)
        .join('\n\n')
    : '> Capture your favorite passages and vocabulary highlights here.';

  return `---
type: book
status: ${book.status}
author: ${book.author || 'Unknown'}
genre: ${book.genre || ''}
progress: ${book.currentPage}/${book.totalPages} (${pct}%)
rating: ${book.rating}
tags: [books, reading]
---

# ${book.title}

- **Author**: ${book.author || '—'} · **Genre**: ${book.genre || '—'}
- **Progress**: ${book.currentPage} / ${book.totalPages} pages (${pct}%) · **Status**: \`${book.status}\`
- **Rating**: ${stars}

## Core Synthesis & Summary
${book.notes || 'Summarize the central thesis, actionable ideas, and chapter takeaways.'}

## Highlights & Quotes
${highlightsBlock}

## Flashcard Candidates
Core insight from ${book.title} :: Summarize the main takeaway in one clear sentence.
`;
}

export function buildMediaNotePath(kind: 'movie' | 'book', title: string): string {
  const folder = kind === 'movie' ? 'Movies' : 'Books';
  return `${folder}/${sanitizeMediaNoteSlug(title)}.md`;
}
