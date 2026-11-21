//! Platform-independent core of NoSidian.
//!
//! Everything in this crate is plain Rust with no UI or Tauri dependency, so it
//! runs the same on desktop and mobile and is fully unit-testable.

pub mod config;
pub mod error;
pub mod fsutil;
pub mod modules;
pub mod profile;
pub mod vault;

pub use config::{AppConfig, ConfigStore};
pub use error::{CoreError, CoreResult};
pub use modules::{ExperienceLevel, ModuleId};
pub use profile::VaultWorkspaceProfile;
pub use vault::{Vault, VaultMeta};

/// Name of the hidden per-vault data folder.
pub const VAULT_DATA_DIR: &str = ".nosidian";
