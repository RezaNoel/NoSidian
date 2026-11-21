//! Reading and writing the files inside a vault.
//!
//! Every path the UI sends is vault-relative with `/` separators. Paths are
//! validated so nothing can escape the vault or touch `.nosidian/`, and
//! deletes go to `.nosidian/trash/` instead of being permanent.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::VAULT_DATA_DIR;

/// Folders never shown in the explorer.
const HIDDEN_DIRS: &[&str] = &[VAULT_DATA_DIR, ".git", ".obsidian", ".trash", "node_modules"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EntryKind {
    Markdown,
    Pdf,
}

impl EntryKind {
    pub fn from_path(p: &Path) -> Option<Self> {
        match p.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "md" | "markdown" => Some(EntryKind::Markdown),
            "pdf" => Some(EntryKind::Pdf),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    /// Vault-relative path with `/` separators, e.g. `Projects/Plan.md`.
    pub path: String,
    pub kind: EntryKind,
    pub size: u64,
    /// Unix ms.
    pub modified: u64,
    /// Unix ms (falls back to `modified` where the OS has no birth time).
    pub created: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VaultTree {
    pub notes: Vec<NoteMeta>,
    /// Every folder, including empty ones, as vault-relative paths.
    pub folders: Vec<String>,
}

/// Validate a vault-relative path and return its absolute location.
pub fn resolve(root: &Path, rel: &str) -> CoreResult<PathBuf> {
    let rel = rel.trim().trim_end_matches('/');
    if rel.is_empty() || rel.starts_with('/') || rel.contains('\\') || rel.contains('\0') {
        return Err(CoreError::InvalidPath(rel.to_string()));
    }
    let p = Path::new(rel);
    let mut first = true;
    for c in p.components() {
        match c {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if first && s == VAULT_DATA_DIR {
                    return Err(CoreError::InvalidPath(rel.to_string()));
                }
                if s.trim().is_empty() || s.ends_with(' ') || s.ends_with('.') {
                    return Err(CoreError::InvalidPath(rel.to_string()));
                }
                if s.chars().any(|ch| matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*') || ch.is_control()) {
                    return Err(CoreError::InvalidPath(rel.to_string()));
                }
            }
            _ => return Err(CoreError::InvalidPath(rel.to_string())),
        }
        first = false;
    }
    Ok(root.join(p))
}

fn to_rel(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    Some(parts.join("/"))
}

fn ms(t: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    t.ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64)
}

/// List every Markdown/PDF file and folder in the vault.
pub fn scan(root: &Path) -> CoreResult<VaultTree> {
    let mut tree = VaultTree::default();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| CoreError::io(&dir, e))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                if HIDDEN_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                if let Some(rel) = to_rel(root, &path) {
                    tree.folders.push(rel);
                }
                stack.push(path);
            } else if ft.is_file() {
                let Some(kind) = EntryKind::from_path(&path) else { continue };
                let Ok(md) = entry.metadata() else { continue };
                let modified = ms(md.modified()).unwrap_or(0);
                if let Some(rel) = to_rel(root, &path) {
                    tree.notes.push(NoteMeta {
                        path: rel,
                        kind,
                        size: md.len(),
                        modified,
                        created: ms(md.created()).unwrap_or(modified),
                    });
                }
            }
        }
    }
    tree.notes.sort_by(|a, b| a.path.cmp(&b.path));
    tree.folders.sort();
    Ok(tree)
}

/// Metadata for one file, or `None` if it is missing or not a note/PDF.
pub fn meta_of(root: &Path, rel: &str) -> Option<NoteMeta> {
    let p = resolve(root, rel).ok()?;
    let kind = EntryKind::from_path(&p)?;
    let md = fs::metadata(&p).ok().filter(|m| m.is_file())?;
    let modified = ms(md.modified()).unwrap_or(0);
    Some(NoteMeta { path: rel.to_string(), kind, size: md.len(), modified, created: ms(md.created()).unwrap_or(modified) })
}

pub fn read_text(root: &Path, rel: &str) -> CoreResult<String> {
    let p = resolve(root, rel)?;
    fs::read_to_string(&p).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => CoreError::NotFound(p),
        _ => CoreError::io(&p, e),
    })
}

pub fn read_bytes(root: &Path, rel: &str) -> CoreResult<Vec<u8>> {
    let p = resolve(root, rel)?;
    fs::read(&p).map_err(|e| CoreError::io(&p, e))
}

/// Write (create or overwrite) a text file atomically, creating parent folders.
pub fn write_text(root: &Path, rel: &str, content: &str) -> CoreResult<()> {
    let p = resolve(root, rel)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    let tmp = p.with_file_name(format!(
        ".{}.nosidian-tmp",
        p.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()
    ));
    fs::write(&tmp, content).map_err(|e| CoreError::io(&tmp, e))?;
    fs::rename(&tmp, &p).map_err(|e| CoreError::io(&p, e))
}

/// Create a new note; fails if it already exists.
pub fn create_note(root: &Path, rel: &str, content: &str) -> CoreResult<()> {
    let p = resolve(root, rel)?;
    if p.exists() {
        return Err(CoreError::AlreadyExists(p));
    }
    write_text(root, rel, content)
}

pub fn create_folder(root: &Path, rel: &str) -> CoreResult<()> {
    let p = resolve(root, rel)?;
    if p.exists() {
        return Err(CoreError::AlreadyExists(p));
    }
    fs::create_dir_all(&p).map_err(|e| CoreError::io(&p, e))
}

/// Rename or move a note or folder inside the vault.
pub fn rename(root: &Path, from: &str, to: &str) -> CoreResult<()> {
    let a = resolve(root, from)?;
    let b = resolve(root, to)?;
    if !a.exists() {
        return Err(CoreError::NotFound(a));
    }
    if b.exists() && !same_file_case_change(&a, &b) {
        return Err(CoreError::AlreadyExists(b));
    }
    if b.starts_with(&a) && a != b {
        return Err(CoreError::InvalidPath(to.to_string()));
    }
    if let Some(parent) = b.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    fs::rename(&a, &b).map_err(|e| CoreError::io(&a, e))
}

/// On case-insensitive file systems `a.md` -> `A.md` "exists" already.
fn same_file_case_change(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

/// Move a note or folder to `.nosidian/trash/<timestamp>/`, never deleting.
pub fn trash(root: &Path, rel: &str, now_ms: u64) -> CoreResult<String> {
    let src = resolve(root, rel)?;
    if !src.exists() {
        return Err(CoreError::NotFound(src));
    }
    let dest = root
        .join(VAULT_DATA_DIR)
        .join("trash")
        .join(now_ms.to_string())
        .join(rel.trim_matches('/'));
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    fs::rename(&src, &dest).map_err(|e| CoreError::io(&src, e))?;
    Ok(to_rel(root, &dest).unwrap_or_default())
}

/// The bundled sample vault (from the reference app), written on request.
pub const SAMPLE_NOTES: &[(&str, &str)] = &[
    ("Welcome to NoSidian.md", include_str!("../../../sample-vault/Welcome to NoSidian.md")),
    (
        "Markdown, Math & Mermaid Showcase.md",
        include_str!("../../../sample-vault/Markdown, Math & Mermaid Showcase.md"),
    ),
    (
        "Projects/Product Roadmap Kanban.md",
        include_str!("../../../sample-vault/Projects/Product Roadmap Kanban.md"),
    ),
    (
        "Flashcards & Active Recall.md",
        include_str!("../../../sample-vault/Flashcards & Active Recall.md"),
    ),
    (
        "Second Brain Architecture.md",
        include_str!("../../../sample-vault/Second Brain Architecture.md"),
    ),
    (
        "Bilingual RTL & LTR Showcase.md",
        include_str!("../../../sample-vault/Bilingual RTL & LTR Showcase.md"),
    ),
    (
        "Templates/Daily Review Template.md",
        include_str!("../../../sample-vault/Templates/Daily Review Template.md"),
    ),
    ("Presentation Deck Demo.md", include_str!("../../../sample-vault/Presentation Deck Demo.md")),
];

/// Write the sample notes into a vault, skipping any that already exist.
pub fn seed_sample(root: &Path) -> CoreResult<usize> {
    let mut n = 0;
    for (rel, content) in SAMPLE_NOTES {
        if !resolve(root, rel)?.exists() {
            write_text(root, rel, content)?;
            n += 1;
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_validation() {
        let r = Path::new("/v");
        assert!(resolve(r, "a/b.md").is_ok());
        assert!(resolve(r, "یادداشت.md").is_ok());
        for bad in ["", "../x.md", "a/../../x.md", "/etc/passwd", ".nosidian/vault.json", "a\\b.md", "a/b?.md", "C:/x.md", "a /b.md"] {
            assert!(resolve(r, bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn crud_round_trip() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        create_note(r, "Projects/Plan.md", "# Plan").unwrap();
        assert!(create_note(r, "Projects/Plan.md", "x").is_err());
        create_folder(r, "Empty").unwrap();
        fs::write(r.join("doc.pdf"), b"%PDF").unwrap();
        fs::write(r.join("ignore.txt"), b"x").unwrap();
        fs::create_dir_all(r.join(".obsidian")).unwrap();
        fs::write(r.join(".obsidian/x.md"), b"x").unwrap();

        let t = scan(r).unwrap();
        let paths: Vec<_> = t.notes.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths, ["Projects/Plan.md", "doc.pdf"]);
        assert_eq!(t.folders, ["Empty", "Projects"]);
        assert_eq!(t.notes[1].kind, EntryKind::Pdf);

        write_text(r, "Projects/Plan.md", "# Plan v2").unwrap();
        assert_eq!(read_text(r, "Projects/Plan.md").unwrap(), "# Plan v2");

        rename(r, "Projects/Plan.md", "Archive/Plan.md").unwrap();
        assert!(read_text(r, "Archive/Plan.md").is_ok());
        assert!(rename(r, "Archive", "Archive/Sub").is_err());

        let trashed = trash(r, "Archive/Plan.md", 42).unwrap();
        assert_eq!(trashed, ".nosidian/trash/42/Archive/Plan.md");
        assert!(!r.join("Archive/Plan.md").exists());
        assert!(scan(r).unwrap().notes.iter().all(|n| !n.path.contains("Plan")));
    }

    #[test]
    fn sample_seeds_once() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(seed_sample(d.path()).unwrap(), SAMPLE_NOTES.len());
        assert_eq!(seed_sample(d.path()).unwrap(), 0);
        assert!(read_text(d.path(), "Welcome to NoSidian.md").unwrap().contains("# Welcome"));
    }
}
