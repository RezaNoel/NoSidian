//! Small file helpers: atomic JSON writes and tolerant JSON reads.

use std::fs;
use std::path::Path;

use serde::{de::DeserializeOwned, Serialize};

use crate::error::{CoreError, CoreResult};

/// Write `value` as pretty JSON, atomically: write a sibling temp file, then
/// rename over the target, so a crash never leaves a half-written file.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> CoreResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })?;
    bytes.push(b'\n');
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &bytes).map_err(|e| CoreError::io(&tmp, e))?;
    fs::rename(&tmp, path).map_err(|e| CoreError::io(path, e))?;
    Ok(())
}

/// Outcome of reading a JSON file that may be missing or damaged.
#[derive(Debug)]
pub enum ReadOutcome<T> {
    Loaded(T),
    Missing,
    /// The file was unreadable; it was moved aside to `backup` and defaults
    /// should be used.
    Recovered { backup: std::path::PathBuf },
}

/// Read JSON, never failing on a damaged file: a corrupt file is renamed to
/// `<name>.corrupt-<n>.json` so the user's data is kept for inspection.
pub fn read_json_tolerant<T: DeserializeOwned>(path: &Path) -> CoreResult<ReadOutcome<T>> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(ReadOutcome::Missing),
        Err(e) => return Err(CoreError::io(path, e)),
    };
    match serde_json::from_slice(&bytes) {
        Ok(v) => Ok(ReadOutcome::Loaded(v)),
        Err(_) => {
            let backup = next_backup_path(path);
            fs::rename(path, &backup).map_err(|e| CoreError::io(path, e))?;
            Ok(ReadOutcome::Recovered { backup })
        }
    }
}

fn next_backup_path(path: &Path) -> std::path::PathBuf {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    (1..)
        .map(|n| path.with_file_name(format!("{stem}.corrupt-{n}.json")))
        .find(|p| !p.exists())
        .expect("unbounded range always yields")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Sample {
        a: u32,
    }

    #[test]
    fn round_trip_and_missing() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("nested/x.json");
        assert!(matches!(
            read_json_tolerant::<Sample>(&p).unwrap(),
            ReadOutcome::Missing
        ));
        write_json_atomic(&p, &Sample { a: 7 }).unwrap();
        match read_json_tolerant::<Sample>(&p).unwrap() {
            ReadOutcome::Loaded(s) => assert_eq!(s, Sample { a: 7 }),
            other => panic!("unexpected {other:?}"),
        }
        assert!(!p.with_extension("json.tmp").exists());
    }

    #[test]
    fn corrupt_file_is_moved_aside() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.json");
        fs::write(&p, b"{not json").unwrap();
        match read_json_tolerant::<Sample>(&p).unwrap() {
            ReadOutcome::Recovered { backup } => {
                assert!(backup.exists());
                assert!(!p.exists());
                assert_eq!(fs::read(backup).unwrap(), b"{not json");
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
