// Top of a person note: photo, relation, quick contact links, connections and
// the books and films they recommended. It reads the note's frontmatter, so
// it updates as the note or the shelf changes.
import { For, Show, createMemo } from "solid-js";
import { BookOpen, Clapperboard, Users } from "lucide-solid";
import { t } from "../../i18n";
import { media } from "../../state/media";
import { isPersonPath, readPerson } from "../../state/people";
import { openView } from "../../state/views";
import { openNote } from "../../state/vault";
import { Avatar } from "./Avatar";
import { HeroFold } from "../media/MediaNoteHero";

const nameOf = (p: string) => p.split("/").pop()!.replace(/\.md$/i, "");
const QUICK = ["phone", "email", "telegram", "whatsapp", "instagram"] as const;

export function PersonNoteHero(props: { path: string }) {
  const person = createMemo(() => (isPersonPath(props.path) ? readPerson(props.path) : null));
  const books = () => media.state.books.filter((b) => b.recommendedBy === props.path);
  const movies = () => media.state.movies.filter((m) => m.recommendedBy === props.path);
  return (
    <Show when={person()}>
      {(p) => (
        <HeroFold label={t("view-people")} title={p().name}>
        <aside class="media-hero person-hero" aria-label={p().name}>
          <Avatar path={props.path} photo={p().photo} size="lg" />
          <div class="media-hero-body">
            <strong class="media-hero-title" dir="auto">{p().name}</strong>
            <Show when={p().fields.relation || p().fields.work}><span class="muted" dir="auto">{[p().fields.relation, p().fields.work].filter(Boolean).join(" · ")}</span></Show>
            <div class="media-hero-chips">
              <For each={QUICK.filter((f) => p().fields[f])}>{(f) => <span class="chip" dir="ltr" title={t(`people-field-${f}`)}>{p().fields[f]}</span>}</For>
              <For each={p().traits}>{(x) => <span class="chip" dir="auto">{x}</span>}</For>
            </div>
            <Show when={books().length || movies().length || p().related.length}>
              <div class="row wrap person-hero-links">
                <For each={p().related}>{(r) => <button class="btn sm" onClick={() => openNote(r)}><Avatar path={r} size="sm" />{nameOf(r)}</button>}</For>
                <For each={books()}>{(b) => <button class="btn sm" onClick={() => (b.linkedNotePath ? openNote(b.linkedNotePath) : void openView("media"))}><BookOpen />{b.title}</button>}</For>
                <For each={movies()}>{(m) => <button class="btn sm" onClick={() => (m.linkedNotePath ? openNote(m.linkedNotePath) : void openView("media"))}><Clapperboard />{m.title}</button>}</For>
              </div>
            </Show>
            <div class="row wrap media-hero-actions">
              <button class="btn sm" onClick={() => void openView("people")}><Users />{t("view-people")}</button>
            </div>
          </div>
        </aside>
        </HeroFold>
      )}
    </Show>
  );
}
