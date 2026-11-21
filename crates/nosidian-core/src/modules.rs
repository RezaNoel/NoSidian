//! Feature modules and the experience-level presets that decide which are
//! visible by default. Users can override any module individually.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ExperienceLevel {
    Beginner,
    #[default]
    Intermediate,
    Advanced,
}

/// Every toggleable module in the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModuleId {
    Dashboard,
    Flashcards,
    MediaShelf,
    KnowledgeGraph,
    Mindmap,
    Kanban,
    Slides,
    DailyCalendar,
    RecentFiles,
    PdfSupport,
    ZenFocus,
    AmbientEffects,
    CompanionPet,
    ProjectMode,
    DependencyGraph,
    IntegratedTerminal,
    McpBridge,
    DeveloperExtensions,
    AdvancedRibbonTools,
}

impl ModuleId {
    pub const ALL: [ModuleId; 19] = [
        ModuleId::Dashboard,
        ModuleId::Flashcards,
        ModuleId::MediaShelf,
        ModuleId::KnowledgeGraph,
        ModuleId::Mindmap,
        ModuleId::Kanban,
        ModuleId::Slides,
        ModuleId::DailyCalendar,
        ModuleId::RecentFiles,
        ModuleId::PdfSupport,
        ModuleId::ZenFocus,
        ModuleId::AmbientEffects,
        ModuleId::CompanionPet,
        ModuleId::ProjectMode,
        ModuleId::DependencyGraph,
        ModuleId::IntegratedTerminal,
        ModuleId::McpBridge,
        ModuleId::DeveloperExtensions,
        ModuleId::AdvancedRibbonTools,
    ];

    /// Lowest experience level at which this module is on by default.
    pub fn min_level(self) -> ExperienceLevel {
        use ModuleId::*;
        match self {
            // Calm essentials: writing, reading, PDFs, daily notes, focus.
            DailyCalendar | RecentFiles | PdfSupport | ZenFocus | AmbientEffects
            | CompanionPet => ExperienceLevel::Beginner,
            // Core PKM and study tools.
            Dashboard | Flashcards | MediaShelf | KnowledgeGraph | Mindmap | Kanban | Slides => {
                ExperienceLevel::Intermediate
            }
            // Power and developer surfaces.
            ProjectMode | DependencyGraph | IntegratedTerminal | McpBridge
            | DeveloperExtensions | AdvancedRibbonTools => ExperienceLevel::Advanced,
        }
    }
}

/// Modules enabled by default for an experience level.
pub fn preset(level: ExperienceLevel) -> BTreeSet<ModuleId> {
    ModuleId::ALL
        .into_iter()
        .filter(|m| m.min_level() <= level)
        .collect()
}

/// Effective module set: the level preset with the user's explicit overrides
/// applied on top.
pub fn effective(level: ExperienceLevel, overrides: &BTreeMap<ModuleId, bool>) -> BTreeSet<ModuleId> {
    let mut set = preset(level);
    for (m, on) in overrides {
        if *on {
            set.insert(*m);
        } else {
            set.remove(m);
        }
    }
    set
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_are_nested() {
        let b = preset(ExperienceLevel::Beginner);
        let i = preset(ExperienceLevel::Intermediate);
        let a = preset(ExperienceLevel::Advanced);
        assert!(b.is_subset(&i) && i.is_subset(&a));
        assert_eq!(a.len(), ModuleId::ALL.len());
        assert!(!b.contains(&ModuleId::McpBridge));
        assert!(!b.contains(&ModuleId::IntegratedTerminal));
        assert!(!i.contains(&ModuleId::ProjectMode));
    }

    #[test]
    fn overrides_win() {
        let mut o = BTreeMap::new();
        o.insert(ModuleId::IntegratedTerminal, true);
        o.insert(ModuleId::CompanionPet, false);
        let e = effective(ExperienceLevel::Beginner, &o);
        assert!(e.contains(&ModuleId::IntegratedTerminal));
        assert!(!e.contains(&ModuleId::CompanionPet));
    }

    #[test]
    fn serde_names_are_kebab_case() {
        assert_eq!(
            serde_json::to_string(&ModuleId::McpBridge).unwrap(),
            "\"mcp-bridge\""
        );
    }
}
