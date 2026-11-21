// Media shelf: films and series (watch status, episodes, rating, quotes) and
// books (pages, highlights). Each entry can open or create its own note.
import { For, Show, createMemo, createSignal } from "solid-js";
import { BookOpen, Film, FileText, Minus, Pencil, Plus, Star, Trash2 } from "lucide-solid";
import { t } from "../../i18n";
import { addBookHighlight, computeBookProgressPercent, computeSeriesProgressPercent, updateBookReadingPage, updateMovieProgress } from "../../core/mediaLibrary";
import type { BookEntry, BookReadStatus, CinemaEntry, CinemaWatchStatus } from "../../core/types";
import { media, openMediaNote } from "../../state/media";
import { newId } from "../../state/projects";
import { askText } from "../../state/ui";
import { Modal } from "../Modal";

function Stars(props: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div class="stars" role="radiogroup" aria-label={props.label}>
      <For each={[1, 2, 3, 4, 5]}>{(n) => <button role="radio" aria-checked={props.value === n} aria-label={String(n)} class="star" classList={{ on: props.value >= n }} onClick={() => props.onChange(props.value === n ? 0 : n)}><Star /></button>}</For>
    </div>
  );
}

const MOVIE_STATUSES: CinemaWatchStatus[] = ["watchlist", "watching", "watched"];
const BOOK_STATUSES: BookReadStatus[] = ["to-read", "reading", "finished"];

function MovieEditor(props: { entry: CinemaEntry; onClose: () => void }) {
  const [e, setE] = createSignal({ ...props.entry, favoriteQuotes: [...props.entry.favoriteQuotes] });
  const p = (x: Partial<CinemaEntry>) => setE((v) => ({ ...v, ...x }));
  const save = () => { media.update((m) => { const i = m.movies.findIndex((x) => x.id === e().id); const next = { ...e(), updatedAt: Date.now() }; if (i >= 0) m.movies[i] = next; else m.movies.unshift(next); }); props.onClose(); };
  return (
    <Modal title={e().title || t("media-add-movie")} onClose={props.onClose}>
      <form class="stack" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <label class="field"><span>{t("media-title")}</span><input class="input" data-autofocus dir="auto" value={e().title} onInput={(ev) => p({ title: ev.currentTarget.value })} /></label>
        <div class="row wrap">
          <label class="field"><span>{t("media-type")}</span><select class="select" value={e().mediaType} onChange={(ev) => p({ mediaType: ev.currentTarget.value as CinemaEntry["mediaType"] })}><option value="movie">{t("media-movie")}</option><option value="series">{t("media-series")}</option></select></label>
          <label class="field"><span>{t("media-status")}</span><select class="select" value={e().status} onChange={(ev) => p({ status: ev.currentTarget.value as CinemaWatchStatus })}><For each={MOVIE_STATUSES}>{(s) => <option value={s}>{t(`media-status-${s}`)}</option>}</For></select></label>
          <label class="field"><span>{t("media-year")}</span><input class="input num" value={e().year} onInput={(ev) => p({ year: ev.currentTarget.value })} /></label>
        </div>
        <div class="row wrap">
          <label class="field"><span>{t("media-director")}</span><input class="input" dir="auto" value={e().director} onInput={(ev) => p({ director: ev.currentTarget.value })} /></label>
          <label class="field"><span>{t("media-genre")}</span><input class="input" dir="auto" value={e().genre} onInput={(ev) => p({ genre: ev.currentTarget.value })} /></label>
        </div>
        <Show when={e().mediaType === "series"}>
          <label class="field"><span>{t("media-episodes-total")}</span><input class="input num" type="number" min="1" value={e().episodesTotal} onInput={(ev) => p({ episodesTotal: Number(ev.currentTarget.value) || 1 })} /></label>
        </Show>
        <Stars label={t("media-rating")} value={e().rating} onChange={(v) => p({ rating: v })} />
        <label class="field"><span>{t("media-quotes")}</span><textarea class="input" dir="auto" value={e().favoriteQuotes.join("\n")} onInput={(ev) => p({ favoriteQuotes: ev.currentTarget.value.split("\n").filter((s) => s.trim()) })} /></label>
        <label class="field"><span>{t("media-notes")}</span><textarea class="input" dir="auto" value={e().notes} onInput={(ev) => p({ notes: ev.currentTarget.value })} /></label>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!e().title.trim()}>{t("action-save")}</button></div>
      </form>
    </Modal>
  );
}

function BookEditor(props: { entry: BookEntry; onClose: () => void }) {
  const [e, setE] = createSignal({ ...props.entry, highlights: [...props.entry.highlights] });
  const p = (x: Partial<BookEntry>) => setE((v) => ({ ...v, ...x }));
  const save = () => { media.update((m) => { const i = m.books.findIndex((x) => x.id === e().id); const next = { ...e(), updatedAt: Date.now() }; if (i >= 0) m.books[i] = next; else m.books.unshift(next); }); props.onClose(); };
  return (
    <Modal title={e().title || t("media-add-book")} onClose={props.onClose}>
      <form class="stack" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <label class="field"><span>{t("media-title")}</span><input class="input" data-autofocus dir="auto" value={e().title} onInput={(ev) => p({ title: ev.currentTarget.value })} /></label>
        <div class="row wrap">
          <label class="field"><span>{t("media-author")}</span><input class="input" dir="auto" value={e().author} onInput={(ev) => p({ author: ev.currentTarget.value })} /></label>
          <label class="field"><span>{t("media-genre")}</span><input class="input" dir="auto" value={e().genre} onInput={(ev) => p({ genre: ev.currentTarget.value })} /></label>
        </div>
        <div class="row wrap">
          <label class="field"><span>{t("media-status")}</span><select class="select" value={e().status} onChange={(ev) => p({ status: ev.currentTarget.value as BookReadStatus })}><For each={BOOK_STATUSES}>{(s) => <option value={s}>{t(`media-book-${s}`)}</option>}</For></select></label>
          <label class="field"><span>{t("media-pages")}</span><input class="input num" type="number" min="1" value={e().totalPages} onInput={(ev) => p({ totalPages: Number(ev.currentTarget.value) || 1 })} /></label>
        </div>
        <Stars label={t("media-rating")} value={e().rating} onChange={(v) => p({ rating: v })} />
        <label class="field"><span>{t("media-notes")}</span><textarea class="input" dir="auto" value={e().notes} onInput={(ev) => p({ notes: ev.currentTarget.value })} /></label>
        <Show when={e().highlights.length}>
          <ul class="list compact"><For each={e().highlights}>{(h) => <li dir="auto">“{h.quote}”{h.page ? ` · ${t("media-page", { page: h.page })}` : ""}</li>}</For></ul>
        </Show>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!e().title.trim()}>{t("action-save")}</button></div>
      </form>
    </Modal>
  );
}

const blankMovie = (): CinemaEntry => ({ id: newId("mov"), title: "", mediaType: "movie", status: "watchlist", director: "", year: "", genre: "", runtimeMin: 0, episodesWatched: 0, episodesTotal: 1, rating: 0, favoriteQuotes: [], notes: "", createdAt: Date.now(), updatedAt: Date.now() });
const blankBook = (): BookEntry => ({ id: newId("book"), title: "", author: "", status: "to-read", currentPage: 0, totalPages: 300, genre: "", rating: 0, highlights: [], notes: "", createdAt: Date.now(), updatedAt: Date.now() });

export default function MediaShelf() {
  const [tab, setTab] = createSignal<"movies" | "books">("movies");
  const [filter, setFilter] = createSignal("all");
  const [movie, setMovie] = createSignal<CinemaEntry | null>(null);
  const [book, setBook] = createSignal<BookEntry | null>(null);
  const movies = createMemo(() => media.state.movies.filter((m) => filter() === "all" || m.status === filter()));
  const books = createMemo(() => media.state.books.filter((b) => filter() === "all" || b.status === filter()));
  const setMovieEntry = (next: CinemaEntry) => media.update((m) => { const i = m.movies.findIndex((x) => x.id === next.id); if (i >= 0) m.movies[i] = next; });
  const setBookEntry = (next: BookEntry) => media.update((m) => { const i = m.books.findIndex((x) => x.id === next.id); if (i >= 0) m.books[i] = next; });
  const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return (
    <div class="media page">
      <header class="page-head">
        <h1>{t("view-media")}</h1>
        <div class="segmented" role="tablist">
          <button role="tab" aria-selected={tab() === "movies"} onClick={() => { setTab("movies"); setFilter("all"); }}><Film />{t("media-movies")}</button>
          <button role="tab" aria-selected={tab() === "books"} onClick={() => { setTab("books"); setFilter("all"); }}><BookOpen />{t("media-books")}</button>
        </div>
        <span class="tb-fill" />
        <select class="select sm" aria-label={t("media-status")} value={filter()} onChange={(e) => setFilter(e.currentTarget.value)}>
          <option value="all">{t("media-all")}</option>
          <For each={tab() === "movies" ? MOVIE_STATUSES : BOOK_STATUSES}>{(s) => <option value={s}>{t(tab() === "movies" ? `media-status-${s}` as "media-status-watched" : `media-book-${s}` as "media-book-reading")}</option>}</For>
        </select>
        <button class="btn primary sm" onClick={() => (tab() === "movies" ? setMovie(blankMovie()) : setBook(blankBook()))}><Plus />{tab() === "movies" ? t("media-add-movie") : t("media-add-book")}</button>
      </header>
      <Show when={tab() === "movies"} fallback={
        <div class="media-grid">
          <For each={books()} fallback={<p class="empty">{t("media-empty")}</p>}>
            {(b) => (
              <article class="media-card glass-soft">
                <h3 dir="auto">{b.title}</h3>
                <p class="muted" dir="auto">{b.author}{b.genre ? ` · ${b.genre}` : ""}</p>
                <div class="meter" role="progressbar" aria-label={b.title} aria-valuenow={computeBookProgressPercent(b)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${computeBookProgressPercent(b)}%` }} /></div>
                <label class="row sm">{t("media-page-label")}<input class="input sm num" type="number" min="0" max={b.totalPages} value={b.currentPage} onChange={(e) => setBookEntry(updateBookReadingPage(copy(b), Number(e.currentTarget.value)))} /> / {b.totalPages}</label>
                <Stars label={t("media-rating")} value={b.rating} onChange={(v) => setBookEntry({ ...copy(b), rating: v })} />
                <div class="row">
                  <button class="btn sm" onClick={async () => { const q = await askText(t("media-add-highlight"), "", t("action-add")); if (q?.trim()) setBookEntry(addBookHighlight(copy(b), q.trim(), b.currentPage || undefined)); }}>{t("media-add-highlight")}</button>
                  <button class="icon-btn sm" title={t("media-open-note")} aria-label={t("media-open-note")} onClick={() => void openMediaNote("book", b)}><FileText /></button>
                  <button class="icon-btn sm" title={t("dash-edit")} aria-label={t("dash-edit")} onClick={() => setBook(copy(b))}><Pencil /></button>
                  <button class="icon-btn sm" title={t("action-delete")} aria-label={t("action-delete")} onClick={() => media.update((m) => { m.books = m.books.filter((x) => x.id !== b.id); })}><Trash2 /></button>
                </div>
              </article>
            )}
          </For>
        </div>
      }>
        <div class="media-grid">
          <For each={movies()} fallback={<p class="empty">{t("media-empty")}</p>}>
            {(m) => (
              <article class="media-card glass-soft">
                <h3 dir="auto">{m.title}</h3>
                <p class="muted" dir="auto">{[m.year, m.director, m.genre].filter(Boolean).join(" · ")}</p>
                <select class="select sm" aria-label={t("media-status")} value={m.status} onChange={(e) => setMovieEntry({ ...copy(m), status: e.currentTarget.value as CinemaWatchStatus, updatedAt: Date.now() })}>
                  <For each={MOVIE_STATUSES}>{(s) => <option value={s}>{t(`media-status-${s}`)}</option>}</For>
                </select>
                <Show when={m.mediaType === "series"}>
                  <div class="row sm">
                    <button class="icon-btn sm" aria-label={t("media-episode-back")} onClick={() => setMovieEntry(updateMovieProgress(copy(m), -1))}><Minus /></button>
                    <span>{t("media-episodes", { watched: m.episodesWatched, total: m.episodesTotal })}</span>
                    <button class="icon-btn sm" aria-label={t("media-episode-next")} onClick={() => setMovieEntry(updateMovieProgress(copy(m), 1))}><Plus /></button>
                  </div>
                </Show>
                <div class="meter" role="progressbar" aria-label={m.title} aria-valuenow={computeSeriesProgressPercent(m)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${computeSeriesProgressPercent(m)}%` }} /></div>
                <Stars label={t("media-rating")} value={m.rating} onChange={(v) => setMovieEntry({ ...copy(m), rating: v })} />
                <div class="row">
                  <button class="btn sm" onClick={() => setMovie(copy(m))}>{t("dash-edit")}</button>
                  <button class="icon-btn sm" title={t("media-open-note")} aria-label={t("media-open-note")} onClick={() => void openMediaNote("movie", m)}><FileText /></button>
                  <button class="icon-btn sm" title={t("action-delete")} aria-label={t("action-delete")} onClick={() => media.update((x) => { x.movies = x.movies.filter((y) => y.id !== m.id); })}><Trash2 /></button>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
      <Show when={movie()} keyed>{(m) => <MovieEditor entry={m} onClose={() => setMovie(null)} />}</Show>
      <Show when={book()} keyed>{(b) => <BookEditor entry={b} onClose={() => setBook(null)} />}</Show>
    </div>
  );
}
