// Custom colour and icon for files and folders in the explorer. Stored per
// vault in the workspace profile (fileStyles), keyed by path.
import { For, Show, createRoot, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  Archive, Book, BookOpen, Brain, Briefcase, Calendar, Camera, Code2, Coffee, Dumbbell, FileText, FlaskConical, Folder, Globe,
  GraduationCap, Heart, Image, Inbox, Leaf, Lightbulb, Music, Palette, Plane, Rocket, Star, Target, Wallet, X,
} from "lucide-solid";
import { t } from "../i18n";
import { profile, updateProfile } from "../state/workspace";
import { Modal } from "./Modal";

export const ENTRY_ICONS: Record<string, typeof Folder> = {
  folder: Folder, file: FileText, book: Book, "book-open": BookOpen, briefcase: Briefcase, school: GraduationCap, science: FlaskConical,
  code: Code2, music: Music, image: Image, heart: Heart, star: Star, idea: Lightbulb, target: Target, calendar: Calendar,
  archive: Archive, inbox: Inbox, globe: Globe, camera: Camera, coffee: Coffee, sport: Dumbbell, money: Wallet, travel: Plane,
  nature: Leaf, brain: Brain, rocket: Rocket, art: Palette,
};

export const ENTRY_COLORS = ["#e5484d", "#f76b15", "#e9a23b", "#3fa877", "#12a594", "#3b7ddd", "#5b5bd6", "#8e4ec6", "#d6409f", "#8d8d8d"];

export const entryStyle = (path: string) => profile.fileStyles?.[path];

function setStyle(path: string, patch: { icon?: string | null; color?: string | null }) {
  updateProfile((p) => {
    p.fileStyles ??= {};
    const cur = { ...(p.fileStyles[path] ?? {}) };
    if (patch.icon !== undefined) { if (patch.icon) cur.icon = patch.icon; else delete cur.icon; }
    if (patch.color !== undefined) { if (patch.color) cur.color = patch.color; else delete cur.color; }
    if (!cur.icon && !cur.color && !cur.tags?.length) delete p.fileStyles[path];
    else p.fileStyles[path] = cur;
  });
}

const dlg = createRoot(() => createSignal<string | null>(null));
export const openEntryStyle = (path: string) => dlg[1](path);

export function EntryStyleDialog() {
  return (
    <Show when={dlg[0]()}>
      {(path) => {
        const cur = () => entryStyle(path()) ?? {};
        return (
          <Modal title={t("entry-style-title")} onClose={() => dlg[1](null)}>
            <div class="entry-style">
              <h3 class="section-title">{t("entry-style-color")}</h3>
              <div class="entry-colors" role="radiogroup" aria-label={t("entry-style-color")}>
                <button role="radio" class="entry-color none" aria-checked={!cur().color} title={t("entry-style-default")} aria-label={t("entry-style-default")} onClick={() => setStyle(path(), { color: null })}><X /></button>
                <For each={ENTRY_COLORS}>
                  {(c) => <button role="radio" class="entry-color" aria-checked={cur().color === c} aria-label={c} title={c} style={{ background: c }} onClick={() => setStyle(path(), { color: c })} />}
                </For>
              </div>
              <h3 class="section-title">{t("entry-style-icon")}</h3>
              <div class="entry-icons" role="radiogroup" aria-label={t("entry-style-icon")}>
                <button role="radio" class="entry-icon" aria-checked={!cur().icon} title={t("entry-style-default")} aria-label={t("entry-style-default")} onClick={() => setStyle(path(), { icon: null })}><X /></button>
                <For each={Object.entries(ENTRY_ICONS)}>
                  {([id, I]) => (
                    <button role="radio" class="entry-icon" aria-checked={cur().icon === id} aria-label={id} title={id} style={{ color: cur().color }} onClick={() => setStyle(path(), { icon: id })}>
                      <Dynamic component={I} />
                    </button>
                  )}
                </For>
              </div>
              <div class="dialog-actions">
                <button class="btn" onClick={() => setStyle(path(), { icon: null, color: null })}>{t("entry-style-reset")}</button>
                <button class="btn primary" onClick={() => dlg[1](null)}>{t("action-close")}</button>
              </div>
            </div>
          </Modal>
        );
      }}
    </Show>
  );
}
