import type { CustomFontDef } from './types';

export type FontCategory = 'sans' | 'serif' | 'mono' | 'multilingual';

export interface GoogleFontEntry {
  family: string;
  category: FontCategory;
  weights: string;
  sample: string;
}

export const GOOGLE_FONTS_CATALOG: GoogleFontEntry[] = [
  { family: 'Plus Jakarta Sans', category: 'sans', weights: '400;500;600;700', sample: 'Modern geometric UI' },
  { family: 'Inter', category: 'sans', weights: '400;500;600;700', sample: 'Crisp technical clarity' },
  { family: 'Manrope', category: 'sans', weights: '400;500;600;700', sample: 'Clean balanced proportions' },
  { family: 'Poppins', category: 'sans', weights: '400;500;600;700', sample: 'Friendly rounded geometry' },
  { family: 'Outfit', category: 'sans', weights: '400;500;600;700', sample: 'Contemporary display sans' },
  { family: 'Space Grotesk', category: 'sans', weights: '400;500;600;700', sample: 'Distinctive tech character' },
  { family: 'Rubik', category: 'sans', weights: '400;500;600;700', sample: 'Soft warm grotesque' },
  { family: 'DM Sans', category: 'sans', weights: '400;500;600;700', sample: 'Low-contrast legibility' },
  { family: 'Nunito', category: 'sans', weights: '400;500;600;700', sample: 'Soft editorial UI' },
  { family: 'Roboto', category: 'sans', weights: '400;500;700', sample: 'Neutral mechanical grotesk' },
  { family: 'Open Sans', category: 'sans', weights: '400;500;600;700', sample: 'Humanist universal sans' },
  { family: 'Lato', category: 'sans', weights: '400;700', sample: 'Warm semi-rounded sans' },
  { family: 'Source Sans 3', category: 'sans', weights: '400;500;600;700', sample: 'Long-form UI readability' },
  { family: 'Lora', category: 'serif', weights: '400;500;600;700', sample: 'Brushed literary serif' },
  { family: 'Merriweather', category: 'serif', weights: '400;700', sample: 'Screen-optimized editorial' },
  { family: 'Playfair Display', category: 'serif', weights: '400;600;700', sample: 'High-contrast magazine serif' },
  { family: 'Newsreader', category: 'serif', weights: '400;500;600;700', sample: 'Classical book typography' },
  { family: 'Crimson Pro', category: 'serif', weights: '400;500;600;700', sample: 'Academic paper serif' },
  { family: 'JetBrains Mono', category: 'mono', weights: '400;500;600;700', sample: 'Developer monospace' },
  { family: 'Fira Code', category: 'mono', weights: '400;500;600;700', sample: 'Ligature programming font' },
  { family: 'IBM Plex Mono', category: 'mono', weights: '400;500;600;700', sample: 'Engineered mono UI' },
  { family: 'Space Mono', category: 'mono', weights: '400;700', sample: 'Retro terminal style' },
  { family: 'Vazirmatn', category: 'multilingual', weights: '400;500;600;700', sample: 'فونت فارسی و عربی مدرن' },
  { family: 'Noto Sans Arabic', category: 'multilingual', weights: '400;500;600;700', sample: 'الخط العربي الواضح' },
  { family: 'Cairo', category: 'multilingual', weights: '400;500;600;700', sample: 'خط عربي عصري' },
  { family: 'Tajawal', category: 'multilingual', weights: '400;500;700', sample: 'تصميم أنيق للنصوص' },
  { family: 'Noto Sans JP', category: 'multilingual', weights: '400;500;700', sample: '日本語の美しい書体' },
  { family: 'Noto Sans KR', category: 'multilingual', weights: '400;500;700', sample: '깔끔한 한국어 글꼴' },
  { family: 'Noto Sans SC', category: 'multilingual', weights: '400;500;700', sample: '清晰优雅的简体中文字体' },
  { family: 'Noto Sans Devanagari', category: 'multilingual', weights: '400;500;700', sample: 'सुंदर देवनागरी फ़ॉन्ट' }
];

export interface FontOption {
  value: string;
  family: string;
  category: FontCategory | 'system';
  sample: string;
  source: 'bundled' | 'system';
}

/** Stored font values: "google:<family>" (bundled), "sys:<family>" (this computer), "custom:<id>". */
export function normalizeFontValue(v: string): string {
  if (!v || v === 'jakarta') return 'google:Plus Jakarta Sans';
  if (v === 'manrope') return 'google:Manrope';
  if (v === 'vazirmatn') return 'google:Vazirmatn';
  return v;
}

export function fontFamilyOf(v: string): string {
  const n = normalizeFontValue(v);
  const i = n.indexOf(':');
  return i > 0 && /^(google|sys|custom)$/.test(n.slice(0, i)) ? n.slice(i + 1).trim() : n;
}

export function bundledFontOptions(): FontOption[] {
  return GOOGLE_FONTS_CATALOG.map((f) => ({ value: `google:${f.family}`, family: f.family, category: f.category, sample: f.sample, source: 'bundled' as const }));
}

export const SYSTEM_FONTS_FALLBACK: string[] = [
  'Arial',
  'Helvetica Neue',
  'Segoe UI',
  'SF Pro Text',
  'Tahoma',
  'Verdana',
  'Georgia',
  'Times New Roman',
  'Trebuchet MS',
  'Consolas',
  'Courier New',
  'Vazir',
  'IRANSans',
  'DejaVu Sans',
  'Liberation Sans'
];

interface LocalFontData {
  family: string;
}

export async function querySystemFonts(): Promise<{ families: string[]; usedLocalApi: boolean }> {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> };
    if (typeof win.queryLocalFonts === 'function') {
      try {
        const list = await win.queryLocalFonts();
        const set = new Set<string>();
        for (const item of list) {
          if (item && typeof item.family === 'string' && item.family.trim()) {
            set.add(item.family.trim());
          }
        }
        if (set.size > 0) {
          return {
            families: Array.from(set).sort((a, b) => a.localeCompare(b)),
            usedLocalApi: true
          };
        }
      } catch {
        // Permission denied or unsupported inside sandboxed iframe -> fall back gracefully
      }
    }
  }
  return { families: [...SYSTEM_FONTS_FALLBACK], usedLocalApi: false };
}

export function buildGoogleFontHref(family: string, weights = '400;500;600;700'): string {
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weights}&display=swap`;
}

export function loadGoogleFont(family: string): void {
  if (typeof document === 'undefined' || !family.trim()) return;
  const clean = family.trim();
  // Fonts in the catalog ship with the app (public/fonts/fonts.css), so no download is needed.
  if (GOOGLE_FONTS_CATALOG.some(f => f.family.toLowerCase() === clean.toLowerCase())) return;
  const id = `nosidian-gf-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(id)) return;
  const meta = GOOGLE_FONTS_CATALOG.find(f => f.family.toLowerCase() === clean.toLowerCase());
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = buildGoogleFontHref(clean, meta?.weights || '400;500;600;700');
  link.setAttribute('data-nosidian-gfont', clean);
  document.head.appendChild(link);
}

export function injectCustomFontsCss(customFonts: CustomFontDef[] = []): void {
  if (typeof document === 'undefined') return;
  const styleId = 'nosidian-custom-fonts-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  const rules: string[] = [];
  for (const font of customFonts) {
    if (!font.cssUrl || !font.family.trim()) continue;
    const url = font.cssUrl.trim();
    if (/\.woff2?(\?|$)|\.ttf(\?|$)|\.otf(\?|$)/i.test(url)) {
      const safeFam = font.family.replace(/["\\]/g, '');
      rules.push(`@font-face { font-family: "${safeFam}"; src: url("${url}"); font-display: swap; }`);
    } else if (/^https?:\/\//i.test(url)) {
      const linkId = `nosidian-cf-${font.id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
      }
    }
  }
  styleEl.textContent = rules.join('\n');
}

export function resolveUiFontStack(uiFont: string, customFonts: CustomFontDef[] = []): string {
  const quote = (fam: string) => `'${fam.replace(/['\\]/g, '')}'`;
  const fallbackSans = `'Vazirmatn', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

  if (!uiFont || uiFont === 'jakarta') {
    return `'Plus Jakarta Sans', ${fallbackSans}`;
  }
  if (uiFont === 'manrope') {
    return `'Manrope', ${fallbackSans}`;
  }
  if (uiFont === 'vazirmatn') {
    return `'Vazirmatn', 'Plus Jakarta Sans', system-ui, sans-serif`;
  }
  if (uiFont === 'system') {
    return `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Vazirmatn', sans-serif`;
  }
  if (uiFont.startsWith('google:')) {
    const fam = uiFont.slice('google:'.length).trim();
    return fam ? `${quote(fam)}, ${fallbackSans}` : fallbackSans;
  }
  if (uiFont.startsWith('sys:')) {
    const fam = uiFont.slice('sys:'.length).trim();
    return fam ? `${quote(fam)}, ${fallbackSans}` : fallbackSans;
  }
  if (uiFont.startsWith('custom:')) {
    const id = uiFont.slice('custom:'.length).trim();
    const found = customFonts.find(f => f.id === id);
    if (found) {
      return `${quote(found.family)}, ${fallbackSans}`;
    }
    return id ? `${quote(id)}, ${fallbackSans}` : fallbackSans;
  }
  return `${quote(uiFont)}, ${fallbackSans}`;
}

export function syncAppearanceFont(uiFont: string, customFonts: CustomFontDef[] = []): string {
  injectCustomFontsCss(customFonts);
  if (uiFont === 'jakarta') loadGoogleFont('Plus Jakarta Sans');
  else if (uiFont === 'manrope') loadGoogleFont('Manrope');
  else if (uiFont === 'vazirmatn') loadGoogleFont('Vazirmatn');
  else if (uiFont.startsWith('google:')) {
    loadGoogleFont(uiFont.slice('google:'.length).trim());
  }
  return resolveUiFontStack(uiFont, customFonts);
}
