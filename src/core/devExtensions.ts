import type { CustomScriptPlugin, DeveloperCustomConfig } from './types';

export interface CssThemePreset {
  id: string;
  name: string;
  description: string;
  css: string;
}

export const DEVELOPER_CSS_PRESETS: CssThemePreset[] = [
  {
    id: 'warm-editorial',
    name: 'Warm Editorial Serif',
    description: 'Generous editorial headings and subtle gilded accent highlights.',
    css: `/* Warm Editorial Serif Override */
.markdown-body h1 {
  letter-spacing: -0.02em;
  border-bottom: 1px solid var(--accent-border);
  padding-bottom: 0.35rem;
}
.markdown-body blockquote {
  border-inline-start-width: 3px;
  border-inline-start-color: var(--accent);
  font-style: italic;
}`
  },
  {
    id: 'cyber-grid',
    name: 'Cyber Terminal Frame',
    description: 'Crisp high-contrast monospace badges and sharp technical code blocks.',
    css: `/* Cyber Terminal Override */
.markdown-body pre,
.markdown-body code {
  border: 1px solid var(--accent-border);
}
[data-testid="left-sidebar"],
[data-testid="right-sidebar"] {
  border-color: var(--accent-border) !important;
}`
  },
  {
    id: 'ultra-clean-focus',
    name: 'Zero-Chrome Zen',
    description: 'Extra soft surface contrast for deep distraction-free reading.',
    css: `/* Zero-Chrome Zen Override */
.markdown-body {
  line-height: 1.9;
}
.markdown-body p {
  opacity: 0.94;
}`
  }
];

export const DEFAULT_CUSTOM_JS_PLUGINS: CustomScriptPlugin[] = [
  {
    id: 'plugin-timestamp-banner',
    name: 'Insert Quick Timestamp Section',
    description: 'Appends a dated check-in heading to the active note and shows a toast.',
    enabled: true,
    runOnStartup: false,
    code: `const active = nosidian.getActiveNote();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
if (!active) {
  nosidian.showToast('Open a note first — active vault has ' + nosidian.getNotesCount() + ' notes');
} else {
  nosidian.updateActiveNote(active.content.trimEnd() + '\\n\\n### Log — ' + stamp + '\\n- ');
  nosidian.showToast('Added timestamp log to ' + active.path);
}`
  },
  {
    id: 'plugin-vault-audit',
    name: 'Vault Word & Tag Audit',
    description: 'Logs summary telemetry of the active vault to the Developer console.',
    enabled: true,
    runOnStartup: false,
    code: `const notes = nosidian.listNotes();
const totalWords = notes.reduce((acc, n) => acc + n.content.split(/\\s+/).filter(Boolean).length, 0);
console.log('Vault:', nosidian.getVaultName());
console.log('Notes:', notes.length, '| Total words:', totalWords);
nosidian.showToast('Audit: ' + notes.length + ' notes, ' + totalWords + ' words');`
  }
];

export function createDefaultDeveloperConfig(): DeveloperCustomConfig {
  return {
    customCssEnabled: false,
    customCss: DEVELOPER_CSS_PRESETS[0].css,
    scripts: DEFAULT_CUSTOM_JS_PLUGINS.map(s => ({ ...s }))
  };
}

export function normalizeDeveloperConfig(
  raw?: Partial<DeveloperCustomConfig> | null
): DeveloperCustomConfig {
  if (!raw) return createDefaultDeveloperConfig();
  return {
    customCssEnabled: Boolean(raw.customCssEnabled),
    customCss: typeof raw.customCss === 'string' ? raw.customCss : DEVELOPER_CSS_PRESETS[0].css,
    scripts: Array.isArray(raw.scripts) ? raw.scripts : createDefaultDeveloperConfig().scripts
  };
}

export interface NosidianPluginApi {
  getVaultName: () => string;
  getNotesCount: () => number;
  listNotes: () => Array<{ path: string; content: string; starred: boolean; updatedAt: number }>;
  getActiveNote: () => { path: string; content: string; starred: boolean } | null;
  openNote: (path: string) => void;
  createNote: (path: string, content: string) => void;
  updateActiveNote: (content: string) => void;
  showToast: (msg: string) => void;
  setCssVar: (varName: string, value: string) => void;
}

export interface PluginExecutionResult {
  ok: boolean;
  logs: string[];
  error?: string;
  ranAt: number;
}

function formatLogArg(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean' || val === null || val === undefined) {
    return String(val);
  }
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function executeUserPluginScript(
  code: string,
  api: NosidianPluginApi,
  now = Date.now()
): PluginExecutionResult {
  const logs: string[] = [];
  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatLogArg).join(' ')),
    info: (...args: unknown[]) => logs.push(`[info] ${args.map(formatLogArg).join(' ')}`),
    warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(formatLogArg).join(' ')}`),
    error: (...args: unknown[]) => logs.push(`[error] ${args.map(formatLogArg).join(' ')}`)
  };

  try {
    const fn = new Function('nosidian', 'console', `"use strict";\n${code}`);
    const ret = fn(api, sandboxConsole);
    if (ret !== undefined) {
      logs.push(`=> ${formatLogArg(ret)}`);
    }
    return { ok: true, logs, ranAt: now };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(`[Error] ${message}`);
    return { ok: false, logs, error: message, ranAt: now };
  }
}
