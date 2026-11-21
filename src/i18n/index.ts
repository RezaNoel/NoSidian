import { FluentBundle, FluentResource } from "@fluent/bundle";
import { createMemo, createRoot, createSignal } from "solid-js";
import type { MessageArgs, MessageKey } from "./keys.gen";
import { languageInfo, type LanguageCode } from "./languages";

export type { MessageKey } from "./keys.gen";

const sources = import.meta.glob("../../locales/*.ftl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function sourceFor(code: string): string | undefined {
  return sources[`../../locales/${code}.ftl`];
}

const bundleCache = new Map<string, FluentBundle>();

export function getBundle(code: string): FluentBundle {
  let bundle = bundleCache.get(code);
  if (!bundle) {
    // useIsolating wraps arguments in Unicode bidi isolates so Latin names
    // inside Persian/Arabic sentences (and vice versa) render in order.
    bundle = new FluentBundle(code, { useIsolating: true });
    const src = sourceFor(code) ?? sourceFor("en") ?? "";
    const errors = bundle.addResource(new FluentResource(src));
    if (errors.length) console.error(`[i18n] ${code}:`, errors);
    bundleCache.set(code, bundle);
  }
  return bundle;
}

type ArgsFor<K extends MessageKey> = K extends MessageKey
  ? MessageArgs[K] extends undefined ? [] : [MessageArgs[K]]
  : never;

/** Format a message from a specific bundle. Falls back to English, then the key. */
export function format<K extends MessageKey>(code: string, key: K, ...args: ArgsFor<K>): string {
  for (const bundle of [getBundle(code), getBundle("en")]) {
    const msg = bundle.getMessage(key);
    if (msg?.value) {
      const errors: Error[] = [];
      const out = bundle.formatPattern(msg.value, (args[0] ?? null) as never, errors);
      if (errors.length) console.warn(`[i18n] ${code}/${key}:`, errors);
      return out;
    }
  }
  console.warn(`[i18n] missing key ${key}`);
  return key;
}

const i18n = createRoot(() => {
  const [locale, setLocaleSignal] = createSignal<LanguageCode>("en");
  const dir = createMemo(() => languageInfo(locale()).dir);
  return { locale, setLocaleSignal, dir };
});

export const locale = i18n.locale;
export const dir = i18n.dir;

/** Reactive translate: re-runs wherever it is used when the language changes. */
export function t<K extends MessageKey>(key: K, ...args: ArgsFor<K>): string {
  return format(i18n.locale(), key, ...args);
}

/** Switch language and update <html lang dir> so the whole UI flips direction. */
export function setLocale(code: LanguageCode): void {
  i18n.setLocaleSignal(code);
  const info = languageInfo(code);
  if (typeof document !== "undefined") {
    document.documentElement.lang = info.code;
    document.documentElement.dir = info.dir;
  }
}
