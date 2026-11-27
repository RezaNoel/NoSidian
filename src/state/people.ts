// The people network: one note per person in the People folder. Frontmatter
// holds the contact details and links; everything else in the app (books,
// films, notes, the home widget) links to these notes by path.
import { createMemo, createRoot } from "solid-js";
import { buildFrontmatter, parseFrontmatter } from "../core/markdown";
import { pref } from "./prefs";
import { contents, createNote, markdownPaths } from "./vault";

export const peopleFolder = () => pref("peopleFolder").trim().replace(/^\/+|\/+$/g, "") || "People";
export const isPersonPath = (p: string) => p.toLowerCase().startsWith(`${peopleFolder().toLowerCase()}/`) && p.toLowerCase().endsWith(".md");

const memo = createRoot(() => createMemo(() => markdownPaths().filter(isPersonPath).sort((a, b) => a.localeCompare(b))));
/** Vault paths of every person note, by name. */
export const peoplePaths = () => memo();

/** Contact and profile fields, in the order the profile shows them. */
export const PERSON_FIELDS = [
  "relation", "birthday", "phone", "email", "address", "city", "work", "website",
  "instagram", "telegram", "whatsapp", "x", "linkedin", "github",
] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];

export interface Person {
  path: string;
  name: string;
  photo?: string;
  fields: Partial<Record<PersonField, string>>;
  /** Other people (paths) this person is connected to. */
  related: string[];
  places: string[];
  tags: string[];
  traits: string[];
}

const linkTarget = (s: string) => s.replace(/^["']|["']$/g, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((x) => x.trim()).filter(Boolean);

/** Resolve a [[link]] or name to a person note path. */
export function personPathOf(target: string): string | null {
  const name = linkTarget(target).replace(/\.md$/i, "").toLowerCase();
  if (!name) return null;
  return peoplePaths().find((p) => p.toLowerCase() === `${name}.md` || p.split("/").pop()!.replace(/\.md$/i, "").toLowerCase() === name.split("/").pop()) ?? null;
}

export function readPerson(path: string): Person {
  const { props } = parseFrontmatter(contents[path] ?? "");
  const one = (k: string) => (Array.isArray(props[k]) ? (props[k] as string[]).join(", ") : (props[k] as string | undefined))?.trim() || undefined;
  const fields: Partial<Record<PersonField, string>> = {};
  for (const f of PERSON_FIELDS) { const v = one(f); if (v) fields[f] = v; }
  return {
    path,
    name: path.split("/").pop()!.replace(/\.md$/i, ""),
    photo: one("photo") ? linkTarget(one("photo")!) : undefined,
    fields,
    related: asList(props.related).map((x) => personPathOf(x)).filter((x): x is string => !!x),
    places: asList(props.places).map(linkTarget),
    tags: asList(props.tags).filter((x) => x !== "person"),
    traits: asList(props.traits),
  };
}

/** Change frontmatter fields of a person note ("" or [] removes one). */
export function personFrontmatter(text: string, patch: Record<string, string | string[]>): string {
  const { props, body } = parseFrontmatter(text);
  const next = { ...props };
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" || (Array.isArray(v) && !v.length)) delete next[k];
    else next[k] = v;
  }
  return buildFrontmatter(next, body.startsWith("\n") ? body : `\n${body}`);
}

export const linkTo = (path: string) => `"[[${path.replace(/\.md$/i, "")}]]"`;

/** Create a person note with an empty profile; returns its path. */
export async function createPerson(name: string, open = true): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const body = `---\ntype: person\nrelation: \nphone: \nemail: \ntags: [person]\n---\n\n# ${clean}\n\n## About\n\n## Notes\n`;
  return createNote(clean, peopleFolder(), body, open);
}

export const allPersonNames = () => peoplePaths().map((p) => p.split("/").pop()!.replace(/\.md$/i, ""));
