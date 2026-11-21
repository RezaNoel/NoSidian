import { extractTags, extractWikilinks, noteBaseName, parseFrontmatter, buildFrontmatter } from './markdown';
import type {
  Note,
  ProjectItem,
  ProjectTask,
  ProjectTaskStatus,
  ProjectTemplateId,
  TagWorkflowRule
} from './types';

export const PROJECT_COLUMNS: Array<{ id: ProjectTaskStatus; accent: string }> = [
  { id: 'inbox', accent: '#64748b' },
  { id: 'backlog', accent: '#6366f1' },
  { id: 'todo', accent: '#2563eb' },
  { id: 'in-progress', accent: '#f59e0b' },
  { id: 'done', accent: '#10b981' }
];

export const DEFAULT_TAG_WORKFLOW_RULES: TagWorkflowRule[] = [
  {
    id: 'rule-bug',
    tag: 'bug',
    targetProjectId: 'proj-main',
    targetColumn: 'backlog',
    priority: 'high',
    enabled: true
  },
  {
    id: 'rule-idea',
    tag: 'idea',
    targetProjectId: 'proj-main',
    targetColumn: 'inbox',
    priority: 'medium',
    enabled: true
  },
  {
    id: 'rule-urgent',
    tag: 'urgent',
    targetProjectId: 'proj-main',
    targetColumn: 'todo',
    priority: 'high',
    enabled: true
  }
];

export function normalizeTaskStatus(raw?: string, done?: boolean): ProjectTaskStatus {
  if (done) return 'done';
  const s = (raw || '').trim().toLowerCase();
  if (s === 'inbox') return 'inbox';
  if (s === 'backlog') return 'backlog';
  if (s === 'in-progress' || s === 'in progress' || s === 'doing' || s === 'active') return 'in-progress';
  if (s === 'done' || s === 'completed' || s === 'closed') return 'done';
  return 'todo';
}

export function normalizePriority(raw?: string): ProjectTask['priority'] {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'high' || s === 'urgent' || s === 'p1') return 'high';
  if (s === 'low' || s === 'p3') return 'low';
  return 'medium';
}

export interface NoteProjectMetadata {
  project?: string;
  status?: ProjectTaskStatus;
  priority?: ProjectTask['priority'];
  dueDate?: string;
  assignee?: string;
  tags: string[];
  blockers: string[];
}

export function extractNoteProjectMetadata(note: Pick<Note, 'content'>): NoteProjectMetadata {
  const { props } = parseFrontmatter(note.content);
  const str = (key: string) => {
    const val = props[key];
    return typeof val === 'string' ? val.trim() : Array.isArray(val) ? val[0] || '' : '';
  };
  const arr = (key: string) => {
    const val = props[key];
    if (Array.isArray(val)) return val.map(x => x.trim()).filter(Boolean);
    if (typeof val === 'string' && val.trim()) {
      return val.split(',').map(x => x.trim()).filter(Boolean);
    }
    return [];
  };

  const rawStatus = str('status');
  const rawPriority = str('priority');
  const dueDate = str('due_date') || str('due') || str('deadline') || undefined;
  const project = str('project') || undefined;
  const assignee = str('assignee') || str('owner') || undefined;
  const blockers = [...arr('depends_on'), ...arr('blockers'), ...arr('blocked_by')];

  return {
    project,
    status: rawStatus ? normalizeTaskStatus(rawStatus, rawStatus.toLowerCase() === 'done') : undefined,
    priority: rawPriority ? normalizePriority(rawPriority) : undefined,
    dueDate: dueDate && /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : dueDate,
    assignee,
    tags: extractTags(note),
    blockers
  };
}

export function updateNoteFrontmatterMetadata(
  content: string,
  patch: Partial<{
    project: string;
    status: ProjectTaskStatus;
    priority: ProjectTask['priority'];
    dueDate: string;
    assignee: string;
    blockers: string[];
  }>
): string {
  const { props, body } = parseFrontmatter(content);
  const nextProps: Record<string, string | string[]> = { ...props };

  if (patch.project !== undefined) {
    if (patch.project.trim()) nextProps.project = patch.project.trim();
    else delete nextProps.project;
  }
  if (patch.status !== undefined) nextProps.status = patch.status;
  if (patch.priority !== undefined) nextProps.priority = patch.priority;
  if (patch.dueDate !== undefined) {
    if (patch.dueDate.trim()) nextProps.due_date = patch.dueDate.trim();
    else delete nextProps.due_date;
  }
  if (patch.assignee !== undefined) {
    if (patch.assignee.trim()) nextProps.assignee = patch.assignee.trim();
    else delete nextProps.assignee;
  }
  if (patch.blockers !== undefined) {
    if (patch.blockers.length > 0) nextProps.depends_on = patch.blockers;
    else delete nextProps.depends_on;
  }

  return buildFrontmatter(nextProps, body);
}

/**
 * Folder-as-a-Project: any folder containing `_project.md` becomes a synced Project.
 */
export function buildFolderProjectId(folderPath: string): string {
  return `folder-proj:${folderPath}`;
}

export function discoverFolderProjects(notes: Note[]): ProjectItem[] {
  const palette = ['#2563eb', '#10b981', '#7c3aed', '#f59e0b', '#ec4899', '#0ea5e9'];
  const items: ProjectItem[] = [];

  notes.forEach((n, idx) => {
    const fileName = n.path.split('/').pop()?.toLowerCase();
    if (fileName !== '_project.md') return;
    const parts = n.path.split('/');
    parts.pop();
    const folderPath = parts.join('/');
    if (!folderPath) return;

    const { props, body } = parseFrontmatter(n.content);
    const str = (k: string) => (typeof props[k] === 'string' ? props[k].trim() : '');
    const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const folderName = folderPath.split('/').pop() || folderPath;
    const name = str('name') || str('title') || str('project') || h1 || folderName;
    const deadline = str('deadline') || str('due_date') || new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
    const color = str('color') || palette[idx % palette.length];
    const statusRaw = str('status').toLowerCase();
    const status: ProjectItem['status'] =
      statusRaw === 'completed' || statusRaw === 'done'
        ? 'completed'
        : statusRaw === 'on-hold'
        ? 'on-hold'
        : 'active';

    const firstParagraph = body
      .replace(/^#.*$/gm, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l && !l.startsWith('-') && !l.startsWith('```')) || `Synced folder project (${folderPath})`;

    items.push({
      id: buildFolderProjectId(folderPath),
      name,
      description: str('description') || firstParagraph.slice(0, 140),
      color,
      deadline,
      isPrimary: false,
      status,
      createdAt: n.createdAt ?? Date.now(),
      folderPath,
      fromFolderProject: true
    });
  });

  return items;
}

export function buildFolderProjectIndexMarkdown(
  folderName: string,
  options?: { deadline?: string; color?: string; description?: string; templateId?: ProjectTemplateId }
): string {
  const deadline = options?.deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const color = options?.color || '#2563eb';
  const desc = options?.description || `Workspace hub and tasks for ${folderName}.`;

  return `---
name: ${folderName}
status: active
priority: high
deadline: ${deadline}
color: ${color}
tags: [project, folder-project]
---
# ${folderName}

${desc}

## Milestones
- [ ] Define core deliverables for ${folderName} [priority:: high]
- [ ] Link key research notes using [[Roadmap]] [status:: todo]

## Live Project Tasks
\`\`\`nosidian-query
project: ${folderName}
limit: 15
\`\`\`
`;
}

/**
 * Matches note or inline task metadata to an existing ProjectItem.
 */
function resolveTargetProjectId(
  projects: ProjectItem[],
  notePath: string,
  frontmatterProject?: string,
  inlineProject?: string
): string {
  const candidate = (inlineProject || frontmatterProject || '').trim().toLowerCase();
  if (candidate) {
    const byId = projects.find(p => p.id.toLowerCase() === candidate);
    if (byId) return byId.id;
    const byName = projects.find(p => p.name.toLowerCase() === candidate);
    if (byName) return byName.id;
  }

  // Folder-based project auto-assignment if note sits inside a _project.md folder
  const folderMatches = projects
    .filter(p => p.folderPath && (notePath.startsWith(`${p.folderPath}/`) || notePath === p.folderPath))
    .sort((a, b) => (b.folderPath?.length || 0) - (a.folderPath?.length || 0));
  if (folderMatches.length > 0) return folderMatches[0].id;

  return projects.find(p => p.isPrimary)?.id || projects[0]?.id || 'proj-main';
}

function parseInlineTaskFields(rawTitle: string): {
  cleanTitle: string;
  priority?: ProjectTask['priority'];
  dueDate?: string;
  status?: ProjectTaskStatus;
  assignee?: string;
  project?: string;
  timeSpentMinutes?: number;
  timeBlockDate?: string;
  timeBlockStartHour?: number;
  tags: string[];
} {
  let clean = rawTitle;
  let priority: ProjectTask['priority'] | undefined;
  let dueDate: string | undefined;
  let status: ProjectTaskStatus | undefined;
  let assignee: string | undefined;
  let project: string | undefined;
  let timeSpentMinutes = 0;
  let timeBlockDate: string | undefined;
  let timeBlockStartHour: number | undefined;

  const extractField = (field: string): string | undefined => {
    const rx = new RegExp(`\\[\\s*${field}\\s*::\\s*([^\\]]+)\\]`, 'i');
    const m = clean.match(rx);
    if (!m) return undefined;
    clean = clean.replace(rx, ' ').trim();
    return m[1].trim();
  };

  const pField = extractField('priority');
  if (pField) priority = normalizePriority(pField);
  const sField = extractField('status');
  if (sField) status = normalizeTaskStatus(sField);
  const dField = extractField('due') || extractField('due_date');
  if (dField && /^\d{4}-\d{2}-\d{2}/.test(dField)) dueDate = dField.slice(0, 10);
  const aField = extractField('assignee');
  if (aField) assignee = aField;
  const prField = extractField('project');
  if (prField) project = prField;
  const tField = extractField('time');
  if (tField) {
    const num = parseInt(tField, 10);
    if (Number.isFinite(num) && num > 0) timeSpentMinutes = num;
  }
  const slotField = extractField('slot');
  if (slotField) {
    const sm = slotField.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2})/);
    if (sm) {
      timeBlockDate = sm[1];
      timeBlockStartHour = Number(sm[2]);
    }
  }

  // Also allow emoji due date 📅 YYYY-MM-DD
  const emojiDue = clean.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
  if (emojiDue) {
    dueDate = dueDate || emojiDue[1];
    clean = clean.replace(/📅\s*\d{4}-\d{2}-\d{2}/, ' ').trim();
  }

  // Extract inline #tags while preserving readability
  const tags: string[] = [];
  const tagRx = /(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu;
  let tm: RegExpExecArray | null;
  while ((tm = tagRx.exec(clean)) !== null) {
    if (!/^\d+$/.test(tm[1])) tags.push(tm[1]);
  }

  clean = clean.replace(/\s{2,}/g, ' ').trim();
  return {
    cleanTitle: clean,
    priority,
    dueDate,
    status,
    assignee,
    project,
    timeSpentMinutes: timeSpentMinutes > 0 ? timeSpentMinutes : undefined,
    timeBlockDate,
    timeBlockStartHour,
    tags
  };
}

/**
 * Extracts all Markdown `- [ ]` / `- [x]` checkboxes across the Vault as synced ProjectTasks.
 */
export function extractMarkdownTasksFromNotes(notes: Note[], projects: ProjectItem[]): ProjectTask[] {
  const result: ProjectTask[] = [];

  for (const note of notes) {
    // Skip Sprint Review generated summary notes to avoid echoing completed task checklists
    const base = noteBaseName(note.path).toLowerCase();
    if (base.startsWith('sprint review') || base.startsWith('weekly review')) continue;

    const meta = extractNoteProjectMetadata(note);
    const lines = note.content.split(/\r?\n/);
    let inFence = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const m = line.match(/^[ \t]*[-*+]\s+\[([ xX])\]\s+(.+)$/);
      if (!m) continue;

      const done = m[1].toLowerCase() === 'x';
      const rawText = m[2].trim();
      if (!rawText) continue;

      const parsed = parseInlineTaskFields(rawText);
      const links = extractWikilinks(rawText);
      const linkedNotePath = links[0]
        ? notes.find(
            n =>
              n.path.toLowerCase() === links[0].toLowerCase() ||
              noteBaseName(n.path).toLowerCase() === links[0].toLowerCase()
          )?.path || note.path
        : note.path;

      const projectId = resolveTargetProjectId(projects, note.path, meta.project, parsed.project);
      const status = done ? 'done' : parsed.status || meta.status || 'todo';
      const mergedTags = Array.from(new Set([...meta.tags, ...parsed.tags]));

      result.push({
        id: `md::${note.path}::${lineIdx}`,
        projectId,
        title: parsed.cleanTitle || rawText,
        description: `Source: [[${noteBaseName(note.path)}]] · Line ${lineIdx + 1}`,
        done,
        status,
        priority: parsed.priority || meta.priority || 'medium',
        dueDate: parsed.dueDate || meta.dueDate,
        assignee: parsed.assignee || meta.assignee,
        tags: mergedTags,
        sourceType: 'markdown-checkbox',
        sourcePath: note.path,
        sourceLine: lineIdx,
        linkedNotePath,
        timeSpentMinutes: parsed.timeSpentMinutes,
        timeBlockDate: parsed.timeBlockDate,
        timeBlockStartHour: parsed.timeBlockStartHour,
        createdAt: note.updatedAt ?? note.createdAt ?? Date.now()
      });
    }
  }

  return result;
}

/**
 * Toggles `- [ ]` <-> `- [x]` at exact 0-based `lineIndex` in Markdown note content.
 */
export function toggleMarkdownTaskInNote(content: string, lineIndex: number, nextDone: boolean): string {
  const lines = content.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return content;
  const line = lines[lineIndex];
  const m = line.match(/^([ \t]*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/);
  if (!m) return content;

  let body = m[4];
  if (nextDone) {
    body = body.replace(/\s*\[status::\s*[^\]]+\]/gi, '').trim();
  } else if (/\[status::\s*done\]/i.test(body)) {
    body = body.replace(/\[status::\s*done\]/gi, '[status:: todo]');
  }
  lines[lineIndex] = `${m[1]}${nextDone ? 'x' : ' '}${m[3]}${body}`;
  return lines.join('\n');
}

export function moveMarkdownTaskColumnInNote(
  content: string,
  lineIndex: number,
  nextStatus: ProjectTaskStatus
): string {
  const nextDone = nextStatus === 'done';
  let updated = toggleMarkdownTaskInNote(content, lineIndex, nextDone);
  const lines = updated.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return updated;

  const line = lines[lineIndex];
  const stripped = line.replace(/\s*\[status::\s*[^\]]+\]/gi, '').trimEnd();
  lines[lineIndex] =
    nextStatus === 'done' || nextStatus === 'todo'
      ? stripped
      : `${stripped} [status:: ${nextStatus}]`;
  updated = lines.join('\n');
  return updated;
}

export function scheduleMarkdownTaskSlotInNote(
  content: string,
  lineIndex: number,
  isoDate: string,
  startHour: number
): string {
  const lines = content.split(/\r?\n/);
  if (lineIndex < 0 || lineIndex >= lines.length) return content;
  const stripped = lines[lineIndex].replace(/\s*\[slot::\s*[^\]]+\]/gi, '').trimEnd();
  lines[lineIndex] = `${stripped} [slot:: ${isoDate} ${String(startHour).padStart(2, '0')}:00]`;
  return lines.join('\n');
}

export function appendTaskTimeLogToNote(
  content: string,
  lineIndex: number | undefined,
  addMinutes: number,
  isoDate = new Date().toISOString().slice(0, 10)
): string {
  const mins = Math.max(1, Math.round(addMinutes));
  const lines = content.split(/\r?\n/);

  if (lineIndex !== undefined && lineIndex >= 0 && lineIndex < lines.length) {
    const line = lines[lineIndex];
    const m = line.match(/\[time::\s*(\d+)m?\]/i);
    const prevMins = m ? parseInt(m[1], 10) || 0 : 0;
    const total = prevMins + mins;
    const withoutTime = line.replace(/\s*\[time::\s*\d+m?\]/gi, '').trimEnd();
    lines[lineIndex] = `${withoutTime} [time:: ${total}m]`;
    return lines.join('\n');
  }

  // Otherwise append to ## Time Log section at bottom of note
  const logLine = `- ⏱ ${isoDate} +${mins}m`;
  if (/^##\s+Time Log/m.test(content)) {
    return `${content.trimEnd()}\n${logLine}\n`;
  }
  return `${content.trimEnd()}\n\n## Time Log\n${logLine}\n`;
}

export function convertNoteToProjectTask(
  note: Note,
  projectId: string,
  targetStatus: ProjectTaskStatus = 'todo',
  now = Date.now()
): ProjectTask {
  const meta = extractNoteProjectMetadata(note);
  const { body } = parseFrontmatter(note.content);
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = h1 || noteBaseName(note.path);
  const description = body.replace(/^#\s+.+\r?\n?/, '').trim().slice(0, 1200);

  return {
    id: `note-task-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    projectId,
    title: `${title} [[${noteBaseName(note.path)}]]`,
    description,
    done: targetStatus === 'done',
    status: targetStatus,
    priority: meta.priority || 'medium',
    dueDate: meta.dueDate,
    assignee: meta.assignee,
    tags: meta.tags,
    sourceType: 'note-card',
    sourcePath: note.path,
    linkedNotePath: note.path,
    createdAt: now
  };
}

/**
 * Merges manual projects with discovered `_project.md` folder projects without duplicates.
 */
export function mergeVaultAndManualProjects(
  manualProjects: ProjectItem[],
  notes: Note[]
): ProjectItem[] {
  const folderProjects = discoverFolderProjects(notes);
  const existingIds = new Set(manualProjects.map(p => p.id));
  const merged = [...manualProjects];
  folderProjects.forEach(fp => {
    if (!existingIds.has(fp.id)) merged.push(fp);
  });
  return merged;
}

/**
 * Tag-Triggered Workflows: scans notes for paragraphs / bullets containing configured tags like #bug or #idea.
 */
export function scanTagTriggeredTasks(
  notes: Note[],
  rules: TagWorkflowRule[],
  existingTasks: ProjectTask[],
  projects: ProjectItem[]
): ProjectTask[] {
  const activeRules = rules.filter(r => r.enabled && r.tag.trim());
  if (activeRules.length === 0) return [];

  const existingIds = new Set(existingTasks.map(t => t.id));
  const discovered: ProjectTask[] = [];
  const validProjectIds = new Set(projects.map(p => p.id));
  const fallbackProj = projects.find(p => p.isPrimary)?.id || projects[0]?.id || 'proj-main';

  for (const note of notes) {
    const { body } = parseFrontmatter(note.content);
    const lines = body.split(/\r?\n/);
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (/^```/.test(raw)) {
        inFence = !inFence;
        continue;
      }
      if (inFence || !raw || raw.startsWith('# ')) continue;
      // Ignore normal markdown checkboxes (already captured by two-way sync)
      if (/^[-*+]\s+\[[ xX]\]/.test(raw)) continue;

      for (const rule of activeRules) {
        const cleanTag = rule.tag.replace(/^#/, '').trim();
        const tagRx = new RegExp(`(^|[\\s(])#${cleanTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,:;!?)]+)`, 'i');
        if (!tagRx.test(raw)) continue;

        const id = `tagrule::${rule.id}::${note.path}::${i}`;
        if (existingIds.has(id)) continue;
        existingIds.add(id);

        const targetProjectId = validProjectIds.has(rule.targetProjectId) ? rule.targetProjectId : fallbackProj;
        const cleanText = raw.replace(/^[-*+]\s+/, '').slice(0, 140);

        discovered.push({
          id,
          projectId: targetProjectId,
          title: `${cleanText} [[${noteBaseName(note.path)}]]`,
          description: `Auto-created via #${cleanTag} workflow from ${note.path}`,
          done: rule.targetColumn === 'done',
          status: rule.targetColumn,
          priority: rule.priority,
          tags: [cleanTag],
          sourceType: 'tag-rule',
          sourcePath: note.path,
          sourceLine: i,
          linkedNotePath: note.path,
          createdAt: note.updatedAt || Date.now()
        });
      }
    }
  }

  return discovered;
}

/**
 * Combines manual ProjectTasks + live two-way synced Markdown tasks + tag-rule tasks.
 */
export function buildAllProjectTasks(
  manualTasks: ProjectTask[],
  notes: Note[],
  projects: ProjectItem[],
  tagRules: TagWorkflowRule[] = DEFAULT_TAG_WORKFLOW_RULES
): ProjectTask[] {
  const mdTasks = extractMarkdownTasksFromNotes(notes, projects);
  const normalizedManual = manualTasks.map(t => ({
    ...t,
    status: normalizeTaskStatus(t.status, t.done),
    sourceType: t.sourceType || ('manual' as const)
  }));
  const tagTasks = scanTagTriggeredTasks(notes, tagRules, [...normalizedManual, ...mdTasks], projects);
  return [...normalizedManual, ...mdTasks, ...tagTasks];
}

/**
 * Returns every task referencing `note` via sourcePath, linkedNotePath, or [[WikiLink]].
 */
export function getTaskBacklinksForNote(note: Pick<Note, 'path'>, allTasks: ProjectTask[]): ProjectTask[] {
  const targetName = noteBaseName(note.path).toLowerCase();
  const targetPath = note.path.toLowerCase();

  return allTasks.filter(task => {
    if (task.sourcePath?.toLowerCase() === targetPath) return true;
    if (task.linkedNotePath?.toLowerCase() === targetPath) return true;
    const links = extractWikilinks(`${task.title} ${task.description || ''}`);
    return links.some(
      l => l.toLowerCase() === targetName || l.toLowerCase() === targetPath
    );
  });
}

/**
 * Daily Note auto-injection: ensures `## Due Tasks` in Daily Note lists tasks due on `isoDate`.
 */
export function injectDueTasksIntoDailyNote(
  dailyContent: string,
  isoDate: string,
  allTasks: ProjectTask[]
): { content: string; injectedCount: number } {
  const dueTasks = allTasks.filter(t => t.dueDate === isoDate);
  if (dueTasks.length === 0) {
    return { content: dailyContent, injectedCount: 0 };
  }

  const lines = dailyContent.split(/\r?\n/);
  const sectionIdx = lines.findIndex(l => /^##\s+(Due Tasks|Tasks Due Today|تسک‌های سررسید امروز)/i.test(l.trim()));

  const existingNormalized = new Set(
    lines.map(l => l.toLowerCase().replace(/\[[ xX]\]/, '').trim())
  );

  const linesToInsert: string[] = [];
  for (const t of dueTasks) {
    const cleanTitle = t.title.trim();
    const probe = cleanTitle.toLowerCase();
    const alreadyPresent = Array.from(existingNormalized).some(existing =>
      existing.includes(probe.slice(0, Math.min(28, probe.length)))
    );
    if (alreadyPresent) continue;
    const sourceSuffix =
      t.linkedNotePath || t.sourcePath
        ? ` [[${noteBaseName(t.linkedNotePath || t.sourcePath || '')}]]`
        : '';
    linesToInsert.push(
      `- [${t.done ? 'x' : ' '}] ${cleanTitle}${sourceSuffix && !cleanTitle.includes('[[') ? sourceSuffix : ''}`
    );
  }

  if (linesToInsert.length === 0) {
    return { content: dailyContent, injectedCount: 0 };
  }

  if (sectionIdx >= 0) {
    const next = [...lines];
    next.splice(sectionIdx + 1, 0, ...linesToInsert);
    return { content: next.join('\n'), injectedCount: linesToInsert.length };
  }

  const trimmed = dailyContent.trimEnd();
  return {
    content: `${trimmed}\n\n## Due Tasks (${isoDate})\n${linesToInsert.join('\n')}\n`,
    injectedCount: linesToInsert.length
  };
}

/**
 * Generates an Auto-Sprint / Weekly Review Markdown note summarizing completed tasks,
 * touched notes (with [[WikiLinks]]), and total logged focus minutes.
 */
export function generateSprintReviewMarkdown(params: {
  tasks: ProjectTask[];
  notes: Note[];
  projects: ProjectItem[];
  fromIso: string;
  toIso: string;
  periodLabel?: string;
}): string {
  const { tasks, notes, projects, fromIso, toIso, periodLabel } = params;
  const fromMs = new Date(`${fromIso}T00:00:00`).getTime();
  const toMs = new Date(`${toIso}T23:59:59`).getTime();

  const completedTasks = tasks.filter(t => t.done || t.status === 'done');
  const openHigh = tasks.filter(t => !t.done && t.priority === 'high');
  const totalLoggedMin = tasks.reduce((s, t) => s + (t.timeSpentMinutes || 0), 0);

  const touchedNotes = notes.filter(n => {
    const ts = n.updatedAt ?? n.createdAt ?? 0;
    return ts >= fromMs && ts <= toMs;
  });

  const heading = periodLabel || `Sprint Review (${fromIso} → ${toIso})`;

  const lines: string[] = [
    '---',
    `type: sprint-review`,
    `from: ${fromIso}`,
    `to: ${toIso}`,
    `tags: [review, project-report]`,
    '---',
    `# ${heading}`,
    '',
    '## Summary Metrics',
    `- **Completed Tasks**: ${completedTasks.length}`,
    `- **Open High-Priority Tasks**: ${openHigh.length}`,
    `- **Total Time Logged**: ${totalLoggedMin} minutes`,
    `- **Notes Created / Updated**: ${touchedNotes.length}`,
    `- **Active Projects**: ${projects.filter(p => p.status === 'active').length}`,
    '',
    '## Completed Tasks',
    ...(completedTasks.length > 0
      ? completedTasks.map(t => `- [x] ${t.title}${t.timeSpentMinutes ? ` (${t.timeSpentMinutes}m)` : ''}`)
      : ['- No completed tasks logged yet.']),
    '',
    '## Notes Updated During Period',
    ...(touchedNotes.length > 0
      ? touchedNotes.slice(0, 25).map(n => `- [[${noteBaseName(n.path)}]] (\`${n.path}\`)`)
      : ['- No notes modified inside date range.']),
    '',
    '## Next Focus Priorities',
    ...(openHigh.length > 0
      ? openHigh.slice(0, 10).map(t => `- [ ] ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ''}`)
      : ['- All high-priority tasks are complete!'])
  ];

  return lines.join('\n');
}

/**
 * Project Dependency Graph nodes & edges linking Projects -> Tasks -> Knowledge Notes & Blockers.
 */
export interface ProjectGraphNode {
  id: string;
  label: string;
  kind: 'project' | 'task' | 'note';
  color: string;
  done?: boolean;
  priority?: ProjectTask['priority'];
  notePath?: string;
  taskId?: string;
  projectId?: string;
}

export interface ProjectGraphEdge {
  from: string;
  to: string;
  kind: 'belongs' | 'blocks' | 'links';
}

export function buildProjectDependencyGraph(
  tasks: ProjectTask[],
  notes: Note[],
  projects: ProjectItem[]
): { nodes: ProjectGraphNode[]; edges: ProjectGraphEdge[] } {
  const nodes: ProjectGraphNode[] = [];
  const edges: ProjectGraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (n: ProjectGraphNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  projects.forEach(p => {
    addNode({
      id: `proj:${p.id}`,
      label: p.name,
      kind: 'project',
      color: p.color,
      projectId: p.id
    });
  });

  tasks.forEach(t => {
    const proj = projects.find(p => p.id === t.projectId);
    const tNodeId = `task:${t.id}`;
    addNode({
      id: tNodeId,
      label: t.title.replace(/\[\[|\]\]/g, ''),
      kind: 'task',
      color: t.done ? '#10b981' : proj?.color || '#2563eb',
      done: t.done,
      priority: t.priority,
      taskId: t.id,
      projectId: t.projectId,
      notePath: t.linkedNotePath || t.sourcePath
    });

    if (nodeIds.has(`proj:${t.projectId}`)) {
      edges.push({ from: `proj:${t.projectId}`, to: tNodeId, kind: 'belongs' });
    }

    // Dependency / blocker edges
    (t.blockedBy || []).forEach(blockerId => {
      edges.push({ from: `task:${blockerId}`, to: tNodeId, kind: 'blocks' });
    });

    // Knowledge Note edges
    const linkTargets = new Set<string>();
    if (t.linkedNotePath) linkTargets.add(t.linkedNotePath);
    if (t.sourcePath) linkTargets.add(t.sourcePath);
    extractWikilinks(`${t.title} ${t.description || ''}`).forEach(w => {
      const found = notes.find(
        n => n.path.toLowerCase() === w.toLowerCase() || noteBaseName(n.path).toLowerCase() === w.toLowerCase()
      );
      if (found) linkTargets.add(found.path);
    });

    linkTargets.forEach(np => {
      const nNodeId = `note:${np}`;
      addNode({
        id: nNodeId,
        label: noteBaseName(np),
        kind: 'note',
        color: '#a855f7',
        notePath: np
      });
      edges.push({ from: tNodeId, to: nNodeId, kind: 'links' });
    });
  });

  return { nodes, edges };
}

/**
 * Smart Project Templates: auto-generates folder + `_project.md`, `Roadmap.md`, `Kickoff Meeting.md`, `Resources.md`.
 */
export interface SmartTemplateMeta {
  id: ProjectTemplateId;
  name: string;
  description: string;
}

export const SMART_PROJECT_TEMPLATES: SmartTemplateMeta[] = [
  {
    id: 'software-sprint',
    name: 'Software Engineering Sprint',
    description: 'Includes architecture roadmap, sprint kickoff meeting note, QA backlog & live query board.'
  },
  {
    id: 'research-paper',
    name: 'Academic Research Paper',
    description: 'Includes literature review plan, experiment log, citation resources & submission checklist.'
  },
  {
    id: 'product-launch',
    name: 'Product Launch Campaign',
    description: 'Includes GTM roadmap, launch-day checklist, stakeholder meeting notes & asset library.'
  },
  {
    id: 'blank',
    name: 'Minimal Folder Project',
    description: 'Clean _project.md workspace hub ready for custom notes and Markdown tasks.'
  }
];

export function generateSmartProjectFiles(
  projectName: string,
  templateId: ProjectTemplateId,
  deadlineIso?: string
): Array<{ path: string; content: string }> {
  const cleanName = projectName.trim().replace(/[\\/]+/g, '-') || 'New Project';
  const baseDir = `Projects/${cleanName}`;
  const today = new Date().toISOString().slice(0, 10);
  const deadline = deadlineIso || new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  if (templateId === 'blank') {
    return [
      {
        path: `${baseDir}/_project.md`,
        content: buildFolderProjectIndexMarkdown(cleanName, { deadline, color: '#2563eb' })
      }
    ];
  }

  const isResearch = templateId === 'research-paper';
  const isLaunch = templateId === 'product-launch';
  const color = isResearch ? '#7c3aed' : isLaunch ? '#f59e0b' : '#2563eb';

  const indexMd = `---
name: ${cleanName}
status: active
priority: high
deadline: ${deadline}
color: ${color}
tags: [project, ${templateId}]
---
# ${cleanName}

- [[Roadmap]]
- [[Kickoff Meeting]]
- [[Resources]]

## Live Project Board Query
\`\`\`nosidian-query
project: ${cleanName}
limit: 20
\`\`\`
`;

  const roadmapMd = `---
project: ${cleanName}
status: todo
priority: high
due_date: ${deadline}
tags: [roadmap, ${templateId}]
---
# ${cleanName} — Roadmap

## Phase 1: Discovery & Setup
- [ ] Draft architecture & milestone spec in [[Resources]] [priority:: high] [due:: ${today}]
- [ ] Review initial risks and open questions from [[Kickoff Meeting]] [priority:: medium]

## Phase 2: Execution
- [ ] ${isResearch ? 'Complete primary literature synthesis & methodology draft' : isLaunch ? 'Finalize launch landing page copy & demo assets' : 'Implement core vertical slice & unit tests'} [priority:: high] [due:: ${deadline}]
- [ ] ${isResearch ? 'Verify citations and statistical tables' : isLaunch ? 'Coordinate beta tester feedback wave' : 'Run QA pass & resolve #bug tickets'} [priority:: medium]
`;

  const meetingMd = `---
project: ${cleanName}
status: in-progress
tags: [meeting-notes]
---
# Kickoff Meeting — ${cleanName} (${today})

## Attendees & Scope
- Agreed target deadline: **${deadline}**
- Linked specification: [[Roadmap]]

## Action Items
- [ ] Share updated timeline link in [[_project]] [priority:: high] [due:: ${today}]
- [ ] Collect reference materials inside [[Resources]] [priority:: low]
`;

  const resourcesMd = `---
project: ${cleanName}
tags: [resources, reference]
---
# ${cleanName} — Resources & References

- Central hub: [[_project]]
- Active plan: [[Roadmap]]

## Key Links & Notes
- Add PDF highlights, external documentation, and #idea notes here so tag rules can surface them automatically.
`;

  return [
    { path: `${baseDir}/_project.md`, content: indexMd },
    { path: `${baseDir}/Roadmap.md`, content: roadmapMd },
    { path: `${baseDir}/Meeting Notes/Kickoff Meeting.md`, content: meetingMd },
    { path: `${baseDir}/Resources.md`, content: resourcesMd }
  ];
}

/**
 * Live Queries (`nosidian-query` / `query` / `tasks` / `dataview`): parses declarative filters & executes against tasks + notes.
 */
export interface LiveQuerySpec {
  project?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'done' | ProjectTaskStatus;
  tag?: string;
  due?: 'today' | 'overdue' | 'upcoming' | string;
  assignee?: string;
  contains?: string;
  recent?: '24h' | '7d';
  limit: number;
}

export function parseLiveQuerySpec(raw: string): LiveQuerySpec {
  const spec: LiveQuerySpec = { limit: 25 };
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('//') || clean.startsWith('#')) continue;
    const colonIdx = clean.indexOf(':');
    if (colonIdx <= 0) {
      // Bare word treated as keyword search
      spec.contains = spec.contains ? `${spec.contains} ${clean}` : clean;
      continue;
    }
    const key = clean.slice(0, colonIdx).trim().toLowerCase();
    const val = clean.slice(colonIdx + 1).trim();
    if (!val) continue;

    if (key === 'project') spec.project = val;
    else if (key === 'priority') spec.priority = normalizePriority(val);
    else if (key === 'status') {
      const lv = val.toLowerCase();
      spec.status = lv === 'open' ? 'open' : normalizeTaskStatus(lv, lv === 'done');
    } else if (key === 'tag') spec.tag = val.replace(/^#/, '');
    else if (key === 'due') spec.due = val.toLowerCase();
    else if (key === 'assignee') spec.assignee = val;
    else if (key === 'contains' || key === 'search' || key === 'text') spec.contains = val;
    else if (key === 'recent' && (val === '24h' || val === '7d')) spec.recent = val;
    else if (key === 'limit') {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n > 0) spec.limit = Math.min(100, n);
    }
  }

  return spec;
}

function resolveTaskContextNotes(
  task: ProjectTask,
  notes: Note[],
  noteByPath: Map<string, Note>
): Note[] {
  const seen = new Set<string>();
  const matched: Note[] = [];
  const push = (n?: Note) => {
    if (!n || seen.has(n.path)) return;
    seen.add(n.path);
    matched.push(n);
  };
  if (task.sourcePath) push(noteByPath.get(task.sourcePath.toLowerCase()));
  if (task.linkedNotePath) push(noteByPath.get(task.linkedNotePath.toLowerCase()));
  for (const w of extractWikilinks(`${task.title} ${task.description || ''}`)) {
    const lw = w.toLowerCase();
    const found =
      noteByPath.get(lw) ||
      notes.find(n => noteBaseName(n.path).toLowerCase() === lw || n.path.toLowerCase() === lw);
    push(found);
  }
  return matched;
}

export function evaluateLiveTaskQuery(
  spec: LiveQuerySpec,
  allTasks: ProjectTask[],
  notes: Note[],
  projects: ProjectItem[],
  now = Date.now()
): ProjectTask[] {
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const noteByPath = new Map(notes.map(n => [n.path.toLowerCase(), n]));

  const filtered = allTasks.filter(task => {
    if (spec.project) {
      const proj = projects.find(p => p.id === task.projectId);
      const q = spec.project.toLowerCase();
      if (
        task.projectId.toLowerCase() !== q &&
        (!proj || !proj.name.toLowerCase().includes(q))
      ) {
        return false;
      }
    }

    if (spec.priority && task.priority !== spec.priority) return false;

    if (spec.status) {
      if (spec.status === 'open') {
        if (task.done || task.status === 'done') return false;
      } else {
        const st = normalizeTaskStatus(task.status, task.done);
        if (st !== spec.status) return false;
      }
    }

    if (spec.tag) {
      const targetTag = spec.tag.toLowerCase();
      const inTaskTags = (task.tags || []).some(tg => tg.toLowerCase() === targetTag);
      const inTitle = task.title.toLowerCase().includes(`#${targetTag}`);
      if (!inTaskTags && !inTitle) return false;
    }

    if (spec.assignee) {
      if (!(task.assignee || '').toLowerCase().includes(spec.assignee.toLowerCase())) return false;
    }

    if (spec.due) {
      if (!task.dueDate) return false;
      if (spec.due === 'today' && task.dueDate !== todayIso) return false;
      else if (spec.due === 'overdue' && !(task.dueDate < todayIso && !task.done)) return false;
      else if (spec.due === 'upcoming' && task.dueDate < todayIso) return false;
      else if (
        spec.due !== 'today' &&
        spec.due !== 'overdue' &&
        spec.due !== 'upcoming' &&
        task.dueDate !== spec.due
      ) {
        return false;
      }
    }

    const ctxNotes = spec.recent || spec.contains ? resolveTaskContextNotes(task, notes, noteByPath) : [];

    if (spec.recent) {
      const windowMs = spec.recent === '24h' ? 86400000 : 7 * 86400000;
      const latestNoteTs = ctxNotes.reduce(
        (m, n) => Math.max(m, n.updatedAt ?? n.createdAt ?? 0),
        0
      );
      const ts = latestNoteTs || task.createdAt;
      if (now - ts > windowMs) return false;
    }

    if (spec.contains) {
      const q = spec.contains.toLowerCase();
      const notesText = ctxNotes.map(n => `${n.path} ${n.content}`).join(' ');
      const haystack = `${task.title} ${task.description || ''} ${(task.tags || []).join(' ')} ${notesText}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  return filtered.slice(0, spec.limit);
}

export function filterTasksWithFileContext(
  tasks: ProjectTask[],
  notes: Note[],
  opts: {
    keyword: string;
    recentWindow: 'all' | '24h' | '7d';
    sourceFilter: 'all' | 'synced' | 'manual';
  },
  now = Date.now()
): ProjectTask[] {
  const kw = opts.keyword.trim().toLowerCase();
  const noteMap = new Map(notes.map(n => [n.path.toLowerCase(), n]));

  return tasks.filter(task => {
    if (opts.sourceFilter === 'synced' && task.sourceType !== 'markdown-checkbox' && task.sourceType !== 'note-card' && task.sourceType !== 'tag-rule') {
      return false;
    }
    if (opts.sourceFilter === 'manual' && task.sourceType && task.sourceType !== 'manual') {
      return false;
    }

    const ctxNotes = resolveTaskContextNotes(task, notes, noteMap);

    if (opts.recentWindow !== 'all') {
      const cutoff = now - (opts.recentWindow === '24h' ? 86400000 : 7 * 86400000);
      const latestNoteTs = ctxNotes.reduce(
        (m, n) => Math.max(m, n.updatedAt ?? n.createdAt ?? 0),
        0
      );
      const ts = latestNoteTs || task.createdAt;
      if (ts < cutoff) return false;
    }

    if (kw) {
      const notesText = ctxNotes.map(n => `${n.path} ${n.content}`).join(' ');
      const haystack = `${task.title} ${task.description || ''} ${task.assignee || ''} ${(task.tags || []).join(' ')} ${notesText}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    return true;
  });
}
