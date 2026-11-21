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
    /// Open tabs (vault-relative paths) and the active one.
    pub open_tabs: Vec<String>,
    pub active_tab: Option<String>,
    /// Starred notes.
    pub starred: Vec<String>,
    /// Recently opened notes, newest first, with unix-ms timestamps.
    pub recent: Vec<RecentEntry>,
    /// Folders the user collapsed in the explorer.
    pub collapsed_folders: Vec<String>,
    /// Explorer sort mode.
    pub sort: SortMode,
    /// Per-note view mode overrides (path -> mode).
    pub note_modes: BTreeMap<String, ViewMode>,
    /// Image banner above the file explorer.
    pub banner: BannerConfig,
}

/// Banner above the explorer. `image` is a preset id (`carbon`, `language`,
/// `writer`, `observatory`) or `asset:<name>` for an uploaded image stored in
/// `.nosidian/assets/`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BannerConfig {
    pub enabled: bool,
    pub image: String,
    pub height: u16,
    pub pos_y: u8,
    pub opacity: u8,
}

impl Default for BannerConfig {
    fn default() -> Self {
        Self { enabled: false, image: "carbon".into(), height: 96, pos_y: 50, opacity: 90 }
    }
}

pub const BANNER_MIN_HEIGHT: u16 = 48;
pub const BANNER_MAX_HEIGHT: u16 = 220;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub opened_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SortMode {
    #[default]
    NameAsc,
    NameDesc,
    ModifiedNew,
    ModifiedOld,
    CreatedNew,
    CreatedOld,
}

pub const MAX_RECENT: usize = 50;
pub const MAX_TABS: usize = 30;

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
            open_tabs: Vec::new(),
            active_tab: None,
            starred: Vec::new(),
            recent: Vec::new(),
            collapsed_folders: Vec::new(),
            sort: SortMode::default(),
            note_modes: BTreeMap::new(),
            banner: BannerConfig::default(),
        }
    }
}

impl VaultWorkspaceProfile {
    pub fn normalize(&mut self) {
        self.left_width = self.left_width.clamp(SIDEBAR_MIN, SIDEBAR_MAX);
        self.right_width = self.right_width.clamp(SIDEBAR_MIN, SIDEBAR_MAX);
        self.recent.truncate(MAX_RECENT);
        self.banner.height = self.banner.height.clamp(BANNER_MIN_HEIGHT, BANNER_MAX_HEIGHT);
        self.banner.pos_y = self.banner.pos_y.min(100);
        self.banner.opacity = self.banner.opacity.clamp(20, 100);
        self.open_tabs.dedup();
        self.open_tabs.truncate(MAX_TABS);
        if let Some(a) = &self.active_tab {
            if !self.open_tabs.contains(a) {
                self.active_tab = self.open_tabs.first().cloned();
            }
        }
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
        p.banner.height = 9;
        p.banner.opacity = 0;
        let saved = p.save(dir.path()).unwrap();
        assert_eq!(saved.left_width, SIDEBAR_MIN);
        assert_eq!(saved.right_width, SIDEBAR_MAX);
        assert_eq!(saved.banner.height, BANNER_MIN_HEIGHT);
        assert_eq!(saved.banner.opacity, 20);
        let loaded = VaultWorkspaceProfile::load(dir.path()).unwrap();
        assert_eq!(loaded, saved);
    }
}
