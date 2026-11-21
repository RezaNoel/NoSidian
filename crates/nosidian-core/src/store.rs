//! Small JSON documents owned by NoSidian features (flashcard state,
//! dashboards, projects, media shelf, plugins...). Vault documents live in
//! `.nosidian/<name>.json` so they travel with the vault; app documents live
//! in the OS config folder.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use crate::fsutil::{read_json_tolerant, write_json_atomic, ReadOutcome};
use crate::VAULT_DATA_DIR;

/// Cap per document so a runaway feature can't fill the disk.
pub const MAX_STORE_BYTES: usize = 16 * 1024 * 1024;

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn doc_path(dir: &Path, name: &str) -> CoreResult<PathBuf> {
    if !valid_name(name) {
        return Err(CoreError::InvalidPath(name.to_string()));
    }
    Ok(dir.join(format!("{name}.json")))
}

/// Read a document from `dir`; missing or corrupt files read as `null`.
pub fn read_doc(dir: &Path, name: &str) -> CoreResult<Value> {
    let path = doc_path(dir, name)?;
    Ok(match read_json_tolerant::<Value>(&path)? {
        ReadOutcome::Loaded(v) => v,
        ReadOutcome::Missing | ReadOutcome::Recovered { .. } => Value::Null,
    })
}

pub fn write_doc(dir: &Path, name: &str, value: &Value) -> CoreResult<()> {
    let path = doc_path(dir, name)?;
    let size = serde_json::to_vec(value).map(|b| b.len()).unwrap_or(usize::MAX);
    if size > MAX_STORE_BYTES {
        return Err(CoreError::InvalidPath(name.to_string()));
    }
    write_json_atomic(&path, value)
}

pub fn vault_dir(root: &Path) -> PathBuf {
    root.join(VAULT_DATA_DIR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_names() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_doc(dir.path(), "srs").unwrap(), Value::Null);
        write_doc(dir.path(), "srs", &serde_json::json!({"a": 1})).unwrap();
        assert_eq!(read_doc(dir.path(), "srs").unwrap()["a"], 1);
        for bad in ["", "../x", "A", "a.b", "a/b"] {
            assert!(write_doc(dir.path(), bad, &Value::Null).is_err(), "{bad}");
        }
    }
}
