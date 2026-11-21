//! Per-vault workspace profile (`.nosidian/workspace.json`): layout, panel
//! visibility and sidebar widths, restored on every vault switch.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::fsutil::{read_json_tolerant, write_json_atomic, ReadOutcome};
use crate::VAULT_DATA_DIR;

pub const PROFILE_FILE: &str = "workspace.json";

pub const SIDEBAR_MIN: u16 = 200;
pub const SIDEBAR_MAX: u16 = 560;
pub const LEFT_DEFAULT: u16 = 280;
pub const RIGHT_DEFAULT: u16 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum FocusProfile {
    CleanMinimal,
    DeepWriting,
    ReviewQuiz,
    #[default]
    FullStudio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ViewMode {
    #[default]
    Editor,
    Split,
    Reader,
    Mindmap,
    Kanban,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LeftTab {
    #[default]
    Files,
    Recent,
    Search,
    Tags,
    Starred,
    Calendar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum RightTab {
    #[default]
    Links,
    Outline,
    Focus,
    History,
    Srs,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PanelVisibility {
    pub ribbon: bool,
    pub left: bool,
    pub right: bool,
    pub status_bar: bool,
}

impl Default for PanelVisibility {
    fn default() -> Self {
        Self {
            ribbon: true,
            left: true,
            right: true,
            status_bar: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VaultWorkspaceProfile {
    pub focus_profile: FocusProfile,
    pub view_mode: ViewMode,
    pub panels: PanelVisibility,
    pub left_tab: LeftTab,
    pub right_tab: RightTab,
    pub left_width: u16,
    pub right_width: u16,
    /// Free-form UI button preferences (pinned toolbar buttons etc.).
    pub ui_buttons: BTreeMap<String, bool>,
}

impl Default for VaultWorkspaceProfile {
    fn default() -> Self {
        Self {
            focus_profile: FocusProfile::default(),
            view_mode: ViewMode::default(),
            panels: PanelVisibility::default(),
            left_tab: LeftTab::default(),
            right_tab: RightTab::default(),
            left_width: LEFT_DEFAULT,
            right_width: RIGHT_DEFAULT,
            ui_buttons: BTreeMap::new(),
        }
    }
}

impl VaultWorkspaceProfile {
    pub fn normalize(&mut self) {
        self.left_width = self.left_width.clamp(SIDEBAR_MIN, SIDEBAR_MAX);
        self.right_width = self.right_width.clamp(SIDEBAR_MIN, SIDEBAR_MAX);
    }

    pub fn load(vault_root: &Path) -> CoreResult<Self> {
        let path = vault_root.join(VAULT_DATA_DIR).join(PROFILE_FILE);
        let mut p = match read_json_tolerant::<Self>(&path)? {
            ReadOutcome::Loaded(p) => p,
            _ => Self::default(),
        };
        p.normalize();
        Ok(p)
    }

    pub fn save(&self, vault_root: &Path) -> CoreResult<Self> {
        let mut p = self.clone();
        p.normalize();
        write_json_atomic(&vault_root.join(VAULT_DATA_DIR).join(PROFILE_FILE), &p)?;
        Ok(p)
    }
}

#[cfg(test)]
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;

    #[test]
    fn widths_are_clamped_and_persisted() {
        let dir = tempfile::tempdir().unwrap();
        let mut p = VaultWorkspaceProfile::default();
        p.left_width = 5;
        p.right_width = 9000;
        p.right_tab = RightTab::Srs;
        let saved = p.save(dir.path()).unwrap();
        assert_eq!(saved.left_width, SIDEBAR_MIN);
        assert_eq!(saved.right_width, SIDEBAR_MAX);
        let loaded = VaultWorkspaceProfile::load(dir.path()).unwrap();
        assert_eq!(loaded, saved);
    }
}
