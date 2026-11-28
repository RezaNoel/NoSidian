//! Attachments (images, audio, video, PDFs) inside a vault, importing files
//! from disk, and whole-vault exports.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, CoreResult};
use crate::notes::{resolve, scan, EntryKind};
use crate::VAULT_DATA_DIR;

/// Largest file sent to the UI in one piece.
pub const MAX_FILE_BYTES: u64 = 200 * 1024 * 1024;

const SKIP_DIRS: &[&str] = &[VAULT_DATA_DIR, ".git", ".obsidian", ".trash", "node_modules"];

pub fn mime_for(name: &str) -> &'static str {
    match name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg" | "oga") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("flac") => "audio/flac",
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("pdf") => "application/pdf",
        Some("md" | "markdown" | "txt") => "text/plain",
        Some("glb") => "model/gltf-binary",
        Some("gltf") => "model/gltf+json",
        _ => "application/octet-stream",
    }
}

fn is_attachment(name: &str) -> bool {
    let m = mime_for(name);
    m.starts_with("image/") || m.starts_with("audio/") || m.starts_with("video/") || m.starts_with("model/")
}

/// Every image/audio/video/model file in the vault (vault-relative paths).
pub fn attachments(root: &Path) -> CoreResult<Vec<String>> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if !SKIP_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                    stack.push(e.path());
                }
            } else if ft.is_file() && is_attachment(&name) {
                if let Ok(rel) = e.path().strip_prefix(root) {
                    out.push(rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/"));
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

pub fn read_file(root: &Path, rel: &str) -> CoreResult<Vec<u8>> {
    let p = resolve(root, rel)?;
    let md = fs::metadata(&p).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => CoreError::NotFound(p.clone()),
        _ => CoreError::io(&p, e),
    })?;
    if md.len() > MAX_FILE_BYTES {
        return Err(CoreError::InvalidPath(rel.to_string()));
    }
    fs::read(&p).map_err(|e| CoreError::io(&p, e))
}

/// Write binary data into the vault (pasted images, uploaded models...).
pub fn write_file(root: &Path, rel: &str, bytes: &[u8]) -> CoreResult<()> {
    let p = resolve(root, rel)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    fs::write(&p, bytes).map_err(|e| CoreError::io(&p, e))
}

/// Save bytes as a new file in `folder` under a free name (`a.png`, `a 1.png`...).
/// Used for files dropped from outside the app. Returns the vault-relative path.
pub fn add_file(root: &Path, folder: &str, name: &str, bytes: &[u8]) -> CoreResult<String> {
    let clean: String = name.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')).collect();
    let clean = clean.trim().trim_start_matches('.');
    let rel = free_path(root, folder, if clean.is_empty() { "file" } else { clean })?;
    write_file(root, &rel, bytes)?;
    Ok(rel)
}

/// First free path for `name` in `folder`: `a.pdf`, `a 1.pdf`, `a 2.pdf`...
fn free_path(root: &Path, folder: &str, name: &str) -> CoreResult<String> {
    let (stem, ext) = name.rsplit_once('.').map_or((name.to_string(), String::new()), |(s, e)| (s.to_string(), format!(".{e}")));
    for i in 0..1000 {
        let candidate = if i == 0 { format!("{stem}{ext}") } else { format!("{stem} {i}{ext}") };
        let rel = if folder.is_empty() { candidate } else { format!("{folder}/{candidate}") };
        if !resolve(root, &rel)?.exists() {
            return Ok(rel);
        }
    }
    Err(CoreError::AlreadyExists(root.join(folder).join(name)))
}

/// Copy files from anywhere on disk into `folder` of the vault. Returns the
/// new vault-relative paths.
pub fn import(root: &Path, sources: &[PathBuf], folder: &str) -> CoreResult<Vec<String>> {
    let mut out = Vec::new();
    for src in sources {
        let Some(name) = src.file_name().map(|n| n.to_string_lossy().into_owned()) else { continue };
        let rel = free_path(root, folder.trim_matches('/'), &name)?;
        let dest = resolve(root, &rel)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
        }
        fs::copy(src, &dest).map_err(|e| CoreError::io(src, e))?;
        out.push(rel);
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
pub struct BackupNote {
    pub path: String,
    pub content: String,
    pub modified: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultBackup {
    pub format: &'static str,
    pub created_at: u64,
    pub folders: Vec<String>,
    pub notes: Vec<BackupNote>,
}

/// Every Markdown note with its content, for a JSON backup.
pub fn backup(root: &Path, now_ms: u64) -> CoreResult<VaultBackup> {
    let tree = scan(root)?;
    let mut notes = Vec::new();
    for n in tree.notes.iter().filter(|n| n.kind == EntryKind::Markdown) {
        if let Ok(content) = fs::read_to_string(root.join(&n.path)) {
            notes.push(BackupNote { path: n.path.clone(), content, modified: n.modified });
        }
    }
    Ok(VaultBackup { format: "nosidian-backup-1", created_at: now_ms, folders: tree.folders, notes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_attachments_backup() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        fs::write(r.join("a.md"), "# A").unwrap();
        fs::create_dir_all(r.join("img")).unwrap();
        fs::write(r.join("img/p.png"), [1, 2]).unwrap();
        assert_eq!(attachments(r).unwrap(), ["img/p.png"]);
        let ext = tempfile::tempdir().unwrap();
        let src = ext.path().join("doc.pdf");
        fs::write(&src, b"%PDF").unwrap();
        let got = import(r, &[src.clone(), src], "Papers").unwrap();
        assert_eq!(got, ["Papers/doc.pdf", "Papers/doc 1.pdf"]);
        assert_eq!(read_file(r, "Papers/doc.pdf").unwrap(), b"%PDF");
        let b = backup(r, 5).unwrap();
        assert_eq!(b.notes.len(), 1);
        assert!(read_file(r, "../x").is_err());
    }
}
