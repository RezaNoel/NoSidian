//! Note snapshots for the History panel, stored in
//! `.nosidian/history/<key>/<unix-ms>.md` where `<key>` is a stable hash of
//! the note path. A `path.txt` beside them records which note they belong to.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};
use crate::notes::resolve;
use crate::VAULT_DATA_DIR;

/// Oldest snapshots beyond this are pruned.
pub const MAX_SNAPSHOTS: usize = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub ts: u64,
    pub size: u64,
}

fn fnv(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn dir_for(root: &Path, rel: &str) -> CoreResult<PathBuf> {
    resolve(root, rel)?;
    Ok(root.join(VAULT_DATA_DIR).join("history").join(format!("{:016x}", fnv(rel))))
}

pub fn list(root: &Path, rel: &str) -> CoreResult<Vec<Snapshot>> {
    let dir = dir_for(root, rel)?;
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(out) };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some(ts) = name.strip_suffix(".md").and_then(|s| s.parse::<u64>().ok()) else { continue };
        let size = e.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(Snapshot { ts, size });
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.ts));
    Ok(out)
}

/// Save `content` as a snapshot unless it equals the latest one.
pub fn snapshot(root: &Path, rel: &str, content: &str, now_ms: u64) -> CoreResult<Option<Snapshot>> {
    let dir = dir_for(root, rel)?;
    let existing = list(root, rel)?;
    if let Some(last) = existing.first() {
        if fs::read_to_string(dir.join(format!("{}.md", last.ts))).ok().as_deref() == Some(content) {
            return Ok(None);
        }
    }
    fs::create_dir_all(&dir).map_err(|e| CoreError::io(&dir, e))?;
    let _ = fs::write(dir.join("path.txt"), rel);
    let ts = existing.first().map_or(now_ms, |l| now_ms.max(l.ts + 1));
    let file = dir.join(format!("{ts}.md"));
    fs::write(&file, content).map_err(|e| CoreError::io(&file, e))?;
    for old in existing.iter().skip(MAX_SNAPSHOTS - 1) {
        let _ = fs::remove_file(dir.join(format!("{}.md", old.ts)));
    }
    Ok(Some(Snapshot { ts, size: content.len() as u64 }))
}

pub fn read(root: &Path, rel: &str, ts: u64) -> CoreResult<String> {
    let file = dir_for(root, rel)?.join(format!("{ts}.md"));
    fs::read_to_string(&file).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => CoreError::NotFound(file),
        _ => CoreError::io(&file, e),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_dedupe_and_order() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        assert!(snapshot(r, "a.md", "one", 10).unwrap().is_some());
        assert!(snapshot(r, "a.md", "one", 20).unwrap().is_none());
        snapshot(r, "a.md", "two", 30).unwrap();
        let l = list(r, "a.md").unwrap();
        assert_eq!(l.iter().map(|s| s.ts).collect::<Vec<_>>(), [30, 10]);
        assert_eq!(read(r, "a.md", 10).unwrap(), "one");
        assert!(list(r, "../x.md").is_err());
    }
}
