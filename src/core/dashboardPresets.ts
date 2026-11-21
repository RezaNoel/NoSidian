import type {
  DashboardConfig,
  DashboardTemplateId,
  DashboardWidget,
  DashboardWidgetType
} from './types';

export interface DashboardTemplateMeta {
  id: DashboardTemplateId;
  name: string;
  description: string;
  accentLabel: string;
  defaultCoverKey: 'general' | 'language' | 'writer' | 'research';
}

export const DASHBOARD_TEMPLATES: DashboardTemplateMeta[] = [
  {
    id: 'study',
    name: 'Study, Notes & Languages',
    description: 'Active recall flashcards, reading shelf, streak calendar, study metrics, and companion sanctuary.',
    accentLabel: 'Study & Language',
    defaultCoverKey: 'language'
  },
  {
    id: 'writer',
    name: 'Author & Writer Desk',
    description: 'Daily word target, story scratchpad, book shelf, starred chapters, and distraction-free draft shortcuts.',
    accentLabel: 'Writing Desk',
    defaultCoverKey: 'writer'
  },
  {
    id: 'developer',
    name: 'Projects & Programming',
    description: 'Deadline countdown, active sprint spotlight, Pomodoro timer, quick capture, and architecture tags.',
    accentLabel: 'Projects & Code',
    defaultCoverKey: 'general'
  }
];

export type DashboardWidgetCategory = 'core' | 'study' | 'writing' | 'projects' | 'media';

export interface DashboardWidgetCatalogItem {
  type: DashboardWidgetType;
  defaultSpan: 1 | 2 | 3;
  category: DashboardWidgetCategory;
  iconKey: string;
  titleEn: string;
  titleFa: string;
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetCatalogItem[] = [
  { type: 'cover', defaultSpan: 3, category: 'core', iconKey: 'image', titleEn: 'Hero Cover Banner', titleFa: 'بنر معرفی هاب' },
  { type: 'stats', defaultSpan: 1, category: 'core', iconKey: 'bar-chart', titleEn: 'Vault Telemetry', titleFa: 'آمار و وضعیت والت' },
  { type: 'shortcuts', defaultSpan: 2, category: 'core', iconKey: 'zap', titleEn: 'Quick Shortcuts', titleFa: 'میانبرهای سریع' },
  { type: 'recent-notes', defaultSpan: 1, category: 'core', iconKey: 'clock', titleEn: 'Recent Files', titleFa: 'فایل‌های اخیر' },
  { type: 'starred-notes', defaultSpan: 1, category: 'core', iconKey: 'star', titleEn: 'Starred Notes', titleFa: 'یادداشت‌های نشان‌شده' },
  { type: 'quick-capture', defaultSpan: 1, category: 'core', iconKey: 'inbox', titleEn: 'Quick Capture', titleFa: 'ثبت سریع یادداشت' },
  { type: 'todos', defaultSpan: 1, category: 'projects', iconKey: 'check-square', titleEn: 'Action Checklist', titleFa: 'چک‌لیست کارها' },
  { type: 'deadline-hero', defaultSpan: 3, category: 'projects', iconKey: 'alarm-clock', titleEn: 'Project Deadline', titleFa: 'شمارش معکوس ددلاین' },
  { type: 'project-spotlight', defaultSpan: 2, category: 'projects', iconKey: 'briefcase', titleEn: 'Active Project Tasks', titleFa: 'تسک‌های پروژه فعال' },
  { type: 'pomodoro-timer', defaultSpan: 1, category: 'projects', iconKey: 'timer', titleEn: 'Focus Pomodoro', titleFa: 'تایمر پومودورو' },
  { type: 'tag-explorer', defaultSpan: 1, category: 'core', iconKey: 'tags', titleEn: 'Tag Explorer', titleFa: 'کاوشگر تگ‌ها' },
  { type: 'flashcard-queue', defaultSpan: 1, category: 'study', iconKey: 'layers', titleEn: 'Flashcards Due', titleFa: 'صف مرور فلش‌کارت' },
  { type: 'calendar', defaultSpan: 1, category: 'study', iconKey: 'calendar', titleEn: 'Daily Notes Calendar', titleFa: 'تقویم یادداشت روزانه' },
  { type: 'scratchpad', defaultSpan: 2, category: 'writing', iconKey: 'pen-tool', titleEn: 'Scratchpad', titleFa: 'دفترچه پیش‌نویس' },
  { type: 'writing-goal', defaultSpan: 1, category: 'writing', iconKey: 'target', titleEn: 'Writing Goal', titleFa: 'هدف کلمات روزانه' },
  { type: 'reading-shelf', defaultSpan: 1, category: 'media', iconKey: 'book-open', titleEn: 'Reading Shelf', titleFa: 'قفسه کتاب‌ها' },
  { type: 'watchlist', defaultSpan: 1, category: 'media', iconKey: 'film', titleEn: 'Cinema Watchlist', titleFa: 'لیست فیلم و سریال' },
  { type: 'pet-home', defaultSpan: 2, category: 'study', iconKey: 'sparkles', titleEn: 'Companion Sanctuary', titleFa: 'خانه ۳بعدی پت' }
];

export function buildWidgetFromType(
  type: DashboardWidgetType,
  coverImages: Record<'general' | 'language' | 'writer' | 'research', string>,
  customTitle?: string,
  now = Date.now()
): DashboardWidget {
  const meta = DASHBOARD_WIDGET_CATALOG.find(item => item.type === type);
  const title = customTitle?.trim() || meta?.titleEn || 'Widget';
  const id = `w-${type}-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const span = meta?.defaultSpan || 1;

  const base: DashboardWidget = { id, type, title, span };
  if (type === 'cover') {
    base.coverImage = coverImages.general;
    base.subtitle = 'Customize your workspace widgets and covers.';
  } else if (type === 'todos') {
    base.todos = [{ id: `td-${now}`, text: 'Complete next milestone task', done: false }];
  } else if (type === 'scratchpad') {
    base.scratchpadText = '';
  } else if (type === 'writing-goal') {
    base.dailyWordTarget = 750;
  } else if (type === 'shortcuts') {
    base.shortcuts = [
      { id: `sc-1-${now}`, label: 'New Note', icon: 'file', color: '#2563eb', actionType: 'new-note' },
      { id: `sc-2-${now}`, label: 'Daily Note', icon: 'sparkles', color: '#10b981', actionType: 'daily' },
      { id: `sc-3-${now}`, label: 'Flashcards', icon: 'layers', color: '#7c3aed', actionType: 'flashcards' },
      { id: `sc-4-${now}`, label: 'Cinema & Books', icon: 'book', color: '#0ea5e9', actionType: 'media' }
    ];
  }
  return base;
}

export function buildDashboardFromTemplate(
  templateId: DashboardTemplateId,
  coverImages: Record<'general' | 'language' | 'writer' | 'research', string>,
  now = Date.now()
): DashboardConfig {
  const normalizedId: 'study' | 'writer' | 'developer' =
    templateId === 'writer'
      ? 'writer'
      : templateId === 'developer'
        ? 'developer'
        : 'study';
  const uid = (p: string) => `${p}-${templateId}`;

  if (normalizedId === 'writer') {
    return {
      id: `dash-${templateId}`,
      name: 'Author & Writer Desk',
      description: 'Daily word target, story scratchpad, book shelf, starred chapters, and distraction-free draft shortcuts.',
      tags: ['Writing', 'Manuscript', 'Books'],
      templateId,
      updatedAt: now,
      widgets: [
        {
          id: uid('cover'),
          type: 'cover',
          title: 'Author & Writer Desk',
          subtitle: 'Calm drafting desk, daily word targets, research shelf & revision checklists.',
          span: 3,
          coverImage: coverImages.writer
        },
        {
          id: uid('scratch'),
          type: 'scratchpad',
          title: 'Story & Scene Scratchpad',
          span: 2,
          scratchpadText: 'Chapter focus: Keep the opening scene grounded in sensory detail and cut exposition by 20%.'
        },
        { id: uid('wgoal'), type: 'writing-goal', title: 'Daily Writing Goal', span: 1, dailyWordTarget: 750 },
        {
          id: uid('shortcuts'),
          type: 'shortcuts',
          title: 'Editorial Shortcuts',
          span: 1,
          shortcuts: [
            { id: 'wc-1', label: 'New Chapter', icon: 'file', color: '#f59e0b', actionType: 'new-note' },
            { id: 'wc-2', label: 'Daily Pages', icon: 'book', color: '#2563eb', actionType: 'daily' },
            { id: 'wc-3', label: 'Story Graph', icon: 'globe', color: '#7c3aed', actionType: 'graph' },
            { id: 'wc-4', label: 'Book Shelf', icon: 'image', color: '#0ea5e9', actionType: 'media' }
          ]
        },
        { id: uid('rshelf'), type: 'reading-shelf', title: 'Reading Shelf', span: 1 },
        {
          id: uid('todos'),
          type: 'todos',
          title: 'Revision Queue',
          span: 1,
          todos: [
            { id: 'wt-1', text: 'Draft 750 words before noon', done: false },
            { id: 'wt-2', text: 'Snapshot major revision in Time Machine', done: true },
            { id: 'wt-3', text: 'Verify character arc links in Graph', done: false }
          ]
        },
        { id: uid('starred'), type: 'starred-notes', title: 'Starred Manuscripts', span: 1 },
        { id: uid('recent'), type: 'recent-notes', title: 'Recent Drafts', span: 1 },
        { id: uid('capture'), type: 'quick-capture', title: 'Quick Scene Idea', span: 1 }
      ]
    };
  }

  if (normalizedId === 'developer') {
    return {
      id: `dash-${templateId}`,
      name: 'Projects & Programming',
      description: 'Deadline countdown, active sprint spotlight, Pomodoro timer, quick capture, and architecture tags.',
      tags: ['Projects', 'Engineering', 'Sprint'],
      templateId,
      updatedAt: now,
      widgets: [
        {
          id: uid('cover'),
          type: 'cover',
          title: 'Projects & Programming',
          subtitle: 'RFCs, Kanban sprints, focus Pomodoro, integrated terminal & architecture tags.',
          span: 3,
          coverImage: coverImages.general
        },
        { id: uid('deadline'), type: 'deadline-hero', title: 'Project Deadline Countdown', span: 3 },
        { id: uid('spotlight'), type: 'project-spotlight', title: 'Active Sprint Tasks', span: 2 },
        { id: uid('pomo'), type: 'pomodoro-timer', title: 'Deep Work Pomodoro', span: 1 },
        {
          id: uid('shortcuts'),
          type: 'shortcuts',
          title: 'Engineering Launchpad',
          span: 2,
          shortcuts: [
            { id: 'dc-1', label: 'Roadmap Kanban', icon: 'briefcase', color: '#2563eb', actionType: 'note', target: 'Projects/Product Roadmap Kanban.md' },
            { id: 'dc-2', label: 'Architecture Graph', icon: 'code', color: '#0ea5e9', actionType: 'graph' },
            { id: 'dc-3', label: 'Project Sprints', icon: 'target', color: '#10b981', actionType: 'projects' },
            { id: 'dc-4', label: 'Open Terminal', icon: 'terminal', color: '#7c3aed', actionType: 'terminal' }
          ]
        },
        {
          id: uid('todos'),
          type: 'todos',
          title: 'Sprint Action Items',
          span: 1,
          todos: [
            { id: 'dt-1', text: 'Audit markdown pipeline & sync rules', done: true },
            { id: 'dt-2', text: 'Review code-cloze deck before release', done: false },
            { id: 'dt-3', text: 'Export vault JSON backup', done: false }
          ]
        },
        { id: uid('recent'), type: 'recent-notes', title: 'Recently Edited Specs', span: 1 },
        { id: uid('tags'), type: 'tag-explorer', title: 'Vault Tag Explorer', span: 1 },
        { id: uid('capture'), type: 'quick-capture', title: 'Quick Dev Snippet / Inbox', span: 1 }
      ]
    };
  }

  // Default Hub 1: Study, Notes & Languages (also covers legacy 'general', 'language', 'research')
  return {
    id: templateId === 'general' ? 'dash-general' : `dash-${templateId}`,
    name:
      templateId === 'research'
        ? 'Academic Observatory'
        : templateId === 'language'
          ? 'Language Immersion'
          : 'Study, Notes & Languages',
    description: 'Active recall flashcards, reading shelf, streak calendar, study metrics, and companion sanctuary.',
    tags: ['Study', 'Languages', 'Active Recall'],
    templateId,
    updatedAt: now,
    widgets: [
      {
        id: uid('cover'),
        type: 'cover',
        title: templateId === 'research' ? 'Academic Observatory' : 'Study, Notes & Languages',
        subtitle: 'Spaced repetition flashcards, bilingual study notes, reading shelf & companion sanctuary.',
        span: 3,
        coverImage: templateId === 'research' ? coverImages.research : coverImages.language
      },
      {
        id: uid('shortcuts'),
        type: 'shortcuts',
        title: 'Study Launchpad',
        span: 2,
        shortcuts: [
          { id: 'sc-fc', label: 'Review Due Cards', icon: 'layers', color: '#2563eb', actionType: 'flashcards' },
          { id: 'sc-daily', label: 'Daily Journal', icon: 'sparkles', color: '#10b981', actionType: 'daily' },
          { id: 'sc-media', label: 'Books & Cinema', icon: 'book', color: '#f59e0b', actionType: 'media' },
          { id: 'sc-graph', label: 'Knowledge Graph', icon: 'globe', color: '#0ea5e9', actionType: 'graph' }
        ]
      },
      { id: uid('fcqueue'), type: 'flashcard-queue', title: 'Flashcards Due', span: 1 },
      { id: uid('pethome'), type: 'pet-home', title: 'Companion Sanctuary', span: 2 },
      { id: uid('stats'), type: 'stats', title: 'Study Telemetry', span: 1 },
      {
        id: uid('todos'),
        type: 'todos',
        title: 'Daily Study Checklist',
        span: 1,
        todos: [
          { id: 'lt-1', text: 'Complete 20 FSRS active recall cards', done: false },
          { id: 'lt-2', text: 'Read 15 pages in Book Shelf', done: false },
          { id: 'lt-3', text: 'Write 5 new multi-line ?? +++ flashcards', done: false }
        ]
      },
      { id: uid('rshelf'), type: 'reading-shelf', title: 'Reading Shelf', span: 1 },
      { id: uid('watchlist'), type: 'watchlist', title: 'Cinema Watchlist', span: 1 },
      { id: uid('recent'), type: 'recent-notes', title: 'Recently Studied Notes', span: 1 },
      { id: uid('cal'), type: 'calendar', title: 'Study Streak Calendar', span: 1 },
      { id: uid('capture'), type: 'quick-capture', title: 'Quick Study Capture', span: 1 }
    ]
  };
}

export function buildAllDefaultDashboards(
  coverImages: Record<'general' | 'language' | 'writer' | 'research', string>,
  now = Date.now()
): DashboardConfig[] {
  return DASHBOARD_TEMPLATES.map(tpl => buildDashboardFromTemplate(tpl.id, coverImages, now));
}

export function parseProfileTagsInput(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function createCustomHub(
  name: string,
  templateId: DashboardTemplateId,
  coverImages: Record<'general' | 'language' | 'writer' | 'research', string>,
  now = Date.now(),
  opts?: {
    description?: string;
    tags?: string[];
    startBlank?: boolean;
  }
): DashboardConfig {
  const cleanName =
    name.trim() || `Profile ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const cleanDesc = opts?.description?.trim() || 'Custom dashboard profile tailored to your workflow.';
  const cleanTags = opts?.tags?.length ? opts.tags.slice(0, 8) : ['Custom'];
  const id = `dash-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  if (opts?.startBlank) {
    const coverKey =
      templateId === 'writer'
        ? 'writer'
        : templateId === 'study' || templateId === 'language'
          ? 'language'
          : templateId === 'research'
            ? 'research'
            : 'general';
    return {
      id,
      name: cleanName,
      description: cleanDesc,
      tags: cleanTags,
      templateId,
      updatedAt: now,
      widgets: [
        {
          id: `cover-${now.toString(36)}`,
          type: 'cover',
          title: cleanName,
          subtitle: cleanDesc,
          span: 3,
          coverImage: coverImages[coverKey] || coverImages.general
        },
        {
          id: `recent-${now.toString(36)}`,
          type: 'recent-notes',
          title: 'Recent Files',
          span: 1
        },
        {
          id: `todos-${now.toString(36)}`,
          type: 'todos',
          title: 'Checklist',
          span: 1,
          todos: [{ id: `td-${now}`, text: 'Add custom widgets using Edit Layout', done: false }]
        },
        {
          id: `scratch-${now.toString(36)}`,
          type: 'scratchpad',
          title: 'Scratchpad',
          span: 1,
          scratchpadText: ''
        }
      ]
    };
  }

  const base = buildDashboardFromTemplate(templateId, coverImages, now);
  return {
    ...base,
    id,
    name: cleanName,
    description: cleanDesc,
    tags: cleanTags,
    updatedAt: now,
    widgets: base.widgets.map((w, idx) => ({
      ...w,
      id: `${w.id}-${now.toString(36)}-${idx}`,
      ...(w.type === 'cover' ? { title: cleanName, subtitle: cleanDesc } : {})
    }))
  };
}

export function renameHubEverywhere(
  dashboards: DashboardConfig[],
  hubId: string,
  nextName: string,
  now = Date.now()
): DashboardConfig[] {
  return updateHubProfileMeta(dashboards, hubId, { name: nextName }, now);
}

export function updateHubProfileMeta(
  dashboards: DashboardConfig[],
  hubId: string,
  patch: { name?: string; description?: string; tags?: string[] },
  now = Date.now()
): DashboardConfig[] {
  const nextName = patch.name !== undefined ? patch.name.trim() : undefined;
  if (patch.name !== undefined && !nextName) return dashboards;
  return dashboards.map(d => {
    if (d.id !== hubId) return d;
    const prevName = d.name;
    const updatedName = nextName ?? d.name;
    const updatedDesc = patch.description !== undefined ? patch.description.trim() : d.description;
    const updatedTags = patch.tags !== undefined ? patch.tags.slice(0, 8) : d.tags;
    return {
      ...d,
      name: updatedName,
      description: updatedDesc,
      tags: updatedTags,
      updatedAt: now,
      widgets: d.widgets.map(w => {
        if (w.type !== 'cover') return w;
        const shouldSyncTitle =
          nextName !== undefined &&
          (w.title === prevName || w.title === 'Welcome to NoSidian' || w.title.trim() === '');
        const shouldSyncSubtitle =
          patch.description !== undefined &&
          (w.subtitle === d.description || !w.subtitle);
        return {
          ...w,
          ...(shouldSyncTitle ? { title: updatedName } : {}),
          ...(shouldSyncSubtitle && updatedDesc !== undefined ? { subtitle: updatedDesc } : {})
        };
      })
    };
  });
}

export function deleteHubSafely(
  dashboards: DashboardConfig[],
  hubId: string,
  activeHubId: string
): { dashboards: DashboardConfig[]; activeDashboardId: string } {
  if (dashboards.length <= 1) {
    return { dashboards, activeDashboardId: activeHubId };
  }
  const remaining = dashboards.filter(d => d.id !== hubId);
  const nextActive =
    activeHubId === hubId || !remaining.some(d => d.id === activeHubId)
      ? remaining[0].id
      : activeHubId;
  return { dashboards: remaining, activeDashboardId: nextActive };
}

export function resetDashboardsToDefault(
  coverImages: Record<'general' | 'language' | 'writer' | 'research', string>,
  now = Date.now()
): { dashboards: DashboardConfig[]; activeDashboardId: string } {
  const all = buildAllDefaultDashboards(coverImages, now);
  return { dashboards: all, activeDashboardId: all[0].id };
}

export function exportDashboardJson(config: DashboardConfig): string {
  return JSON.stringify(
    {
      schema: 'nosidian-dashboard-v1',
      exportedAt: new Date().toISOString(),
      dashboard: config
    },
    null,
    2
  );
}

export function parseImportedDashboardJson(rawJson: string): DashboardConfig {
  const parsed = JSON.parse(rawJson) as {
    schema?: string;
    dashboard?: DashboardConfig;
    widgets?: DashboardWidget[];
    name?: string;
    description?: string;
    tags?: string[];
    templateId?: DashboardTemplateId;
  };
  const candidate = parsed.dashboard || (Array.isArray(parsed.widgets) ? (parsed as unknown as DashboardConfig) : null);
  if (!candidate || !Array.isArray(candidate.widgets)) {
    throw new Error('Invalid NoSidian dashboard JSON format.');
  }
  return {
    id: `dash-imp-${Date.now().toString(36)}`,
    name: candidate.name || 'Imported Profile',
    description: candidate.description || 'Imported custom dashboard profile.',
    tags: Array.isArray(candidate.tags) ? candidate.tags.slice(0, 8) : ['Imported'],
    templateId: candidate.templateId || 'study',
    updatedAt: Date.now(),
    widgets: candidate.widgets.map((w, idx) => ({
      ...w,
      id: w.id || `w-${Date.now()}-${idx}`,
      span: w.span === 2 || w.span === 3 ? w.span : 1
    }))
  };
}

export function reorderWidgets(
  widgets: DashboardWidget[],
  fromIndex: number,
  toIndex: number
): DashboardWidget[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= widgets.length ||
    toIndex >= widgets.length
  ) {
    return widgets;
  }
  const next = [...widgets];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function stepWidgetSpan(span: 1 | 2 | 3, delta: -1 | 1): 1 | 2 | 3 {
  const next = Math.max(1, Math.min(3, span + delta));
  return next === 3 ? 3 : next === 2 ? 2 : 1;
}
