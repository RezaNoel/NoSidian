//! Small binary assets owned by NoSidian inside a vault (banner images and
//! similar), stored in `.nosidian/assets/`. Names are plain file names only.

use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use crate::error::{CoreError, CoreResult};
use crate::VAULT_DATA_DIR;

pub const ASSETS_DIR: &str = "assets";
/// Uploaded images are downscaled in the UI first; this is a safety cap.
pub const MAX_ASSET_BYTES: usize = 8 * 1024 * 1024;

const MIME: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("webp", "image/webp"),
    ("gif", "image/gif"),
];

fn mime_for(name: &str) -> Option<&'static str> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    MIME.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

fn asset_path(root: &Path, name: &str) -> CoreResult<PathBuf> {
    let ok = !name.is_empty()
        && name.len() <= 100
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        && mime_for(name).is_some();
    if !ok {
        return Err(CoreError::InvalidPath(name.to_string()));
    }
    Ok(root.join(VAULT_DATA_DIR).join(ASSETS_DIR).join(name))
}

/// Save base64-encoded image bytes as `.nosidian/assets/<name>`.
pub fn write_asset(root: &Path, name: &str, data_base64: &str) -> CoreResult<()> {
    let path = asset_path(root, name)?;
    let bytes = STANDARD
        .decode(data_base64.trim())
        .map_err(|_| CoreError::InvalidPath(name.to_string()))?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(CoreError::InvalidPath(name.to_string()));
    }
    let dir = path.parent().expect("asset path has a parent");
    fs::create_dir_all(dir).map_err(|e| CoreError::io(dir, e))?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, &bytes).map_err(|e| CoreError::io(&tmp, e))?;
    fs::rename(&tmp, &path).map_err(|e| CoreError::io(&path, e))
}

/// Read an asset as a `data:` URL the webview can show directly.
pub fn read_asset_data_url(root: &Path, name: &str) -> CoreResult<String> {
    let path = asset_path(root, name)?;
    if !path.exists() {
        return Err(CoreError::NotFound(path));
    }
    let bytes = fs::read(&path).map_err(|e| CoreError::io(&path, e))?;
    let mime = mime_for(name).unwrap_or("application/octet-stream");
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn delete_asset(root: &Path, name: &str) -> CoreResult<()> {
    let path = asset_path(root, name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| CoreError::io(&path, e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_validation() {
        let dir = tempfile::tempdir().unwrap();
        let png = STANDARD.encode([137u8, 80, 78, 71]);
        write_asset(dir.path(), "banner-1.png", &png).unwrap();
        let url = read_asset_data_url(dir.path(), "banner-1.png").unwrap();
        assert_eq!(url, format!("data:image/png;base64,{png}"));
        for bad in ["../x.png", ".hidden.png", "a/b.png", "x.exe", "", "x y.png"] {
            assert!(write_asset(dir.path(), bad, &png).is_err(), "{bad}");
        }
        assert!(write_asset(dir.path(), "x.png", "not base64!").is_err());
        delete_asset(dir.path(), "banner-1.png").unwrap();
        assert!(read_asset_data_url(dir.path(), "banner-1.png").is_err());
    }
}
