// Cinema and books: a shelf of generated covers, what you are reading or
// watching now with one-tap progress, a yearly reading goal, and a detail
// panel for rating, dates, highlights or quotes, notes and the linked note.
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import { BookOpen, BookmarkPlus, CheckCircle2, Clapperboard, FileText, Film, Minus, Pencil, Plus, Quote, Search, Star, Target, Trash2, Tv } from "lucide-solid";
import { locale, t } from "../../i18n";
import { addBookHighlight, computeBookProgressPercent, computeSeriesProgressPercent, updateBookReadingPage, updateMovieProgress } from "../../core/mediaLibrary";
import type { BookEntry, BookReadStatus, CinemaEntry, CinemaWatchStatus } from "../../core/types";
import { media, openMediaNote } from "../../state/media";
import { newId } from "../../state/projects";
import { askText } from "../../state/ui";
import { Modal } from "../Modal";
import { openMenu, type MenuItem } from "../ContextMenu";

type Kind = "books" | "cinema";
const MOVIE_STATUSES: CinemaWatchStatus[] = ["watching", "watchlist", "watched"];
const BOOK_STATUSES: BookReadStatus[] = ["reading", "to-read", "finished"];
// Muted cover colours; the title picks one so a cover keeps its colour.
const COVERS = ["#35507a", "#6b4a3a", "#2f5d50", "#5a3f6b", "#7a5a2c", "#3e4a5c", "#6a3440", "#2c5566", "#4f5a2e", "#5c4a6e"];
const num = (n: number) => n.toLocaleString(locale());
const today = () => new Date().toISOString().slice(0, 10);
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const coverOf = (title: string) => { let h = 0; for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COVERS[h % COVERS.length]; };
const fmtDate = (s?: string) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(locale(), { year: "numeric", month: "short", day: "numeric" }) : "");
const statusLabel = (kind: Kind, s: string) => t(kind === "books" ? (`media-book-${s}` as "media-book-reading") : (`media-status-${s}` as "media-status-watched"));

function setBook(next: BookEntry) { media.update((m) => { const i = m.books.findIndex((x) => x.id === next.id); if (i >= 0) m.books[i] = next; else m.books.unshift(next); }); }
function setMovie(next: CinemaEntry) { media.update((m) => { const i = m.movies.findIndex((x) => x.id === next.id); if (i >= 0) m.movies[i] = next; else m.movies.unshift(next); }); }
const removeBook = (id: string) => media.update((m) => { m.books = m.books.filter((x) => x.id !== id); });
const removeMovie = (id: string) => media.update((m) => { m.movies = m.movies.filter((x) => x.id !== id); });

function setBookStatus(b: BookEntry, s: BookReadStatus) {
  const next = { ...copy(b), status: s, updatedAt: Date.now() };
  if (s === "reading" && !next.startedDate) next.startedDate = today();
  if (s === "finished") { next.currentPage = next.totalPages; next.finishedDate ||= today(); }
  setBook(next);
}
function setMovieStatus(m: CinemaEntry, s: CinemaWatchStatus) {
  const next = { ...copy(m), status: s, updatedAt: Date.now() };
  if (s === "watched") { next.episodesWatched = next.episodesTotal; next.watchedDate ||= today(); }
  setMovie(next);
}

function Stars(props: { value: number; onChange?: (v: number) => void; label: string; small?: boolean }) {
  return (
    <div class="stars" classList={{ sm: props.small }} role={props.onChange ? "radiogroup" : "img"} aria-label={props.onChange ? props.label : t("media-rated", { n: props.value })}>
      <For each={[1, 2, 3, 4, 5]}>{(n) => props.onChange
        ? <button type="button" role="radio" aria-checked={props.value === n} aria-label={String(n)} class="star" classList={{ on: props.value >= n }} onClick={(e) => { e.stopPropagation(); props.onChange!(props.value === n ? 0 : n); }}><Star /></button>
        : <Star class="star" classList={{ on: props.value >= n }} aria-hidden="true" />}</For>
    </div>
  );
}

/** A generated cover: a calm colour field with the title set in type. */
function Cover(props: { title: string; sub?: string; kind: Kind; series?: boolean; progress?: number }) {
  return (
    <div class="cover" classList={{ poster: props.kind === "cinema" }} style={{ "--cover": coverOf(props.title || "?") }} aria-hidden="true">
      <span class="cover-icon">{props.kind === "books" ? <BookOpen /> : props.series ? <Tv /> : <Film />}</span>
      <strong dir="auto">{props.title}</strong>
      <Show when={props.sub}><span class="cover-sub" dir="auto">{props.sub}</span></Show>
      <Show when={props.progress !== undefined && props.progress > 0 && props.progress < 100}><span class="cover-progress" style={{ width: `${props.progress}%` }} /></Show>
    </div>
  );
}

function bookMenu(e: MouseEvent, b: BookEntry, open: () => void) {
  const items: MenuItem[] = [
    { label: t("media-details"), icon: <Pencil />, run: open },
    { label: t("media-open-note"), icon: <FileText />, run: () => void openMediaNote("book", b) },
    ...BOOK_STATUSES.map((s, i) => ({ label: t(`media-book-${s}`), mark: b.status === s, sep: i === 0, run: () => setBookStatus(b, s) })),
    { label: t("action-delete"), icon: <Trash2 />, danger: true, sep: true, run: () => removeBook(b.id) },
  ];
  openMenu(e, items);
}
function movieMenu(e: MouseEvent, m: CinemaEntry, open: () => void) {
  const items: MenuItem[] = [
    { label: t("media-details"), icon: <Pencil />, run: open },
    { label: t("media-open-note"), icon: <FileText />, run: () => void openMediaNote("movie", m) },
    ...MOVIE_STATUSES.map((s, i) => ({ label: t(`media-status-${s}`), mark: m.status === s, sep: i === 0, run: () => setMovieStatus(m, s) })),
    { label: t("action-delete"), icon: <Trash2 />, danger: true, sep: true, run: () => removeMovie(m.id) },
  ];
  openMenu(e, items);
}

/** Add form: title first, the rest optional. */
function AddEntry(props: { kind: Kind; onClose: () => void; onAdded: (id: string) => void }) {
  const [title, setTitle] = createSignal("");
  const [by, setBy] = createSignal("");
  const [genre, setGenre] = createSignal("");
  const [size, setSize] = createSignal(props.kind === "books" ? 300 : 1);
  const [series, setSeries] = createSignal(false);
  const [year, setYear] = createSignal("");
  const [status, setStatus] = createSignal<string>(props.kind === "books" ? "to-read" : "watchlist");
  const add = () => {
    const now = Date.now();
    if (props.kind === "books") {
      const b: BookEntry = { id: newId("book"), title: title().trim(), author: by().trim(), status: "to-read", currentPage: 0, totalPages: Math.max(1, size()), genre: genre().trim(), rating: 0, highlights: [], notes: "", createdAt: now, updatedAt: now };
      setBook(b); setBookStatus(b, status() as BookReadStatus); props.onAdded(b.id);
    } else {
      const m: CinemaEntry = { id: newId("mov"), title: title().trim(), mediaType: series() ? "series" : "movie", status: "watchlist", director: by().trim(), year: year().trim(), genre: genre().trim(), runtimeMin: 0, episodesWatched: 0, episodesTotal: series() ? Math.max(1, size()) : 1, rating: 0, favoriteQuotes: [], notes: "", createdAt: now, updatedAt: now };
      setMovie(m); setMovieStatus(m, status() as CinemaWatchStatus); props.onAdded(m.id);
    }
    props.onClose();
  };
  return (
    <Modal title={props.kind === "books" ? t("media-add-book") : t("media-add-movie")} onClose={props.onClose}>
      <form class="stack" onSubmit={(e) => { e.preventDefault(); if (title().trim()) add(); }}>
        <Show when={props.kind === "cinema"}>
          <div class="segmented" role="radiogroup" aria-label={t("media-type")}>
            <button type="button" role="radio" aria-checked={!series()} onClick={() => { setSeries(false); setSize(1); }}><Film />{t("media-movie")}</button>
            <button type="button" role="radio" aria-checked={series()} onClick={() => { setSeries(true); setSize(10); }}><Tv />{t("media-series")}</button>
          </div>
        </Show>
        <label class="field"><span>{t("media-title")}</span><input class="input" data-autofocus dir="auto" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} /></label>
        <div class="form-grid">
          <label class="field"><span>{props.kind === "books" ? t("media-author") : t("media-director")}</span><input class="input" dir="auto" value={by()} onInput={(e) => setBy(e.currentTarget.value)} /></label>
          <label class="field"><span>{t("media-genre")}</span><input class="input" dir="auto" value={genre()} onInput={(e) => setGenre(e.currentTarget.value)} /></label>
          <Show when={props.kind === "books"}><label class="field"><span>{t("media-pages")}</span><input class="input num" type="number" min="1" value={size()} onInput={(e) => setSize(Number(e.currentTarget.value) || 1)} /></label></Show>
          <Show when={props.kind === "cinema"}><label class="field"><span>{t("media-year")}</span><input class="input num" inputmode="numeric" value={year()} onInput={(e) => setYear(e.currentTarget.value)} /></label></Show>
          <Show when={props.kind === "cinema" && series()}><label class="field"><span>{t("media-episodes-total")}</span><input class="input num" type="number" min="1" value={size()} onInput={(e) => setSize(Number(e.currentTarget.value) || 1)} /></label></Show>
        </div>
        <div class="segmented" role="radiogroup" aria-label={t("media-status")}>
          <For each={props.kind === "books" ? BOOK_STATUSES : MOVIE_STATUSES}>{(s) => <button type="button" role="radio" aria-checked={status() === s} onClick={() => setStatus(s)}>{statusLabel(props.kind, s)}</button>}</For>
        </div>
        <div class="modal-actions"><button type="button" class="btn" onClick={props.onClose}>{t("action-cancel")}</button><button class="btn primary" disabled={!title().trim()}>{t("action-add")}</button></div>
      </form>
    </Modal>
  );
}

function BookDetail(props: { id: string; onClose: () => void }) {
  const b = () => media.state.books.find((x) => x.id === props.id);
  const [quote, setQuote] = createSignal("");
  const [page, setPage] = createSignal("");
  const field = (k: keyof BookEntry) => (e: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => { const cur = b(); if (cur) setBook({ ...copy(cur), [k]: k === "totalPages" ? Math.max(1, Number(e.currentTarget.value) || 1) : e.currentTarget.value, updatedAt: Date.now() }); };
  return (
    <Show when={b()}>
      {(bk) => (
        <Modal title={bk().title} onClose={props.onClose} class="media-detail">
          <div class="detail-top">
            <Cover title={bk().title} sub={bk().author} kind="books" />
            <div class="stack">
              <div class="segmented" role="radiogroup" aria-label={t("media-status")}>
                <For each={BOOK_STATUSES}>{(s) => <button type="button" role="radio" aria-checked={bk().status === s} onClick={() => setBookStatus(bk(), s)}>{t(`media-book-${s}`)}</button>}</For>
              </div>
              <div class="progress-line">
                <button class="icon-btn" aria-label={t("media-pages-back")} onClick={() => setBook(updateBookReadingPage(copy(bk()), bk().currentPage - 10))}><Minus /></button>
                <label class="page-input">{t("media-page-label")}<input class="input sm num" type="number" min="0" max={bk().totalPages} value={bk().currentPage} onChange={(e) => setBook(updateBookReadingPage(copy(bk()), Number(e.currentTarget.value)))} /><span class="muted">/ {num(bk().totalPages)}</span></label>
                <button class="icon-btn" aria-label={t("media-pages-forward")} onClick={() => setBook(updateBookReadingPage(copy(bk()), bk().currentPage + 10))}><Plus /></button>
              </div>
              <div class="meter" role="progressbar" aria-label={bk().title} aria-valuenow={computeBookProgressPercent(bk())} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${computeBookProgressPercent(bk())}%` }} /></div>
              <Stars label={t("media-rating")} value={bk().rating} onChange={(v) => setBook({ ...copy(bk()), rating: v })} />
              <p class="muted sm">
                <Show when={bk().startedDate}>{t("media-started", { date: fmtDate(bk().startedDate) })} </Show>
                <Show when={bk().finishedDate}>· {t("media-finished-on", { date: fmtDate(bk().finishedDate) })}</Show>
              </p>
              <div class="row wrap">
                <button class="btn sm" onClick={() => void openMediaNote("book", bk())}><FileText />{t("media-open-note")}</button>
                <button class="btn sm danger" onClick={() => { removeBook(bk().id); props.onClose(); }}><Trash2 />{t("action-delete")}</button>
              </div>
            </div>
          </div>
          <section class="stack">
            <h3 class="section-title"><Quote aria-hidden="true" />{t("media-highlights")}</h3>
            <form class="quick-add" onSubmit={(e) => { e.preventDefault(); if (!quote().trim()) return; setBook(addBookHighlight(copy(bk()), quote(), Number(page()) || bk().currentPage || undefined)); setQuote(""); setPage(""); }}>
              <input class="input" dir="auto" placeholder={t("media-add-highlight")} aria-label={t("media-add-highlight")} value={quote()} onInput={(e) => setQuote(e.currentTarget.value)} />
              <input class="input sm num page-no" type="number" min="1" placeholder={t("media-page-label")} aria-label={t("media-page-label")} value={page()} onInput={(e) => setPage(e.currentTarget.value)} />
              <button class="btn sm" disabled={!quote().trim()}><BookmarkPlus />{t("action-add")}</button>
            </form>
            <ul class="quote-list">
              <For each={bk().highlights} fallback={<li class="muted sm">{t("media-no-highlights")}</li>}>
                {(h) => <li><blockquote dir="auto">{h.quote}</blockquote><span class="muted sm">{h.page ? t("media-page", { page: h.page }) : ""}</span><button class="icon-btn xs" aria-label={t("action-delete")} onClick={() => setBook({ ...copy(bk()), highlights: bk().highlights.filter((x) => x.id !== h.id) })}><Trash2 /></button></li>}
              </For>
            </ul>
          </section>
          <details class="detail-more">
            <summary>{t("media-details")}</summary>
            <div class="form-grid">
              <label class="field"><span>{t("media-title")}</span><input class="input" dir="auto" value={bk().title} onChange={field("title")} /></label>
              <label class="field"><span>{t("media-author")}</span><input class="input" dir="auto" value={bk().author} onChange={field("author")} /></label>
              <label class="field"><span>{t("media-genre")}</span><input class="input" dir="auto" value={bk().genre} onChange={field("genre")} /></label>
              <label class="field"><span>{t("media-pages")}</span><input class="input num" type="number" min="1" value={bk().totalPages} onChange={field("totalPages")} /></label>
            </div>
            <label class="field"><span>{t("media-notes")}</span><textarea class="input" dir="auto" rows="3" value={bk().notes} onChange={field("notes")} /></label>
          </details>
        </Modal>
      )}
    </Show>
  );
}

function MovieDetail(props: { id: string; onClose: () => void }) {
  const m = () => media.state.movies.find((x) => x.id === props.id);
  const [quote, setQuote] = createSignal("");
  const field = (k: keyof CinemaEntry) => (e: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => { const cur = m(); if (cur) setMovie({ ...copy(cur), [k]: k === "episodesTotal" || k === "runtimeMin" ? Math.max(k === "episodesTotal" ? 1 : 0, Number(e.currentTarget.value) || 0) : e.currentTarget.value, updatedAt: Date.now() }); };
  return (
    <Show when={m()}>
      {(mv) => (
        <Modal title={mv().title} onClose={props.onClose} class="media-detail">
          <div class="detail-top">
            <Cover title={mv().title} sub={[mv().year, mv().director].filter(Boolean).join(" · ")} kind="cinema" series={mv().mediaType === "series"} />
            <div class="stack">
              <div class="segmented" role="radiogroup" aria-label={t("media-status")}>
                <For each={MOVIE_STATUSES}>{(s) => <button type="button" role="radio" aria-checked={mv().status === s} onClick={() => setMovieStatus(mv(), s)}>{t(`media-status-${s}`)}</button>}</For>
              </div>
              <Show when={mv().mediaType === "series"}>
                <div class="progress-line">
                  <button class="icon-btn" aria-label={t("media-episode-back")} onClick={() => setMovie(updateMovieProgress(copy(mv()), -1))}><Minus /></button>
                  <span>{t("media-episodes", { watched: mv().episodesWatched, total: mv().episodesTotal })}</span>
                  <button class="icon-btn" aria-label={t("media-episode-next")} onClick={() => setMovie(updateMovieProgress(copy(mv()), 1))}><Plus /></button>
                </div>
                <div class="meter" role="progressbar" aria-label={mv().title} aria-valuenow={computeSeriesProgressPercent(mv())} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${computeSeriesProgressPercent(mv())}%` }} /></div>
              </Show>
              <Stars label={t("media-rating")} value={mv().rating} onChange={(v) => setMovie({ ...copy(mv()), rating: v })} />
              <Show when={mv().watchedDate}><p class="muted sm">{t("media-watched-on", { date: fmtDate(mv().watchedDate) })}</p></Show>
              <div class="row wrap">
                <button class="btn sm" onClick={() => void openMediaNote("movie", mv())}><FileText />{t("media-open-note")}</button>
                <button class="btn sm danger" onClick={() => { removeMovie(mv().id); props.onClose(); }}><Trash2 />{t("action-delete")}</button>
              </div>
            </div>
          </div>
          <section class="stack">
            <h3 class="section-title"><Quote aria-hidden="true" />{t("media-quotes-title")}</h3>
            <form class="quick-add" onSubmit={(e) => { e.preventDefault(); if (!quote().trim()) return; setMovie({ ...copy(mv()), favoriteQuotes: [quote().trim(), ...mv().favoriteQuotes], updatedAt: Date.now() }); setQuote(""); }}>
              <input class="input" dir="auto" placeholder={t("media-add-quote")} aria-label={t("media-add-quote")} value={quote()} onInput={(e) => setQuote(e.currentTarget.value)} />
              <button class="btn sm" disabled={!quote().trim()}><Plus />{t("action-add")}</button>
            </form>
            <ul class="quote-list">
              <For each={mv().favoriteQuotes} fallback={<li class="muted sm">{t("media-no-quotes")}</li>}>
                {(q, i) => <li><blockquote dir="auto">{q}</blockquote><span /><button class="icon-btn xs" aria-label={t("action-delete")} onClick={() => setMovie({ ...copy(mv()), favoriteQuotes: mv().favoriteQuotes.filter((_, j) => j !== i()) })}><Trash2 /></button></li>}
              </For>
            </ul>
          </section>
          <details class="detail-more">
            <summary>{t("media-details")}</summary>
            <div class="form-grid">
              <label class="field"><span>{t("media-title")}</span><input class="input" dir="auto" value={mv().title} onChange={field("title")} /></label>
              <label class="field"><span>{t("media-director")}</span><input class="input" dir="auto" value={mv().director} onChange={field("director")} /></label>
              <label class="field"><span>{t("media-year")}</span><input class="input num" value={mv().year} onChange={field("year")} /></label>
              <label class="field"><span>{t("media-genre")}</span><input class="input" dir="auto" value={mv().genre} onChange={field("genre")} /></label>
              <Show when={mv().mediaType === "series"} fallback={<label class="field"><span>{t("media-runtime")}</span><input class="input num" type="number" min="0" value={mv().runtimeMin || ""} onChange={field("runtimeMin")} /></label>}>
                <label class="field"><span>{t("media-episodes-total")}</span><input class="input num" type="number" min="1" value={mv().episodesTotal} onChange={field("episodesTotal")} /></label>
              </Show>
            </div>
            <label class="field"><span>{t("media-notes")}</span><textarea class="input" dir="auto" rows="3" value={mv().notes} onChange={field("notes")} /></label>
          </details>
        </Modal>
      )}
    </Show>
  );
}

function Stat(props: { icon: JSX.Element; value: number; label: string }) {
  return <div class="stat-tile">{props.icon}<strong>{num(props.value)}</strong><span>{props.label}</span></div>;
}

export default function MediaShelf() {
  const [kind, setKind] = createSignal<Kind>("books");
  const [filter, setFilter] = createSignal<string>("all");
  const [q, setQ] = createSignal("");
  const [adding, setAdding] = createSignal(false);
  const [open, setOpen] = createSignal<string | null>(null);
  const year = String(new Date().getFullYear());

  const match = (...xs: string[]) => { const s = q().trim().toLowerCase(); return !s || xs.some((x) => x.toLowerCase().includes(s)); };
  const books = createMemo(() => media.state.books.filter((b) => (filter() === "all" || b.status === filter()) && match(b.title, b.author, b.genre)));
  const movies = createMemo(() => media.state.movies.filter((m) => (filter() === "all" || m.status === filter()) && match(m.title, m.director, m.genre, m.year)));
  const nowBooks = () => media.state.books.filter((b) => b.status === "reading");
  const nowMovies = () => media.state.movies.filter((m) => m.status === "watching");
  const finishedThisYear = () => media.state.books.filter((b) => b.status === "finished" && (b.finishedDate ?? "").startsWith(year)).length;
  const pagesRead = () => media.state.books.reduce((n, b) => n + (b.status === "finished" ? b.totalPages : b.currentPage), 0);
  const episodes = () => media.state.movies.reduce((n, m) => n + (m.mediaType === "series" ? m.episodesWatched : 0), 0);
  const avgRating = () => { const r = media.state.movies.filter((m) => m.rating > 0); return r.length ? Math.round((r.reduce((n, m) => n + m.rating, 0) / r.length) * 10) / 10 : 0; };
  const count = (s: string) => (kind() === "books" ? media.state.books : media.state.movies).filter((x) => s === "all" || x.status === s).length;
  const goal = () => media.state.readingGoal ?? 0;
  const setGoal = async () => { const v = await askText(t("media-goal-set"), String(goal() || 12), t("action-save")); if (v !== null) media.update((m) => { m.readingGoal = Math.max(0, Math.round(Number(v) || 0)); }); };
  const switchKind = (k: Kind) => { setKind(k); setFilter("all"); };

  return (
    <div class="media page">
      <header class="page-head">
        <h1>{t("view-media")}</h1>
        <div class="segmented" role="tablist">
          <button role="tab" aria-selected={kind() === "books"} onClick={() => switchKind("books")}><BookOpen aria-hidden="true" /><span class="seg-label">{t("media-books")}</span></button>
          <button role="tab" aria-selected={kind() === "cinema"} onClick={() => switchKind("cinema")}><Clapperboard aria-hidden="true" /><span class="seg-label">{t("media-movies")}</span></button>
        </div>
        <button class="btn primary" onClick={() => setAdding(true)}><Plus />{kind() === "books" ? t("media-add-book") : t("media-add-movie")}</button>
      </header>

      <div class="stat-row">
        <Show when={kind() === "books"} fallback={<>
          <Stat icon={<Clapperboard aria-hidden="true" />} value={media.state.movies.length} label={t("media-stat-titles")} />
          <Stat icon={<CheckCircle2 aria-hidden="true" />} value={count("watched")} label={t("media-status-watched")} />
          <Stat icon={<Tv aria-hidden="true" />} value={episodes()} label={t("media-stat-episodes")} />
          <Stat icon={<Star aria-hidden="true" />} value={avgRating()} label={t("media-stat-rating")} />
        </>}>
          <Stat icon={<BookOpen aria-hidden="true" />} value={media.state.books.length} label={t("media-stat-books")} />
          <Stat icon={<CheckCircle2 aria-hidden="true" />} value={finishedThisYear()} label={t("media-stat-this-year")} />
          <Stat icon={<FileText aria-hidden="true" />} value={pagesRead()} label={t("media-stat-pages")} />
          <button class="stat-tile goal" onClick={() => void setGoal()} title={t("media-goal-set")}>
            <Target aria-hidden="true" />
            <Show when={goal()} fallback={<><strong>—</strong><span>{t("media-goal-none")}</span></>}>
              <strong>{num(finishedThisYear())} / {num(goal())}</strong>
              <div class="meter sm"><span style={{ width: `${Math.min(100, (finishedThisYear() / goal()) * 100)}%` }} /></div>
            </Show>
          </button>
        </Show>
      </div>

      <Show when={(kind() === "books" ? nowBooks() : nowMovies()).length && filter() === "all" && !q()}>
        <section class="stack">
          <h2 class="section-title">{kind() === "books" ? t("media-now-reading") : t("media-now-watching")}</h2>
          <div class="now-grid">
            <Show when={kind() === "books"} fallback={
              <For each={nowMovies()}>{(m) => (
                <article class="now-card card glass-soft" onContextMenu={(e) => movieMenu(e, m, () => setOpen(m.id))}>
                  <button class="cover-btn" onClick={() => setOpen(m.id)} aria-label={m.title}><Cover title={m.title} kind="cinema" series={m.mediaType === "series"} /></button>
                  <div class="stack">
                    <strong dir="auto">{m.title}</strong>
                    <span class="muted sm" dir="auto">{[m.year, m.director].filter(Boolean).join(" · ")}</span>
                    <Show when={m.mediaType === "series"} fallback={<button class="btn sm align-start" onClick={() => setMovieStatus(m, "watched")}><CheckCircle2 />{t("media-mark-watched")}</button>}>
                      <div class="meter sm"><span style={{ width: `${computeSeriesProgressPercent(m)}%` }} /></div>
                      <div class="row">
                        <span class="sm">{t("media-episodes", { watched: m.episodesWatched, total: m.episodesTotal })}</span>
                        <span class="tb-fill" />
                        <button class="btn sm" onClick={() => setMovie(updateMovieProgress(copy(m), 1))}><Plus />{t("media-plus-episode")}</button>
                      </div>
                    </Show>
                  </div>
                </article>
              )}</For>
            }>
              <For each={nowBooks()}>{(b) => (
                <article class="now-card card glass-soft" onContextMenu={(e) => bookMenu(e, b, () => setOpen(b.id))}>
                  <button class="cover-btn" onClick={() => setOpen(b.id)} aria-label={b.title}><Cover title={b.title} kind="books" /></button>
                  <div class="stack">
                    <strong dir="auto">{b.title}</strong>
                    <span class="muted sm" dir="auto">{b.author}</span>
                    <div class="meter sm"><span style={{ width: `${computeBookProgressPercent(b)}%` }} /></div>
                    <div class="row">
                      <label class="page-input sm">{t("media-page-label")}<input class="input sm num" type="number" min="0" max={b.totalPages} value={b.currentPage} onChange={(e) => setBook(updateBookReadingPage(copy(b), Number(e.currentTarget.value)))} /><span class="muted">/ {num(b.totalPages)}</span></label>
                      <span class="tb-fill" />
                      <button class="icon-btn sm" title={t("media-add-highlight")} aria-label={t("media-add-highlight")} onClick={async () => { const v = await askText(t("media-add-highlight"), "", t("action-add")); if (v?.trim()) setBook(addBookHighlight(copy(b), v, b.currentPage || undefined)); }}><BookmarkPlus /></button>
                    </div>
                  </div>
                </article>
              )}</For>
            </Show>
          </div>
        </section>
      </Show>

      <div class="shelf-bar">
        <div class="chip-row" role="tablist" aria-label={t("media-status")}>
          <For each={["all", ...(kind() === "books" ? BOOK_STATUSES : MOVIE_STATUSES)]}>
            {(s) => <button class="chip" role="tab" aria-selected={filter() === s} onClick={() => setFilter(s)}>{s === "all" ? t("media-all") : statusLabel(kind(), s)}<span class="count">{num(count(s))}</span></button>}
          </For>
        </div>
        <label class="search-field"><Search aria-hidden="true" /><input class="input sm" type="search" dir="auto" placeholder={t("media-search")} aria-label={t("media-search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} /></label>
      </div>

      <Show when={kind() === "books"} fallback={
        <div class="shelf" classList={{ posters: true }}>
          <For each={movies()} fallback={<div class="empty-state"><Clapperboard /><p>{media.state.movies.length ? t("no-results") : t("media-empty-cinema")}</p><Show when={!media.state.movies.length}><button class="btn primary" onClick={() => setAdding(true)}><Plus />{t("media-add-movie")}</button></Show></div>}>
            {(m) => (
              <button class="shelf-item" onClick={() => setOpen(m.id)} onContextMenu={(e) => movieMenu(e, m, () => setOpen(m.id))}>
                <Cover title={m.title} sub={m.year} kind="cinema" series={m.mediaType === "series"} progress={m.mediaType === "series" ? computeSeriesProgressPercent(m) : undefined} />
                <span class="shelf-title" dir="auto">{m.title}</span>
                <span class="shelf-meta"><span class={`dot ${m.status}`} />{t(`media-status-${m.status}`)}<Show when={m.rating}><Stars small label="" value={m.rating} /></Show></span>
              </button>
            )}
          </For>
        </div>
      }>
        <div class="shelf">
          <For each={books()} fallback={<div class="empty-state"><BookOpen /><p>{media.state.books.length ? t("no-results") : t("media-empty-books")}</p><Show when={!media.state.books.length}><button class="btn primary" onClick={() => setAdding(true)}><Plus />{t("media-add-book")}</button></Show></div>}>
            {(b) => (
              <button class="shelf-item" onClick={() => setOpen(b.id)} onContextMenu={(e) => bookMenu(e, b, () => setOpen(b.id))}>
                <Cover title={b.title} sub={b.author} kind="books" progress={computeBookProgressPercent(b)} />
                <span class="shelf-title" dir="auto">{b.title}</span>
                <span class="shelf-meta"><span class={`dot ${b.status}`} />{t(`media-book-${b.status}`)}<Show when={b.rating}><Stars small label="" value={b.rating} /></Show></span>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={adding()}><AddEntry kind={kind()} onClose={() => setAdding(false)} onAdded={() => undefined} /></Show>
      <Show when={open()} keyed>{(id) => kind() === "books" ? <BookDetail id={id} onClose={() => setOpen(null)} /> : <MovieDetail id={id} onClose={() => setOpen(null)} />}</Show>
    </div>
  );
}
