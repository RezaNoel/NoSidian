// Connects the built-in voice to the app: speaks focus changes and
// announcements while accessibility mode is on, and adds shortcuts to read
// the open note (Ctrl+Shift+Space) and stop speaking (Escape).
import { createEffect, createRoot, onCleanup } from "solid-js";
import { format, locale, t } from "../i18n";
import { languageInfo } from "../i18n/languages";
import { settings } from "../state/settings";
import { onAnnounce } from "./announcer";
import { describe, markdownToSpeech, speak, speechSupported, stopSpeaking, type Description } from "./speech";

let noteText: () => string | null = () => null;
/** The workspace tells the voice how to get the open note's text. */
export function setNoteSource(fn: () => string | null): void {
  noteText = fn;
}

const warned = new Set<string>();
function say(text: string, interrupt: boolean) {
  const lang = locale();
  const ok = speak(text, { lang, rate: settings.accessibility.speechRate || 1, interrupt });
  if (!ok && !warned.has(lang)) {
    warned.add(lang);
    // Tell the user once, in English if that voice exists, so it is heard.
    const msg = format(lang, "speech-no-voice", { language: languageInfo(lang).name });
    if (!speak(format("en", "speech-no-voice", { language: languageInfo(lang).name }), { lang: "en", rate: 1 })) console.warn(msg);
    window.dispatchEvent(new CustomEvent("nosidian:toast", { detail: msg }));
  }
}

export function phrase(d: Description): string {
  const parts = [d.name];
  if (d.value && d.value !== d.name) parts.push(d.value);
  if (d.role) parts.push(t(`role-${d.role}`));
  for (const s of d.states) parts.push(t(`state-${s}`));
  return parts.filter(Boolean).join(", ");
}

export function readOpenNote(): void {
  const src = noteText();
  if (src) say(markdownToSpeech(src), true);
}

export function initVoice(): void {
  if (!speechSupported()) return;
  createRoot(() => {
    createEffect(() => {
      if (!settings.accessibility.screenReaderMode) {
        stopSpeaking();
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onFocus = (e: FocusEvent) => {
        const el = e.target as HTMLElement | null;
        if (!el || el === document.body) return;
        clearTimeout(timer);
        timer = setTimeout(() => say(phrase(describe(el)), true), 60);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") stopSpeaking();
        else if (e.code === "Space" && e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          readOpenNote();
        }
      };
      document.addEventListener("focusin", onFocus);
      document.addEventListener("keydown", onKey, true);
      onAnnounce((msg) => say(msg, false));
      onCleanup(() => {
        clearTimeout(timer);
        document.removeEventListener("focusin", onFocus);
        document.removeEventListener("keydown", onKey, true);
        onAnnounce(null);
        stopSpeaking();
      });
    });
  });
}
