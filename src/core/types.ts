export type LangCode =
  | 'en'
  | 'fa'
  | 'ar'
  | 'fr'
  | 'de'
  | 'es'
  | 'pt-BR'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ru'
  | 'tr'
  | 'it'
  | 'hi';

export type ThemeId =
  | 'obsidian-slate'
  | 'midnight-carbon'
  | 'nord-arctic'
  | 'catppuccin-mocha'
  | 'paper-daylight'
  | 'warm-parchment'
  | 'christmas'
  | 'matrix';

export type ViewMode = 'editor' | 'split' | 'preview' | 'mindmap' | 'kanban';
export type MainSurface = 'workspace' | 'dashboard' | 'projects' | 'media';
export type NoteDirection = 'auto' | 'ltr' | 'rtl';
export type LeftTab = 'files' | 'recent' | 'search' | 'tags' | 'starred' | 'calendar';
export type RightTab = 'links' | 'outline' | 'focus' | 'history' | 'srs';
export type WorkspacePresetId = 'focused' | 'writing' | 'review' | 'studio';

export interface WorkspaceUiPrefs {
  showFormattingBar: boolean;
  showPropertiesBlock: boolean;
  showStatusBar: boolean;
  pinStudyNoteBtn: boolean;
  pinDirectionBtn: boolean;
  pinExtraViewModes: boolean;
  pinExportBtn: boolean;
  pinZenBtn: boolean;
  pinGraphBtn: boolean;
  pinMindmapBtn: boolean;
  pinKanbanBtn: boolean;
  pinFlashcardsBtn: boolean;
  pinSlidesBtn: boolean;
  pinDailyNoteBtn: boolean;
  pinCommandPaletteBtn: boolean;
  pinAppearanceBtn: boolean;
  pinAdvancedFormatting: boolean;
}

export interface WorkspacePanelVisibility {
  editor: boolean;
  leftSidebar: boolean;
  rightSidebar: boolean;
  ribbon: boolean;
  statusBar: boolean;
}

export interface FocusProfile {
  id: string;
  name: string;
  builtIn?: boolean;
  layoutPreset: ViewMode;
  rightTab?: RightTab;
  panels: WorkspacePanelVisibility;
  uiPrefs: WorkspaceUiPrefs;
}

export interface CustomFontDef {
  id: string;
  family: string;
  cssUrl?: string;
  source: 'google' | 'system' | 'custom';
}

export interface AppearanceConfig {
  theme: ThemeId;
  accent: string;
  glassBlur: number;
  glassOpacity: number;
  ambientMesh: boolean;
  meshIntensity: number;
  uiFont: string;
  /** Interface text size in px (the base for everything set in em). */
  uiFontSize?: number;
  customFonts?: CustomFontDef[];
  editorFontSize: number;
  editorLineHeight: number;
  editorMaxWidth: number;
  radiusScale: 'sharp' | 'balanced' | 'soft';
  density: 'compact' | 'comfortable';
}

export type FileIconId =
  | 'default'
  | 'file'
  | 'book'
  | 'code'
  | 'graduation'
  | 'star'
  | 'flame'
  | 'heart'
  | 'folder'
  | 'briefcase'
  | 'music'
  | 'image'
  | 'globe'
  | 'terminal'
  | 'sparkles'
  | 'layers'
  | 'target';

export interface FolderTagItem {
  id: string;
  label: string;
  color: string;
}

export interface ItemCustomization {
  icon?: FileIconId;
  color?: string;
  tags?: FolderTagItem[];
}

export type ExplorerSortOrder =
  | 'name-asc'
  | 'name-desc'
  | 'mtime-desc'
  | 'mtime-asc'
  | 'ctime-desc'
  | 'ctime-asc';

export interface LeftBannerConfig {
  enabled: boolean;
  imageSrc: string;
  height: number; // 48..220 px
  fit: 'cover' | 'contain';
  posY: number; // 0..100 %
  opacity: number; // 25..100 %
}

export interface ExplorerDisplayPrefs {
  showLastOpened: boolean;
  showUpdatedAt: boolean;
  showWordCount: boolean;
  showBacklinksCount: boolean;
  showTags: boolean;
}

export type CustomHotkeyActionType =
  | 'open-note'
  | 'view-mode'
  | 'dashboard-hub'
  | 'zen-studio'
  | 'graph'
  | 'flashcards'
  | 'daily-note'
  | 'new-note'
  | 'command-palette';

export interface CustomHotkeyDef {
  id: string;
  label: string;
  shortcut: string;
  actionType: CustomHotkeyActionType;
  target?: string;
}

export interface ObsidianSettings {
  // Editor
  defaultViewMode: ViewMode;
  readableLineLength: boolean;
  strictLineBreaks: boolean;
  showLineNumbers: boolean;
  foldHeadings: boolean;
  autoPairBrackets: boolean;
  autoPairMarkdown: boolean;
  smartIndentLists: boolean;
  tabSize: 2 | 4;
  spellcheck: boolean;
  scrollSync: boolean;
  // Files & Links
  defaultNewNoteFolder: string;
  confirmDelete: boolean;
  autoUpdateInternalLinks: boolean;
  useWikilinks: boolean;
  showPropertiesInReading: boolean;
  // Daily Notes
  dailyNotesFolder: string;
  dailyNoteDateFormat: 'YYYY-MM-DD' | 'YYYY/MM/YYYY-MM-DD';
  dailyNoteTemplatePath: string;
  openDailyNoteOnStartup: boolean;
  // Modules & Features
  startupScreen: 'last-note' | 'empty' | 'dashboard';
  projectModeEnabled: boolean;
  petEnabled: boolean;
  ambientEffectsEnabled: boolean;
  dashboardEnabled: boolean;
  recentFilesEnabled: boolean;
  calendarEnabled: boolean;
  mediaLibraryEnabled?: boolean;
  terminalEnabled?: boolean;
  // Hotkeys custom overrides & user-created shortcuts
  hotkeys: Record<string, string>;
  customHotkeys?: CustomHotkeyDef[];
}

export type GraphGroupBy = 'none' | 'folder' | 'tag' | 'degree' | 'created';
export type GraphColorMode = 'group' | 'heatmap' | 'age' | 'monochrome' | 'custom';
export type GraphNodeShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'triangle';
export type GraphSubLabelMode = 'title' | 'title+tags' | 'title+words' | 'title+date' | 'none';

export interface GraphSettings {
  localOnly: boolean;
  showOrphans: boolean;
  linkMode: boolean;
  groupBy: GraphGroupBy;
  colorMode: GraphColorMode;
  customPalette: string[];
  nodeShape: GraphNodeShape;
  nodeSize: number; // base radius 4..16
  scaleByDegree: boolean;
  repulsion: number; // 200..1800
  linkDistance: number; // 70..320
  edgeWidth: number; // 0.5..6
  edgeOpacity: number; // 0.1..0.9
  subLabelMode: GraphSubLabelMode;
  labelFontSize: number; // 9..16
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'audio';
  mimeType: string;
  size: number;
  createdAt: number;
  dataUrl?: string;
}

export type DashboardTemplateId =
  | 'study'
  | 'writer'
  | 'developer'
  | 'general'
  | 'language'
  | 'research';

export type DashboardWidgetType =
  | 'cover'
  | 'plugin'
  | 'deadline-hero'
  | 'stats'
  | 'recent-notes'
  | 'todos'
  | 'calendar'
  | 'shortcuts'
  | 'scratchpad'
  | 'project-spotlight'
  | 'pet-home'
  | 'flashcard-queue'
  | 'pomodoro-timer'
  | 'starred-notes'
  | 'tag-explorer'
  | 'reading-shelf'
  | 'watchlist'
  | 'writing-goal'
  | 'quick-capture'
  | 'countdown';

export interface DashboardShortcutItem {
  id: string;
  label: string;
  icon: FileIconId;
  color?: string;
  actionType: 'note' | 'folder' | 'daily' | 'flashcards' | 'graph' | 'new-note' | 'projects' | 'media' | 'terminal';
  target?: string;
}

export interface DashboardTodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  span: 1 | 2 | 3;
  coverImage?: string;
  subtitle?: string;
  notePath?: string;
  scratchpadText?: string;
  dailyWordTarget?: number;
  todos?: DashboardTodoItem[];
  shortcuts?: DashboardShortcutItem[];
  /** For a plugin widget: which plugin it runs, and whether it runs when the home opens. */
  pluginId?: string;
  autoRun?: boolean;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  templateId: DashboardTemplateId;
  updatedAt: number;
  widgets: DashboardWidget[];
}

export type ProjectTaskStatus = 'inbox' | 'backlog' | 'todo' | 'in-progress' | 'done';
export type ProjectTemplateId = 'blank' | 'software-sprint' | 'research-paper' | 'product-launch';

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  color: string;
  /** Icon id from the explorer icon set (ENTRY_ICONS). */
  icon?: string;
  deadline: string; // ISO YYYY-MM-DD
  isPrimary: boolean;
  status: 'active' | 'on-hold' | 'completed';
  createdAt: number;
  folderPath?: string;
  fromFolderProject?: boolean;
  templateId?: ProjectTemplateId;
}

export interface SprintItem {
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  status: 'planned' | 'active' | 'done';
}

export interface ProjectTask {
  id: string;
  projectId: string;
  sprintId?: string;
  title: string;
  description?: string;
  done: boolean;
  status?: ProjectTaskStatus;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignee?: string;
  tags?: string[];
  sourceType?: 'manual' | 'markdown-checkbox' | 'note-card' | 'tag-rule';
  sourcePath?: string;
  sourceLine?: number;
  linkedNotePath?: string;
  blockedBy?: string[];
  timeSpentMinutes?: number;
  timeBlockDate?: string;
  timeBlockStartHour?: number;
  timeBlockDurationMin?: number;
  /** Set when the task was made from a Google Calendar event. */
  googleEventId?: string;
  createdAt: number;
}

export interface TagWorkflowRule {
  id: string;
  tag: string;
  targetProjectId: string;
  targetColumn: ProjectTaskStatus;
  priority: ProjectTask['priority'];
  enabled: boolean;
}

export interface ProjectModeState {
  projects: ProjectItem[];
  sprints: SprintItem[];
  tasks: ProjectTask[];
  spotlightEnabled: boolean;
  spotlightProjectId: string | null;
  tagRules?: TagWorkflowRule[];
}

export type AmbientEffectType =
  | 'none'
  | 'snow'
  | 'autumn'
  | 'sakura'
  | 'fireflies'
  | 'rain'
  | 'starfield'
  | 'embers'
  | 'aurora';

export type AmbientMusicTrack =
  | 'none'
  | 'lofi'
  | 'piano'
  | 'forest'
  | 'cosmos'
  | 'binaural'
  | 'rainy-jazz'
  | 'synthwave'
  | 'zen-bells'
  | 'custom';

export type SoundChannel =
  | 'rain'
  | 'brown'
  | 'wind'
  | 'fireplace'
  | 'waves'
  | 'cafe'
  | 'birds';

export interface AmbientConfig {
  effect: AmbientEffectType;
  density: number; // 20..100
  wind: number; // -10..10
  maxPileHeight: number; // 18..56 px
  musicTrack: AmbientMusicTrack;
  musicPlaying: boolean;
  musicVolume: number; // 0..1
  customAudioMediaId?: string;
  /** The library item playing instead of a built-in track. */
  musicItem?: string;
}

export type PetSpecies = 'fox' | 'owl' | 'cat' | 'panda' | 'bunny' | 'pup';
export type PetActivityState = 'idle' | 'playing' | 'sleep' | 'feeding';

export interface PetFoodItem {
  id: string;
  name: string;
  cost: number;
  hungerBoost: number;
  happinessBoost: number;
  healthBoost?: number;
  xpBoost: number;
  accent: string;
  speciesAffinity?: PetSpecies;
}

export interface PetAccessoryItem {
  id: string;
  name: string;
  slot: 'head' | 'neck' | 'aura';
  cost: number;
  description: string;
}

export interface PetState {
  species: PetSpecies;
  name: string;
  health: number; // 0..100
  hunger: number; // 0..100
  happiness: number; // 0..100
  energy: number; // 0..100
  activity: PetActivityState;
  level: number;
  xp: number;
  coins: number;
  ownedAccessories: string[];
  equippedAccessories: string[];
  lastInteractionAt: number;
  playWindowStart?: number;
  playCoinsUsedInWindow?: number;
  customModelId?: string;
  customModelName?: string;
  /** When the companion was adopted (ms). */
  bornAt?: number;
  /** Bond with the owner, 0..100: grows with care and attention. */
  bond?: number;
}

export interface Snapshot {
  time: number;
  content: string;
  label: string;
}

export interface Note {
  path: string;
  content: string;
  starred: boolean;
  createdAt?: number;
  updatedAt: number;
  lastOpenedAt?: number;
  snapshots: Snapshot[];
}

export interface KanbanCard {
  id: string;
  done: boolean;
  text: string;
}

export interface KanbanColumn {
  title: string;
  cards: KanbanCard[];
  otherLines: string[];
}

export interface MindmapNode {
  id: string;
  text: string;
  level: number;
  children: MindmapNode[];
  h?: number;
}

export type SRSAlgorithm = 'sm2' | 'fsrs';
export type SRSRating = 1 | 2 | 3 | 4;
export type StorageMode = 'sidecar' | 'inline-comment';

export type CardKind =
  | 'basic'
  | 'reversible'
  | 'multiline'
  | 'cloze'
  | 'header'
  | 'bullet'
  | 'table'
  | 'occlusion'
  | 'code-cloze';

export interface ImageOcclusionBox {
  id: string;
  x: number; // 0..100 percentage
  y: number; // 0..100 percentage
  w: number; // 0..100 percentage
  h: number; // 0..100 percentage
  label: string;
  color: string;
}

export interface ImageOcclusionData {
  id: string;
  imageSrc: string;
  title: string;
  mode: 'hide-all-guess-one' | 'hide-one';
  boxes: ImageOcclusionBox[];
}

export interface SRSCardState {
  cardId: string;
  algorithm: SRSAlgorithm;
  reps: number;
  lapses: number;
  intervalDays: number;
  ease: number;
  stability: number;
  difficulty: number;
  dueAt: number;
  lastReviewedAt: number;
  buriedUntil?: number;
  suspended?: boolean;
  leech?: boolean;
  avgTimeMs: number;
  reviewCount: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  siblingKey: string;
  blockId?: string;
  kind: CardKind;
  question: string;
  answer: string;
  hint?: string;
  extra?: string;
  context?: string;
  sourcePath: string;
  sourceName: string;
  lineNumber: number;
  endLineNumber: number;
  tags: string[];
  folder: string;
  dependencies: string[];
  clozeIndex?: number;
  clozeTotal?: number;
  codeLanguage?: string;
  occlusion?: {
    data: ImageOcclusionData;
    activeBoxId: string;
  };
  inlineSrs?: Partial<SRSCardState>;
}

export interface FlashcardReviewStat {
  lastReviewed: number;
  intervalDays: number;
  ease: number;
  rating: number;
}

export interface FlashcardReviewLog {
  id: string;
  cardId: string;
  deckKey: string;
  tags: string[];
  timestamp: number;
  rating: SRSRating;
  durationMs: number;
  algorithm: SRSAlgorithm;
  cram: boolean;
  deviceId?: string;
}

export interface DeckPreset {
  id: string;
  name: string;
  algorithm: SRSAlgorithm;
  newPerDay: number;
  reviewsPerDay: number;
  difficultyMultiplier: number;
  order: 'due-first' | 'random' | 'new-first';
  leechThreshold: number;
  fuzzEnabled: boolean;
  loadBalanceEnabled: boolean;
  burySiblings: boolean;
}

export interface ExtractionOptions {
  headers: boolean;
  bullets: boolean;
  tables: boolean;
}

export interface StreakFreezeConfig {
  freezeDaysPerWeek: number;
  restWeekdays: number[];
}

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

export interface HeadingItem {
  index: number;
  level: number;
  text: string;
}

export interface SearchLineMatch {
  lineNumber: number;
  lineText: string;
  heading?: string;
  ranges: Array<[number, number]>;
}

export interface SearchResultItem {
  note: Note;
  title: string;
  score: number;
  totalMatches: number;
  matchedInTitle: boolean;
  matchedTags: string[];
  lineMatches: SearchLineMatch[];
}

export type VaultSourceType = 'demo' | 'custom' | 'local-folder';

export interface VaultSummary {
  id: string;
  name: string;
  source: VaultSourceType;
  diskPath?: string;
  createdAt: number;
  updatedAt: number;
  noteCount: number;
}

export interface VaultRegistry {
  onboarded: boolean;
  activeVaultId: string;
  vaults: VaultSummary[];
}

export interface VaultWorkspaceProfile {
  activeProfileId?: string | null;
  viewMode: ViewMode;
  showEditorPanel: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  showRibbon: boolean;
  uiPrefs: WorkspaceUiPrefs;
  mainSurface?: MainSurface;
  rightTab?: RightTab;
}

export type CinemaMediaKind = 'movie' | 'series';
export type CinemaWatchStatus = 'watchlist' | 'watching' | 'watched';

export interface CinemaEntry {
  id: string;
  title: string;
  mediaType: CinemaMediaKind;
  status: CinemaWatchStatus;
  director: string;
  year: string;
  genre: string;
  runtimeMin: number;
  episodesWatched: number;
  episodesTotal: number;
  rating: number; // 0..5
  /** Personal score out of 10 (one decimal). */
  score?: number;
  /** Vault path of a chosen cover or poster image. */
  cover?: string;
  watchedDate?: string;
  favoriteQuotes: string[];
  notes: string;
  linkedNotePath?: string;
  createdAt: number;
  updatedAt: number;
}

export type BookReadStatus = 'to-read' | 'reading' | 'finished';

export interface BookHighlight {
  id: string;
  quote: string;
  page?: number;
  note?: string;
}

export interface BookEntry {
  id: string;
  title: string;
  author: string;
  status: BookReadStatus;
  currentPage: number;
  totalPages: number;
  genre: string;
  rating: number; // 0..5
  /** Personal score out of 10 (one decimal). */
  score?: number;
  /** Vault path of a chosen cover image. */
  cover?: string;
  startedDate?: string;
  finishedDate?: string;
  highlights: BookHighlight[];
  notes: string;
  linkedNotePath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MediaLibraryState {
  movies: CinemaEntry[];
  books: BookEntry[];
  /** Books to finish this year (0 or missing: no goal). */
  readingGoal?: number;
  /** "Best of my life": ids in personal rank order, best first. */
  bestBooks?: string[];
  bestMovies?: string[];
}

export interface CustomScriptPlugin {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  runOnStartup?: boolean;
  /** Show a button for it on the tools ribbon. */
  ribbon?: boolean;
  /** Icon id (from the file icon set) for its ribbon button. */
  icon?: string;
  code: string;
  lastRunAt?: number;
  lastError?: string;
}

export interface DeveloperCustomConfig {
  customCssEnabled: boolean;
  customCss: string;
  scripts: CustomScriptPlugin[];
}

export type TerminalShellType = 'bash' | 'sh' | 'zsh' | 'powershell' | 'cmd';

export interface TerminalEntry {
  id: string;
  command: string;
  cwd: string;
  shell: TerminalShellType;
  mode: 'system' | 'vault';
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
}

export interface VaultSnapshotData {
  vaultName: string;
  notes: Note[];
  folders: string[];
  dashboards?: DashboardConfig[];
  activeDashboardId?: string;
  projectState?: ProjectModeState;
  itemCustomizations?: Record<string, ItemCustomization>;
  explorerPrefs?: ExplorerDisplayPrefs;
  leftBanner?: LeftBannerConfig;
  workspaceProfile?: VaultWorkspaceProfile;
  mediaLibrary?: MediaLibraryState;
  devExtensions?: DeveloperCustomConfig;
}

export interface ZenBlock {
  id: string;
  kind: 'focus' | 'break';
  label: string;
  minutes: number;
}

export interface ZenRewardHistoryItem {
  id: string;
  rewardText: string;
  goalText: string;
  claimedAt: number;
  totalMinutes: number;
}

export interface ZenStudioConfig {
  goalTitle: string;
  rewardText: string;
  blocks: ZenBlock[];
  chimeWarningEnabled: boolean;
  oneMinuteWarningEnabled: boolean;
  musicTrack: AmbientMusicTrack;
  musicVolume: number;
  soundChannels: Record<SoundChannel, number>;
  customAudioMediaId?: string;
  completedSessions: number;
  claimedRewards: ZenRewardHistoryItem[];
}

export type RibbonItemId =
  | 'dashboard'
  | 'projects'
  | 'media'
  | 'files'
  | 'quickSwitcher'
  | 'commandPalette'
  | 'graph'
  | 'mindmap'
  | 'kanban'
  | 'flashcards'
  | 'slides'
  | 'dailyNote'
  | 'zenStudio'
  | 'terminal';

