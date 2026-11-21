//! App-wide configuration stored in the OS config folder (not in a vault):
//! chosen language, onboarding progress, appearance, accessibility, and the
//! active/recent vaults. This is what lets later launches skip onboarding and
//! reopen the last vault.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::fsutil::{read_json_tolerant, write_json_atomic, ReadOutcome};
use crate::modules::{self, ExperienceLevel, ModuleId};

pub const CONFIG_FILE: &str = "config.json";
pub const CONFIG_SCHEMA_VERSION: u32 = 1;
pub const MAX_RECENT_VAULTS: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeId {
    #[default]
    ObsidianSlate,
    MidnightCarbon,
    NordArctic,
    CatppuccinMocha,
    PaperDaylight,
    WarmParchment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum UseCase {
    StudyLanguages,
    Writing,
    ProjectsCoding,
    #[default]
    General,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum RadiusScale {
    Sharp,
    #[default]
    Balanced,
    Soft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Density {
    Compact,
    #[default]
    Comfortable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Appearance {
    pub theme: ThemeId,
    /// CSS hex color, e.g. `#8b7cf6`.
    pub accent: String,
    /// Backdrop blur radius in px (0–40).
    pub glass_blur: u8,
    /// Surface opacity for glass panels (0.2–0.95).
    pub glass_opacity: f32,
    pub ambient_mesh: bool,
    pub radius: RadiusScale,
    pub density: Density,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: ThemeId::default(),
            accent: "#8b7cf6".into(),
            glass_blur: 18,
            glass_opacity: 0.62,
            ambient_mesh: true,
            radius: RadiusScale::default(),
            density: Density::default(),
        }
    }
}

impl Appearance {
    fn clamp(&mut self) {
        self.glass_blur = self.glass_blur.min(40);
        if !self.glass_opacity.is_finite() {
            self.glass_opacity = Appearance::default().glass_opacity;
        }
        self.glass_opacity = self.glass_opacity.clamp(0.2, 0.95);
        if !is_hex_color(&self.accent) {
            self.accent = Appearance::default().accent;
        }
    }
}

fn is_hex_color(s: &str) -> bool {
    let h = s.strip_prefix('#').unwrap_or("");
    (h.len() == 6 || h.len() == 3) && h.chars().all(|c| c.is_ascii_hexdigit())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Accessibility {
    /// Screen reader / accessibility mode: the app speaks with offline system voices.
    pub screen_reader_mode: bool,
    pub reduce_motion: bool,
    pub speech_cues: bool,
    pub sound_cues: bool,
    /// Speech rate multiplier for the built-in voice (0.5 to 2.0).
    pub speech_rate: f32,
}

impl Default for Accessibility {
    fn default() -> Self {
        Self { screen_reader_mode: false, reduce_motion: false, speech_cues: false, sound_cues: false, speech_rate: 1.0 }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Onboarding {
    pub completed: bool,
    /// Last step reached (1-based), so an interrupted wizard resumes.
    pub step: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultRef {
    pub path: PathBuf,
    pub name: String,
    /// Unix time in milliseconds.
    pub last_opened: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub schema_version: u32,
    /// BCP-47 tag such as `fa` or `pt-BR`. `None` until the user picks one in
    /// onboarding step 1.
    pub language: Option<String>,
    pub onboarding: Onboarding,
    pub experience_level: ExperienceLevel,
    pub use_case: UseCase,
    pub appearance: Appearance,
    pub accessibility: Accessibility,
    pub pet_enabled: bool,
    pub ambient_effects_enabled: bool,
    pub module_overrides: BTreeMap<ModuleId, bool>,
    pub active_vault: Option<PathBuf>,
    pub recent_vaults: Vec<VaultRef>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_SCHEMA_VERSION,
            language: None,
            onboarding: Onboarding::default(),
            experience_level: ExperienceLevel::default(),
            use_case: UseCase::default(),
            appearance: Appearance::default(),
            accessibility: Accessibility::default(),
            pet_enabled: true,
            ambient_effects_enabled: true,
            module_overrides: BTreeMap::new(),
            active_vault: None,
            recent_vaults: Vec::new(),
        }
    }
}

impl AppConfig {
    /// Fix out-of-range values so a hand-edited or older file can't break the UI.
    pub fn normalize(&mut self) {
        self.schema_version = CONFIG_SCHEMA_VERSION;
        self.appearance.clamp();
        let r = self.accessibility.speech_rate;
        self.accessibility.speech_rate = if r.is_finite() { r.clamp(0.5, 2.0) } else { 1.0 };
        if let Some(lang) = &self.language {
            if !crate_supported_language(lang) {
                self.language = None;
            }
        }
        self.recent_vaults.truncate(MAX_RECENT_VAULTS);
    }

    pub fn enabled_modules(&self) -> std::collections::BTreeSet<ModuleId> {
        modules::effective(self.experience_level, &self.module_overrides)
    }

    /// Mark a vault as active and move it to the front of the recent list.
    pub fn touch_vault(&mut self, path: &Path, name: &str, now_ms: u64) {
        self.recent_vaults.retain(|v| v.path != path);
        self.recent_vaults.insert(
            0,
            VaultRef {
                path: path.to_path_buf(),
                name: name.to_string(),
                last_opened: now_ms,
            },
        );
        self.recent_vaults.truncate(MAX_RECENT_VAULTS);
        self.active_vault = Some(path.to_path_buf());
    }
}

/// The 14 supported UI languages.
pub const SUPPORTED_LANGUAGES: [&str; 14] = [
    "en", "fa", "ar", "fr", "de", "es", "pt-BR", "zh", "ja", "ko", "ru", "tr", "it", "hi",
];

fn crate_supported_language(tag: &str) -> bool {
    SUPPORTED_LANGUAGES.contains(&tag)
}

/// Loads and saves [`AppConfig`] in a given folder.
#[derive(Debug, Clone)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(config_dir: impl Into<PathBuf>) -> Self {
        Self {
            path: config_dir.into().join(CONFIG_FILE),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Load config; a missing or corrupt file yields defaults (a corrupt one
    /// is kept beside it as a backup).
    pub fn load(&self) -> CoreResult<AppConfig> {
        let mut cfg = match read_json_tolerant::<AppConfig>(&self.path)? {
            ReadOutcome::Loaded(c) => c,
            ReadOutcome::Missing | ReadOutcome::Recovered { .. } => AppConfig::default(),
        };
        cfg.normalize();
        Ok(cfg)
    }

    pub fn save(&self, cfg: &AppConfig) -> CoreResult<AppConfig> {
        let mut cfg = cfg.clone();
        cfg.normalize();
        write_json_atomic(&self.path, &cfg)?;
        Ok(cfg)
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;

    #[test]
    fn defaults_then_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path());
        let mut cfg = store.load().unwrap();
        assert_eq!(cfg, AppConfig::default());
        assert!(cfg.language.is_none());
        assert!(!cfg.onboarding.completed);

        cfg.language = Some("fa".into());
        cfg.onboarding.completed = true;
        store.save(&cfg).unwrap();
        let back = store.load().unwrap();
        assert_eq!(back.language.as_deref(), Some("fa"));
        assert!(back.onboarding.completed);
    }

    #[test]
    fn normalize_fixes_bad_values() {
        let mut cfg = AppConfig::default();
        cfg.language = Some("xx".into());
        cfg.appearance.glass_opacity = 9.0;
        cfg.appearance.glass_blur = 200;
        cfg.appearance.accent = "red; background:url(x)".into();
        cfg.normalize();
        assert!(cfg.language.is_none());
        assert_eq!(cfg.appearance.glass_opacity, 0.95);
        assert_eq!(cfg.appearance.glass_blur, 40);
        assert_eq!(cfg.appearance.accent, Appearance::default().accent);
    }

    #[test]
    fn unknown_and_missing_fields_are_tolerated() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(CONFIG_FILE),
            r#"{"language":"de","futureField":42}"#,
        )
        .unwrap();
        let cfg = ConfigStore::new(dir.path()).load().unwrap();
        assert_eq!(cfg.language.as_deref(), Some("de"));
        assert_eq!(cfg.appearance, Appearance::default());
    }

    #[test]
    fn touch_vault_dedupes_and_orders() {
        let mut cfg = AppConfig::default();
        cfg.touch_vault(Path::new("/a"), "A", 1);
        cfg.touch_vault(Path::new("/b"), "B", 2);
        cfg.touch_vault(Path::new("/a"), "A", 3);
        let names: Vec<_> = cfg.recent_vaults.iter().map(|v| v.name.as_str()).collect();
        assert_eq!(names, ["A", "B"]);
        assert_eq!(cfg.active_vault.as_deref(), Some(Path::new("/a")));
    }
}
