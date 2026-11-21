//! Vaults: a plain folder of `.md`/`.pdf` files plus a hidden `.nosidian/`
//! folder for app data. The Markdown files are always the source of truth.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::fsutil::{read_json_tolerant, write_json_atomic, ReadOutcome};
use crate::VAULT_DATA_DIR;

pub const VAULT_META_FILE: &str = "vault.json";

/// Metadata stored in `.nosidian/vault.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMeta {
    /// Stable id, kept across renames/moves (groundwork for future sync).
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub format_version: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub root: PathBuf,
    pub meta: VaultMeta,
}

/// Characters not allowed in folder names on Windows, macOS or Linux.
const FORBIDDEN: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const RESERVED_WINDOWS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Validate a user-typed vault name and turn it into a safe folder name.
/// Non-Latin names (Persian, Chinese…) are kept as-is.
pub fn sanitize_vault_name(name: &str) -> CoreResult<String> {
    let cleaned: String = name
        .trim()
        .chars()
        .filter(|c| !c.is_control() && !FORBIDDEN.contains(c))
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    if cleaned.is_empty()
        || cleaned.starts_with('.')
        || cleaned.chars().count() > 120
        || RESERVED_WINDOWS
            .iter()
            .any(|r| r.eq_ignore_ascii_case(cleaned.split('.').next().unwrap_or("")))
    {
        return Err(CoreError::InvalidVaultName);
    }
    Ok(cleaned)
}

impl Vault {
    fn data_dir(root: &Path) -> PathBuf {
        root.join(VAULT_DATA_DIR)
    }

    /// Create `<parent>/<name>/` as a new, empty vault.
    pub fn create(parent: &Path, name: &str, now_ms: u64) -> CoreResult<Vault> {
        let folder = sanitize_vault_name(name)?;
        if !parent.is_dir() {
            return Err(CoreError::NotFound(parent.to_path_buf()));
        }
        let root = parent.join(&folder);
        if root.exists() {
            return Err(CoreError::AlreadyExists(root));
        }
        fs::create_dir_all(Self::data_dir(&root)).map_err(|e| CoreError::io(&root, e))?;
        let meta = VaultMeta {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.trim().to_string(),
            created_at: now_ms,
            format_version: 1,
        };
        write_json_atomic(&Self::data_dir(&root).join(VAULT_META_FILE), &meta)?;
        Ok(Vault { root, meta })
    }

    /// Open any existing folder as a vault, adding `.nosidian/` if missing.
    /// Existing files are never modified.
    pub fn open(root: &Path, now_ms: u64) -> CoreResult<Vault> {
        if !root.exists() {
            return Err(CoreError::NotFound(root.to_path_buf()));
        }
        if !root.is_dir() {
            return Err(CoreError::NotADirectory(root.to_path_buf()));
        }
        let meta_path = Self::data_dir(root).join(VAULT_META_FILE);
        let meta = match read_json_tolerant::<VaultMeta>(&meta_path)? {
            ReadOutcome::Loaded(m) => m,
            ReadOutcome::Missing | ReadOutcome::Recovered { .. } => {
                let name = root
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Vault".into());
                let meta = VaultMeta {
                    id: uuid::Uuid::new_v4().to_string(),
                    name,
                    created_at: now_ms,
                    format_version: 1,
                };
                write_json_atomic(&meta_path, &meta)?;
                meta
            }
        };
        Ok(Vault {
            root: root.to_path_buf(),
            meta,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_rules() {
        assert_eq!(sanitize_vault_name("  My Notes  ").unwrap(), "My Notes");
        assert_eq!(sanitize_vault_name("یادداشت‌ها").unwrap(), "یادداشت‌ها");
        assert_eq!(sanitize_vault_name("a/b:c").unwrap(), "abc");
        assert!(sanitize_vault_name("   ").is_err());
        assert!(sanitize_vault_name(".hidden").is_err());
        assert!(sanitize_vault_name("con").is_err());
        assert!(sanitize_vault_name("nul.txt").is_err());
        assert_eq!(sanitize_vault_name("notes...").unwrap(), "notes");
    }

    #[test]
    fn create_then_open_keeps_id() {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::create(dir.path(), "Study", 1).unwrap();
        assert!(v.root.join(VAULT_DATA_DIR).join(VAULT_META_FILE).exists());
        let again = Vault::open(&v.root, 2).unwrap();
        assert_eq!(again.meta.id, v.meta.id);
        assert!(matches!(
            Vault::create(dir.path(), "Study", 3),
            Err(CoreError::AlreadyExists(_))
        ));
    }

    #[test]
    fn open_plain_folder_adds_data_dir_only() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("note.md"), "# hi").unwrap();
        let v = Vault::open(dir.path(), 5).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("note.md")).unwrap(), "# hi");
        assert!(dir.path().join(VAULT_DATA_DIR).is_dir());
        assert_eq!(v.meta.created_at, 5);
    }

    #[test]
    fn open_errors() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("f.md");
        fs::write(&f, "").unwrap();
        assert!(matches!(Vault::open(&f, 0), Err(CoreError::NotADirectory(_))));
        assert!(matches!(
            Vault::open(&dir.path().join("nope"), 0),
            Err(CoreError::NotFound(_))
        ));
    }
}
