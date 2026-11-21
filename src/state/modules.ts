// Same rules as crates/nosidian-core/src/modules.rs, used for instant UI
// feedback; the Rust side remains authoritative.
import type { ExperienceLevel, ModuleId } from "./types";

const RANK: Record<ExperienceLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export const MODULE_MIN_LEVEL: Record<ModuleId, ExperienceLevel> = {
  "daily-calendar": "beginner",
  "recent-files": "beginner",
  "pdf-support": "beginner",
  "zen-focus": "beginner",
  "ambient-effects": "beginner",
  "companion-pet": "beginner",
  dashboard: "intermediate",
  flashcards: "intermediate",
  "media-shelf": "intermediate",
  "knowledge-graph": "intermediate",
  mindmap: "intermediate",
  kanban: "intermediate",
  slides: "intermediate",
  "project-mode": "advanced",
  "dependency-graph": "advanced",
  "integrated-terminal": "advanced",
  "mcp-bridge": "advanced",
  "developer-extensions": "advanced",
  "advanced-ribbon-tools": "advanced",
};

export function enabledModules(
  level: ExperienceLevel,
  overrides: Partial<Record<ModuleId, boolean>>,
): Set<ModuleId> {
  const set = new Set<ModuleId>();
  for (const [id, min] of Object.entries(MODULE_MIN_LEVEL) as [ModuleId, ExperienceLevel][]) {
    if (RANK[min] <= RANK[level]) set.add(id);
  }
  for (const [id, on] of Object.entries(overrides) as [ModuleId, boolean][]) {
    if (on) set.add(id);
    else set.delete(id);
  }
  return set;
}
