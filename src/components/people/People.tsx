// The people network: everyone in the People folder, with a profile per
// person (photo, contact details, socials, traits, places, connections) and
// everything in the vault that points at them: notes that link to them and
// books or films they recommended. Edits go straight to the person's note.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { ArrowLeft, AtSign, BookOpen, Camera, Clapperboard, ExternalLink, FileText, Globe, Mail, MapPin, Phone, Plus, Search, Sparkles, UserPlus, Users, X } from "lucide-solid";
import { t } from "../../i18n";
import { backlinks } from "../../lib/links";
import { resolveLink } from "../../lib/markdown";
import { copyDroppedFiles } from "../../state/dropFiles";
import { media } from "../../state/media";
import { PERSON_FIELDS, createPerson, linkTo, peoplePaths, personFrontmatter, readPerson, type Person, type PersonField } from "../../state/people";
import { pref } from "../../state/prefs";
import { askText } from "../../state/ui";
import { contents, ensureLoaded, markdownPaths, openNote, setContent } from "../../state/vault";
import { Avatar } from "./Avatar";

const SOCIAL: Partial<Record<PersonField, (v: string) => string>> = {
  phone: (v) => `tel:${v.replace(/[^\d+]/g, "")}`,
  email: (v) => `mailto:${v}`,
  website: (v) => (/^https?:/i.test(v) ? v : `https://${v}`),
  instagram: (v) => `https://instagram.com/${v.replace(/^@/, "")}`,
  telegram: (v) => `https://t.me/${v.replace(/^@/, "")}`,
  whatsapp: (v) => `https://wa.me/${v.replace(/\D/g, "")}`,
  x: (v) => `https://x.com/${v.replace(/^@/, "")}`,
  linkedin: (v) => `https://linkedin.com/in/${v.replace(/^@/, "")}`,
  github: (v) => `https://github.com/${v.replace(/^@/, "")}`,
};
const urlOf = (f: PersonField, v: string) => (/^https?:/i.test(v) && f !== "phone" && f !== "email" ? v : SOCIAL[f]?.(v));
const nameOf = (p: string) => p.split("/").pop()!.replace(/\.md$/i, "");

function fieldIcon(f: PersonField) {
  if (f === "phone" || f === "whatsapp") return <Phone aria-hidden="true" />;
  if (f === "email") return <Mail aria-hidden="true" />;
  if (f === "address" || f === "city") return <MapPin aria-hidden="true" />;
  if (f === "website" || f === "linkedin" || f === "github") return <Globe aria-hidden="true" />;
  if (f === "instagram" || f === "telegram" || f === "x") return <AtSign aria-hidden="true" />;
  return <Sparkles aria-hidden="true" />;
}

function patchPerson(path: string, patch: Record<string, string | string[]>) {
  setContent(path, personFrontmatter(contents[path] ?? "", patch));
}

function pickPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const folder = pref("attachmentFolder").trim().replace(/^\/+|\/+$/g, "");
      const [path] = await copyDroppedFiles([f], `${folder ? `${folder}/` : ""}attachments/people`, true);
      resolve(path ?? null);
    };
    input.click();
  });
}

/** Chips with an add box; used for traits, places and connections. */
function ChipList(props: { items: string[]; label: string; onRemove: (x: string) => void; onAdd: (x: string) => void; render?: (x: string) => any; options?: string[] }) {
  const [v, setV] = createSignal("");
  const id = `dl-${Math.random().toString(36).slice(2, 8)}`;
  const add = () => { const x = v().trim(); if (x) props.onAdd(x); setV(""); };
  return (
    <div class="person-chips">
      <For each={props.items}>{(x) => (
        <span class="chip person-chip">{props.render ? props.render(x) : <span dir="auto">{x}</span>}
          <button class="icon-btn xs" aria-label={t("action-delete")} onClick={() => props.onRemove(x)}><X /></button>
        </span>
      )}</For>
      <form class="person-chip-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input class="input sm" dir="auto" list={props.options ? id : undefined} placeholder={props.label} aria-label={props.label} value={v()} onInput={(e) => setV(e.currentTarget.value)} onBlur={add} />
        <Show when={props.options}><datalist id={id}><For each={props.options}>{(o) => <option value={o} />}</For></datalist></Show>
      </form>
    </div>
  );
}

function Profile(props: { path: string; onBack: () => void; select: (p: string) => void }) {
  const person = createMemo<Person>(() => readPerson(props.path));
  const paths = () => markdownPaths();
  const mentions = createMemo(() => backlinks(props.path, contents, paths()));
  const books = () => media.state.books.filter((b) => b.recommendedBy === props.path);
  const movies = () => media.state.movies.filter((m) => m.recommendedBy === props.path);
  // Connections both ways: people this note lists, and people whose note lists this one.
  const connected = createMemo(() => {
    const out = new Set(person().related);
    for (const p of peoplePaths()) if (p !== props.path && readPerson(p).related.includes(props.path)) out.add(p);
    return [...out];
  });
  const setRelated = (list: string[]) => patchPerson(props.path, { related: list.map(linkTo) });
  const placeVal = (y: string) => (resolveLink(y, paths()) ? `"[[${y}]]"` : y);
  // Handles are stored without "@" (it would break the note's YAML front matter).
  const setField = (f: PersonField, v: string) => patchPerson(props.path, { [f]: ["instagram", "telegram", "x", "github", "linkedin"].includes(f) ? v.trim().replace(/^@+/, "") : v.trim() });
  const addRelated = async (name: string) => {
    let p = peoplePaths().find((x) => nameOf(x).toLowerCase() === name.toLowerCase()) ?? null;
    if (!p) p = await createPerson(name, false);
    if (p && p !== props.path && !person().related.includes(p)) setRelated([...person().related, p]);
  };

  return (
    <article class="person-profile">
      <header class="person-head">
        <button class="icon-btn person-back" aria-label={t("action-back")} onClick={props.onBack}><ArrowLeft class="flip-rtl" /></button>
        <button class="person-photo" title={t("people-photo")} aria-label={t("people-photo")} onClick={async () => { const p = await pickPhoto(); if (p) patchPerson(props.path, { photo: `"[[${p}]]"` }); }}>
          <Avatar path={props.path} photo={person().photo} size="lg" />
          <span class="person-photo-edit"><Camera aria-hidden="true" /></span>
        </button>
        <div class="stack person-title">
          <h1 dir="auto">{person().name}</h1>
          <input class="input sm person-relation" dir="auto" placeholder={t("people-field-relation")} aria-label={t("people-field-relation")} value={person().fields.relation ?? ""} onChange={(e) => setField("relation", e.currentTarget.value)} />
        </div>
        <button class="btn sm" onClick={() => openNote(props.path)}><FileText />{t("people-open-note")}</button>
      </header>

      <section class="person-section">
        <h2 class="section-title">{t("people-contact")}</h2>
        <div class="person-fields">
          <For each={PERSON_FIELDS.filter((f) => f !== "relation")}>{(f) => (
            <label class="person-field">
              <span class="person-field-label">{fieldIcon(f)}{t(`people-field-${f}` as "people-field-phone")}</span>
              <input class="input sm" type={f === "birthday" ? "date" : f === "email" ? "email" : f === "phone" || f === "whatsapp" ? "tel" : "text"} dir={f === "address" || f === "city" || f === "work" ? "auto" : "ltr"} value={person().fields[f] ?? ""} onChange={(e) => setField(f, e.currentTarget.value)} />
              <Show when={person().fields[f] && urlOf(f, person().fields[f]!)}>
                {(href) => <a class="icon-btn sm" href={href()} target="_blank" rel="noopener" title={t("people-open-link")} aria-label={t("people-open-link")} onClick={(e) => { if (/^https?:/.test(href())) { e.preventDefault(); window.open(href(), "_blank", "noopener"); } }}><ExternalLink /></a>}
              </Show>
            </label>
          )}</For>
        </div>
      </section>

      <section class="person-section">
        <h2 class="section-title">{t("people-traits")}</h2>
        <ChipList items={person().traits} label={t("people-add-trait")} onAdd={(x) => patchPerson(props.path, { traits: [...person().traits, x] })} onRemove={(x) => patchPerson(props.path, { traits: person().traits.filter((y) => y !== x) })} />
      </section>

      <section class="person-section">
        <h2 class="section-title"><Users aria-hidden="true" />{t("people-connections")}</h2>
        <ChipList
          items={connected()}
          label={t("people-add-connection")}
          options={peoplePaths().filter((p) => p !== props.path).map(nameOf)}
          render={(p) => <button class="link-btn" onClick={() => props.select(p)}><Avatar path={p} photo={readPerson(p).photo} size="sm" /><span dir="auto">{nameOf(p)}</span></button>}
          onAdd={(x) => void addRelated(x)}
          onRemove={(p) => setRelated(person().related.filter((y) => y !== p))}
        />
      </section>

      <section class="person-section">
        <h2 class="section-title"><MapPin aria-hidden="true" />{t("people-places")}</h2>
        <ChipList
          items={person().places}
          label={t("people-add-place")}
          options={paths().map(nameOf)}
          render={(x) => { const p = resolveLink(x, paths()); return p ? <button class="link-btn" onClick={() => openNote(p)} dir="auto">{x}</button> : <span dir="auto">{x}</span>; }}
          onAdd={(x) => patchPerson(props.path, { places: [...person().places, x].map(placeVal) })}
          onRemove={(x) => patchPerson(props.path, { places: person().places.filter((y) => y !== x).map(placeVal) })}
        />
      </section>

      <Show when={books().length || movies().length}>
        <section class="person-section">
          <h2 class="section-title">{t("people-recommended")}</h2>
          <ul class="person-links">
            <For each={books()}>{(b) => <li><button class="link-btn" onClick={() => (b.linkedNotePath ? openNote(b.linkedNotePath) : openNote("app:media"))}><BookOpen aria-hidden="true" /><span dir="auto">{b.title}</span></button><span class="muted sm">{t(`media-book-${b.status}`)}</span></li>}</For>
            <For each={movies()}>{(m) => <li><button class="link-btn" onClick={() => (m.linkedNotePath ? openNote(m.linkedNotePath) : openNote("app:media"))}><Clapperboard aria-hidden="true" /><span dir="auto">{m.title}</span></button><span class="muted sm">{t(`media-status-${m.status}`)}</span></li>}</For>
          </ul>
        </section>
      </Show>

      <section class="person-section">
        <h2 class="section-title">{t("people-mentioned-in")}</h2>
        <ul class="person-links">
          <For each={mentions()} fallback={<li class="muted sm">{t("people-no-mentions")}</li>}>
            {(m) => <li><button class="link-btn" onClick={() => openNote(m.path)}><FileText aria-hidden="true" /><span dir="auto">{nameOf(m.path)}</span></button><span class="muted sm person-snippet" dir="auto">{m.snippet}</span></li>}
          </For>
        </ul>
      </section>
    </article>
  );
}

export default function People() {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal<string | null>(null);
  // Person notes must be loaded to read their profiles.
  createEffect(() => { for (const p of peoplePaths()) void ensureLoaded(p); });
  const people = createMemo(() => {
    const s = q().trim().toLowerCase();
    return peoplePaths().map(readPerson).filter((p) => !s || [p.name, ...Object.values(p.fields), ...p.traits].some((x) => x?.toLowerCase().includes(s)));
  });
  createEffect(() => { const s = sel(); if (s && !peoplePaths().includes(s)) setSel(null); });
  const add = async () => {
    const name = await askText(t("people-new"), "", t("action-add"));
    if (!name?.trim()) return;
    const p = await createPerson(name, false);
    if (p) setSel(p);
  };

  return (
    <div class="people page" classList={{ "has-sel": !!sel() }}>
      <header class="page-head">
        <h1>{t("view-people")}</h1>
        <span class="tb-fill" />
        <button class="btn primary" onClick={() => void add()}><UserPlus />{t("people-new")}</button>
      </header>
      <div class="people-layout">
        <aside class="people-list">
          <label class="search-field"><Search aria-hidden="true" /><input class="input sm" type="search" dir="auto" placeholder={t("people-search")} aria-label={t("people-search")} value={q()} onInput={(e) => setQ(e.currentTarget.value)} /></label>
          <ul>
            <For each={people()} fallback={<li class="empty-state"><Users /><p>{peoplePaths().length ? t("no-results") : t("people-empty")}</p><Show when={!peoplePaths().length}><button class="btn" onClick={() => void add()}><Plus />{t("people-new")}</button></Show></li>}>
              {(p) => (
                <li><button class="person-row" aria-current={sel() === p.path} onClick={() => setSel(p.path)}>
                  <Avatar path={p.path} photo={p.photo} />
                  <span class="stack"><strong dir="auto">{p.name}</strong><span class="muted sm" dir="auto">{p.fields.relation || p.fields.work || p.fields.city || ""}</span></span>
                </button></li>
              )}
            </For>
          </ul>
        </aside>
        <Show when={sel()} fallback={<div class="people-empty muted"><Users aria-hidden="true" /><p>{t("people-pick")}</p></div>}>
          {(p) => <Profile path={p()} onBack={() => setSel(null)} select={setSel} />}
        </Show>
      </div>
    </div>
  );
}
