// Top of a book, film or series note: the cover beside the title and the
// shelf details (status, rating, progress, who recommended it). The note text
// below stays as it is; this card only shows what the shelf knows.
import { Show, createMemo, createResource } from "solid-js";
import { BookOpen, ChevronDown, ChevronRight, Film, Library, Star, Tv, UserRound } from "lucide-solid";
import { pref, setPref } from "../../state/prefs";
import type { JSX } from "solid-js";
import { t } from "../../i18n";
import { blobUrl } from "../../lib/attachments";
import { media } from "../../state/media";
import { openView } from "../../state/views";
import { openNote } from "../../state/vault";
import { noteTitle } from "../../lib/markdown";
import { computeBookProgressPercent, computeSeriesProgressPercent } from "../../core/mediaLibrary";
import type { BookEntry, CinemaEntry } from "../../core/types";
import { coverColor } from "./mediaCard";

type Found = { kind: "book"; e: BookEntry } | { kind: "movie"; e: CinemaEntry };

export function mediaEntryForNote(path: string): Found | null {
  const b = media.state.books.find((x) => x.linkedNotePath === path);
  if (b) return { kind: "book", e: b };
  const m = media.state.movies.find((x) => x.linkedNotePath === path);
  return m ? { kind: "movie", e: m } : null;
}

export function MediaNoteHero(props: { path: string }) {
  const found = createMemo(() => mediaEntryForNote(props.path));
  return (
    <Show when={found()}>
      {(f) => {
        const [res] = createResource(() => f().e.cover, (p) => blobUrl(p).catch(() => ""));
        const url = () => (f().e.cover ? res() : "");
        const sub = () => (f().kind === "book" ? (f().e as BookEntry).author : [(f().e as CinemaEntry).year, (f().e as CinemaEntry).director].filter(Boolean).join(" · "));
        const status = () => (f().kind === "book" ? t(`media-book-${(f().e as BookEntry).status}` as "media-book-reading") : t(`media-status-${(f().e as CinemaEntry).status}` as "media-status-watched"));
        const pct = () => (f().kind === "book" ? computeBookProgressPercent(f().e as BookEntry) : (f().e as CinemaEntry).mediaType === "series" ? computeSeriesProgressPercent(f().e as CinemaEntry) : -1);
        return (
          <HeroFold label={f().kind === "book" ? t("media-books") : t("media-movies")} title={f().e.title}>
          <aside class="media-hero" aria-label={f().e.title}>
            <div class="media-hero-cover" classList={{ poster: f().kind === "movie" }} style={{ "--cover": coverColor(f().e.title || "?") }}>
              <Show when={url()} fallback={<span class="cover-icon">{f().kind === "book" ? <BookOpen /> : (f().e as CinemaEntry).mediaType === "series" ? <Tv /> : <Film />}</span>}>
                {(u) => <img src={u()} alt="" draggable={false} />}
              </Show>
            </div>
            <div class="media-hero-body">
              <strong class="media-hero-title" dir="auto">{f().e.title}</strong>
              <Show when={sub()}><span class="muted" dir="auto">{sub()}</span></Show>
              <div class="media-hero-chips">
                <span class="chip on">{status()}</span>
                <Show when={f().e.genre}><span class="chip" dir="auto">{f().e.genre}</span></Show>
                <Show when={f().e.rating > 0}>
                  <span class="media-hero-stars" aria-label={t("media-rated", { n: f().e.rating })}>
                    {Array.from({ length: 5 }, (_, i) => <Star class="star" classList={{ on: i < f().e.rating }} aria-hidden="true" />)}
                  </span>
                </Show>
                <Show when={f().e.score}><span class="chip">{f().e.score} / 10</span></Show>
              </div>
              <Show when={pct() >= 0}>
                <div class="meter" role="progressbar" aria-valuenow={pct()} aria-valuemin="0" aria-valuemax="100" aria-label={f().e.title}><span style={{ width: `${pct()}%` }} /></div>
              </Show>
              <div class="row wrap media-hero-actions">
                <Show when={f().e.recommendedBy}>
                  {(who) => <button class="btn sm" onClick={() => openNote(who())}><UserRound />{t("media-recommended-by", { name: noteTitle(who()) })}</button>}
                </Show>
                <button class="btn sm" onClick={() => void openView("media")}><Library />{t("media-open-shelf")}</button>
              </div>
            </div>
          </aside>
          </HeroFold>
        );
      }}
    </Show>
  );
}

/** Fold bar above the book, film and person cards, like the Properties header: it hides the card, it never closes it. */
export function HeroFold(props: { label: string; title: string; children: JSX.Element }) {
  const open = () => !pref("mediaHeroCollapsed");
  return (
    <section class="hero-fold">
      <button class="props-head hero-fold-head" aria-expanded={open()} title={open() ? t("media-hero-hide") : t("media-hero-show")} onClick={() => setPref("mediaHeroCollapsed", open())}>
        {open() ? <ChevronDown aria-hidden="true" /> : <ChevronRight class="flip-rtl" aria-hidden="true" />}
        <span>{props.label}</span>
        <Show when={!open()}><span class="hero-fold-title" dir="auto">{props.title}</span></Show>
      </button>
      <Show when={open()}>{props.children}</Show>
    </section>
  );
}
