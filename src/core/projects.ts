import type { ProjectItem, ProjectModeState, ProjectTask, SprintItem } from './types';

export interface ProgressStats {
  total: number;
  done: number;
  percent: number;
}

export interface DeadlineCountdown {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  label: string;
  urgency: 'calm' | 'soon' | 'critical' | 'overdue';
}

export function createDefaultProjectModeState(now = Date.now()): ProjectModeState {
  const in14Days = new Date(now + 14 * 86400000).toISOString().slice(0, 10);
  const in30Days = new Date(now + 30 * 86400000).toISOString().slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);

  const p1: ProjectItem = {
    id: 'proj-main',
    name: 'Knowledge Vault Launch',
    description: 'Core notes, active recall deck, and structured knowledge milestones.',
    color: '#2563eb',
    deadline: in14Days,
    isPrimary: true,
    status: 'active',
    createdAt: now
  };

  const p2: ProjectItem = {
    id: 'proj-lang',
    name: 'Language Fluency Track',
    description: 'Daily immersion reading + SRS multi-line flashcard deck.',
    color: '#10b981',
    deadline: in30Days,
    isPrimary: false,
    status: 'active',
    createdAt: now
  };

  const s1: SprintItem = {
    id: 'sprint-1',
    projectId: p1.id,
    name: 'Sprint 1 — Architecture & Decks',
    startDate: today,
    endDate: in14Days,
    goal: 'Complete foundational notes and 25 core recall cards',
    status: 'active'
  };

  const tasks: ProjectTask[] = [
    {
      id: 'task-1',
      projectId: p1.id,
      sprintId: s1.id,
      title: 'Organize evergreen notes & folder colors',
      done: true,
      priority: 'high',
      dueDate: in14Days,
      createdAt: now
    },
    {
      id: 'task-2',
      projectId: p1.id,
      sprintId: s1.id,
      title: 'Build multi-line ?? +++ study deck',
      done: false,
      priority: 'high',
      dueDate: in14Days,
      createdAt: now
    },
    {
      id: 'task-3',
      projectId: p1.id,
      sprintId: s1.id,
      title: 'Configure Daily Note template & dashboard shortcuts',
      done: false,
      priority: 'medium',
      createdAt: now
    },
    {
      id: 'task-4',
      projectId: p2.id,
      title: 'Attach pronunciation audio clips to vocabulary cards',
      done: false,
      priority: 'medium',
      dueDate: in30Days,
      createdAt: now
    }
  ];

  return {
    projects: [p1, p2],
    sprints: [s1],
    tasks,
    spotlightEnabled: true,
    spotlightProjectId: p1.id,
    tagRules: [
      {
        id: 'rule-bug',
        tag: 'bug',
        targetProjectId: p1.id,
        targetColumn: 'backlog',
        priority: 'high',
        enabled: true
      },
      {
        id: 'rule-idea',
        tag: 'idea',
        targetProjectId: p1.id,
        targetColumn: 'inbox',
        priority: 'medium',
        enabled: true
      }
    ]
  };
}

export function computeTaskProgress(tasks: ProjectTask[]): ProgressStats {
  const total = tasks.length;
  if (total === 0) return { total: 0, done: 0, percent: 0 };
  const done = tasks.filter(t => t.done).length;
  return {
    total,
    done,
    percent: Math.round((done / total) * 100)
  };
}

export function computeProjectProgress(
  projectId: string,
  tasks: ProjectTask[]
): ProgressStats {
  return computeTaskProgress(tasks.filter(t => t.projectId === projectId));
}

export function computeSprintProgress(
  sprintId: string,
  tasks: ProjectTask[]
): ProgressStats {
  return computeTaskProgress(tasks.filter(t => t.sprintId === sprintId));
}

export function computePrimaryProjectProgress(state: ProjectModeState): {
  primaryProject: ProjectItem | null;
  primaryStats: ProgressStats;
  overallStats: ProgressStats;
} {
  const primaryProject =
    state.projects.find(p => p.id === state.spotlightProjectId) ||
    state.projects.find(p => p.isPrimary) ||
    state.projects[0] ||
    null;

  const primaryStats = primaryProject
    ? computeProjectProgress(primaryProject.id, state.tasks)
    : { total: 0, done: 0, percent: 0 };

  const overallStats = computeTaskProgress(state.tasks);
  return { primaryProject, primaryStats, overallStats };
}

export function computeDeadlineCountdown(
  isoDate: string | undefined,
  now = Date.now()
): DeadlineCountdown | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const target = new Date(`${isoDate.slice(0, 10)}T23:59:59`).getTime();
  if (Number.isNaN(target)) return null;

  const diffMs = target - now;
  const expired = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let urgency: DeadlineCountdown['urgency'] = 'calm';
  if (expired) urgency = 'overdue';
  else if (days <= 2) urgency = 'critical';
  else if (days <= 7) urgency = 'soon';

  const label = expired
    ? `Overdue ${days}d ${hours}h`
    : `${days}d ${hours}h ${minutes}m`;

  return { expired, days, hours, minutes, label, urgency };
}
