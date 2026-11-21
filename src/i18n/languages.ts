import list from "../../locales/languages.json";

export type LanguageCode =
  | "en" | "fa" | "ar" | "fr" | "de" | "es" | "pt-BR"
  | "zh" | "ja" | "ko" | "ru" | "tr" | "it" | "hi";

export interface LanguageInfo {
  code: LanguageCode;
  /** Endonym: the language's name in itself, shown in every UI language. */
  name: string;
  dir: "ltr" | "rtl";
}

export const LANGUAGES = list as LanguageInfo[];

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** Best match for the OS/browser language, used to preselect step 1 of onboarding. */
export function detectLanguage(preferred: readonly string[] = navigator.languages ?? []): LanguageCode {
  for (const tag of preferred) {
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.code;
    const base = tag.split("-")[0].toLowerCase();
    if (base === "pt") return "pt-BR";
    const byBase = LANGUAGES.find((l) => l.code.split("-")[0] === base);
    if (byBase) return byBase.code;
  }
  return "en";
}
