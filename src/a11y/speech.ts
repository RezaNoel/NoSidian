// Built-in self-voicing for accessibility mode. Uses the operating system's
// installed voices through the Web Speech API (on Windows: the offline SAPI /
// OneCore voices). Only voices marked localService are used, so nothing is
// ever sent over the network. External screen readers (NVDA, Narrator) keep
// working through the ARIA markup either way.

export interface SpeechOptions {
  lang: string;
  rate: number;
  /** Interrupt whatever is being spoken (focus changes do; announcements queue). */
  interrupt?: boolean;
}

const synth = (): SpeechSynthesis | null =>
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  const s = synth();
  if (!s) return;
  voices = s.getVoices().filter((v) => v.localService);
}
if (synth()) {
  loadVoices();
  synth()!.addEventListener?.("voiceschanged", loadVoices);
}

/** Best offline voice for a language code like "fa", "pt-BR" or "zh". */
export function voiceFor(lang: string, list: Pick<SpeechSynthesisVoice, "lang" | "localService" | "default" | "name">[] = voices): (typeof list)[number] | null {
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  const local = list.filter((v) => v.localService);
  const norm = (v: { lang: string }) => v.lang.toLowerCase().replace("_", "-");
  return (
    local.find((v) => norm(v) === want) ??
    local.find((v) => norm(v).split("-")[0] === base && v.default) ??
    local.find((v) => norm(v).split("-")[0] === base) ??
    null
  );
}

export const speechSupported = (): boolean => synth() !== null;

/** Speak `text`. Returns false when no offline voice exists for the language. */
export function speak(text: string, opts: SpeechOptions): boolean {
  const s = synth();
  const clean = text.replace(/\s+/g, " ").trim();
  if (!s || !clean) return true;
  const voice = voiceFor(opts.lang) as SpeechSynthesisVoice | null;
  if (!voice) return false;
  if (opts.interrupt !== false) s.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = opts.rate;
  s.speak(u);
  return true;
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

// ---------- Describing focused elements ----------

export type RoleKey =
  | "button" | "tab" | "checkbox" | "switch" | "radio" | "treeitem" | "link"
  | "textbox" | "slider" | "menuitem" | "dialog";
export type StateKey = "checked" | "unchecked" | "expanded" | "collapsed" | "selected" | "pressed";

export interface Description { name: string; role: RoleKey | null; states: StateKey[]; value?: string }

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function roleOf(el: HTMLElement): RoleKey | null {
  const r = el.getAttribute("role");
  const map: Record<string, RoleKey> = {
    button: "button", tab: "tab", checkbox: "checkbox", switch: "switch", radio: "radio",
    treeitem: "treeitem", link: "link", textbox: "textbox", slider: "slider", menuitem: "menuitem",
    dialog: "dialog", separator: "slider", option: "radio",
  };
  if (r && map[r]) return map[r];
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "SUMMARY") return "button";
  if (tag === "A" && el.hasAttribute("href")) return "link";
  if (tag === "TEXTAREA" || el.isContentEditable) return "textbox";
  if (tag === "SELECT") return "button";
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    if (["button", "submit", "reset", "file"].includes(type)) return "button";
    return "textbox";
  }
  return null;
}

/** Accessible name, following the common cases of the ARIA name computation. */
export function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute("aria-label");
  if (label) return label.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const s = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ").trim();
    if (s) return s;
  }
  if (el.id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) return textOf(forLabel);
  }
  const wrapping = el.closest("label");
  if (wrapping && wrapping !== el) return textOf(wrapping);
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    return (el as HTMLInputElement).placeholder || el.title || "";
  }
  return (textOf(el) || el.title || "").slice(0, 160);
}

export function describe(el: HTMLElement): Description {
  const role = roleOf(el);
  const states: StateKey[] = [];
  const aria = (n: string) => el.getAttribute(n);
  const checked = aria("aria-checked") ?? (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? String(el.checked) : null);
  if (checked !== null && (role === "checkbox" || role === "switch" || role === "radio")) states.push(checked === "true" ? "checked" : "unchecked");
  if (aria("aria-expanded") !== null) states.push(aria("aria-expanded") === "true" ? "expanded" : "collapsed");
  if (aria("aria-selected") === "true" && role !== "tab") states.push("selected");
  if (aria("aria-pressed") === "true") states.push("pressed");
  let value: string | undefined;
  if (role === "slider") value = aria("aria-valuenow") ?? (el as HTMLInputElement).value;
  else if (el instanceof HTMLInputElement && role === "textbox") value = el.value || undefined;
  else if (el instanceof HTMLSelectElement) value = el.selectedOptions[0]?.textContent ?? undefined;
  return { name: accessibleName(el), role, states, value };
}

/** Strip Markdown syntax so notes read naturally. */
export function markdownToSpeech(src: string): string {
  return src
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_~=`]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}
