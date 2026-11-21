import { noteBaseName } from './markdown';
import type {
  ExplorerDisplayPrefs,
  ExplorerSortOrder,
  FileIconId,
  FolderTagItem,
  ItemCustomization,
  LeftBannerConfig,
  Note,
  ObsidianSettings
} from './types';

export const DEFAULT_LEFT_BANNER: LeftBannerConfig = {
  enabled: false,
  imageSrc: '',
  height: 96,
  fit: 'cover',
  posY: 50,
  opacity: 90
};

export const DEFAULT_EXPLORER_DISPLAY_PREFS: ExplorerDisplayPrefs = {
  showLastOpened: true,
  showUpdatedAt: false,
  showWordCount: false,
  showBacklinksCount: false,
  showTags: false
};

export const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  defaultViewMode: 'split',
  readableLineLength: true,
  strictLineBreaks: false,
  showLineNumbers: false,
  foldHeadings: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  smartIndentLists: true,
  tabSize: 2,
  spellcheck: false,
  scrollSync: true,
  defaultNewNoteFolder: '',
  confirmDelete: false,
  autoUpdateInternalLinks: true,
  useWikilinks: true,
  showPropertiesInReading: true,
  dailyNotesFolder: 'Daily Notes',
  dailyNoteDateFormat: 'YYYY-MM-DD',
  dailyNoteTemplatePath: '',
  openDailyNoteOnStartup: false,
  startupScreen: 'last-note',
  projectModeEnabled: false,
  petEnabled: true,
  ambientEffectsEnabled: true,
  dashboardEnabled: true,
  recentFilesEnabled: true,
  calendarEnabled: true,
  mediaLibraryEnabled: true,
  terminalEnabled: true,
  hotkeys: {
    quickSwitcher: 'Ctrl+O',
    commandPalette: 'Ctrl+K',
    searchVault: 'Ctrl+Shift+F',
    newNote: 'Ctrl+N',
    newFolder: 'Ctrl+Shift+N',
    dailyNote: 'Alt+D',
    toggleLeft: 'Ctrl+\\',
    toggleRight: 'Ctrl+Shift+\\',
    toggleGraph: 'Ctrl+G',
    flashcards: 'Alt+F',
    toggleZen: 'Alt+Z',
    openDashboard: 'Alt+H',
    openAppearance: 'Alt+T',
    openSettings: 'Ctrl+,',
    saveSnapshot: 'Ctrl+Shift+S',
    toggleViewMode: 'Ctrl+E',
    layoutManager: 'Alt+L'
  },
  customHotkeys: []
};

export const FOLDER_TAG_PRESETS: FolderTagItem[] = [
  { id: 'tag-active', label: 'Active', color: '#2563eb' },
  { id: 'tag-study', label: 'Study', color: '#7c3aed' },
  { id: 'tag-urgent', label: 'Priority', color: '#e11d48' },
  { id: 'tag-research', label: 'Research', color: '#0ea5e9' },
  { id: 'tag-draft', label: 'Drafts', color: '#f59e0b' },
  { id: 'tag-archive', label: 'Done', color: '#10b981' },
  { id: 'tag-ref', label: 'Ref', color: '#64748b' }
];

export const ITEM_COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Default', value: '' },
  { label: 'Carbon Blue', value: '#2563eb' },
  { label: 'Sky Cyan', value: '#0ea5e9' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Slate', value: '#94a3b8' }
];

export const FILE_ICON_CHOICES: Array<{ id: FileIconId; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'file', label: 'Note' },
  { id: 'folder', label: 'Folder' },
  { id: 'book', label: 'Book' },
  { id: 'code', label: 'Code' },
  { id: 'graduation', label: 'Study' },
  { id: 'star', label: 'Star' },
  { id: 'flame', label: 'Flame' },
  { id: 'heart', label: 'Heart' },
  { id: 'briefcase', label: 'Work' },
  { id: 'music', label: 'Audio' },
  { id: 'image', label: 'Media' },
  { id: 'globe', label: 'World' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'sparkles', label: 'Idea' },
  { id: 'layers', label: 'Deck' },
  { id: 'target', label: 'Goal' }
];

export function migrateCustomizationPath(
  map: Record<string, ItemCustomization>,
  oldPath: string,
  newPath: string
): Record<string, ItemCustomization> {
  if (!map[oldPath]) return map;
  const next = { ...map };
  next[newPath] = next[oldPath];
  delete next[oldPath];
  return next;
}

export function formatRelativeTimestamp(ts: number | undefined, now = Date.now()): string {
  if (!ts) return 'Never';
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

export function buildDailyNotePath(
  dateStr: string,
  folder: string,
  format: ObsidianSettings['dailyNoteDateFormat']
): string {
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, '');
  const [yyyy, mm] = dateStr.split('-');
  const filePart = format === 'YYYY/MM/YYYY-MM-DD' && yyyy && mm ? `${yyyy}/${mm}/${dateStr}` : dateStr;
  return cleanFolder ? `${cleanFolder}/${filePart}.md` : `${filePart}.md`;
}

export function expandDailyNoteTemplate(
  templateContent: string | undefined,
  dateStr: string
): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const parsedDate = new Date(`${dateStr}T12:00:00`);
  const dayName = Number.isNaN(parsedDate.getTime()) ? '' : dayNames[parsedDate.getDay()];

  if (templateContent && templateContent.trim()) {
    return templateContent
      .replace(/\{\{date\}\}/gi, dateStr)
      .replace(/\{\{title\}\}/gi, dateStr)
      .replace(/\{\{day\}\}/gi, dayName);
  }

  return `---
tags: [daily]
date: ${dateStr}
---
# Daily Note — ${dateStr}${dayName ? ` (${dayName})` : ''}

## Priorities
- [ ] 

## Notes & Reflections

`;
}

export function sortRecentNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const tA = a.lastOpenedAt || a.updatedAt || 0;
    const tB = b.lastOpenedAt || b.updatedAt || 0;
    return tB - tA;
  });
}

export function sortExplorerNotes(notes: Note[], sortOrder: ExplorerSortOrder): Note[] {
  return [...notes].sort((a, b) => {
    if (sortOrder === 'name-desc') {
      return noteBaseName(b.path).localeCompare(noteBaseName(a.path));
    }
    if (sortOrder === 'mtime-desc') {
      return (b.updatedAt || 0) - (a.updatedAt || 0) || a.path.localeCompare(b.path);
    }
    if (sortOrder === 'mtime-asc') {
      return (a.updatedAt || 0) - (b.updatedAt || 0) || a.path.localeCompare(b.path);
    }
    if (sortOrder === 'ctime-desc') {
      return (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0) || a.path.localeCompare(b.path);
    }
    if (sortOrder === 'ctime-asc') {
      return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0) || a.path.localeCompare(b.path);
    }
    return noteBaseName(a.path).localeCompare(noteBaseName(b.path));
  });
}

export function sortFolderNames(folderNames: string[], sortOrder: ExplorerSortOrder): string[] {
  const sorted = [...folderNames].sort((a, b) => a.localeCompare(b));
  return sortOrder === 'name-desc' ? sorted.reverse() : sorted;
}

export function getAncestorFolders(notePath: string): string[] {
  const parts = notePath.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  const ancestors: string[] = [];
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    ancestors.push(acc);
  }
  return ancestors;
}

export function collectAllFolderPaths(folders: string[], notes: Note[]): string[] {
  const set = new Set<string>();
  const addChain = (rawFolder: string) => {
    const segs = rawFolder.split('/').filter(Boolean);
    let acc = '';
    for (const seg of segs) {
      acc = acc ? `${acc}/${seg}` : seg;
      set.add(acc);
    }
  };
  folders.forEach(addChain);
  notes.forEach(n => {
    getAncestorFolders(n.path).forEach(f => set.add(f));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
