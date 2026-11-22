//! Commands callable from the UI. Errors are returned as a language-neutral
//! `{ code, detail }` so the UI shows a translated message.

use std::path::PathBuf;

use nosidian_core::config::now_ms;
use nosidian_core::{AppConfig, CoreError, ModuleId, Vault, VaultWorkspaceProfile};
use serde::Serialize;
use tauri::{Manager, State};

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub(crate) code: &'static str,
    pub(crate) detail: String,
}

impl From<CoreError> for CommandError {
    fn from(e: CoreError) -> Self {
        CommandError {
            code: e.code(),
            detail: e.to_string(),
        }
    }
}

pub(crate) fn internal(detail: impl ToString) -> CommandError {
    CommandError {
        code: "unknown",
        detail: detail.to_string(),
    }
}

pub(crate) type CmdResult<T> = Result<T, CommandError>;

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> CmdResult<AppConfig> {
    let store = state.config.lock().map_err(internal)?;
    Ok(store.load()?)
}

#[tauri::command]
pub fn save_config(state: State<'_, AppState>, config: AppConfig) -> CmdResult<AppConfig> {
    let store = state.config.lock().map_err(internal)?;
    Ok(store.save(&config)?)
}

#[tauri::command]
pub fn enabled_modules(state: State<'_, AppState>) -> CmdResult<Vec<ModuleId>> {
    let store = state.config.lock().map_err(internal)?;
    Ok(store.load()?.enabled_modules().into_iter().collect())
}

/// Suggested parent folder for new vaults (the user's Documents folder).
#[tauri::command]
pub fn default_vault_parent(app: tauri::AppHandle) -> CmdResult<PathBuf> {
    app.path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(internal)
}

fn remember_vault(state: &State<'_, AppState>, vault: &Vault) -> CmdResult<()> {
    let store = state.config.lock().map_err(internal)?;
    let mut cfg = store.load()?;
    cfg.touch_vault(&vault.root, &vault.meta.name, now_ms());
    store.save(&cfg)?;
    Ok(())
}

#[tauri::command]
pub fn create_vault(state: State<'_, AppState>, parent: PathBuf, name: String) -> CmdResult<Vault> {
    let vault = Vault::create(&parent, &name, now_ms())?;
    remember_vault(&state, &vault)?;
    Ok(vault)
}

#[tauri::command]
pub fn open_vault(state: State<'_, AppState>, path: PathBuf) -> CmdResult<Vault> {
    let vault = Vault::open(&path, now_ms())?;
    remember_vault(&state, &vault)?;
    Ok(vault)
}

#[tauri::command]
pub fn load_profile(state: State<'_, AppState>) -> CmdResult<VaultWorkspaceProfile> {
    Ok(VaultWorkspaceProfile::load(&active_root(&state)?)?)
}

#[tauri::command]
pub fn save_profile(
    state: State<'_, AppState>,
    profile: VaultWorkspaceProfile,
) -> CmdResult<VaultWorkspaceProfile> {
    Ok(profile.save(&active_root(&state)?)?)
}

// ---------- Notes inside the active vault ----------
// The vault root always comes from the saved config, never from the UI, so
// the webview can only reach files inside the vault the user opened.

use nosidian_core::notes::{self, VaultTree};

pub(crate) fn active_root(state: &State<'_, AppState>) -> CmdResult<PathBuf> {
    let store = state.config.lock().map_err(internal)?;
    store
        .load()?
        .active_vault
        .ok_or_else(|| CommandError { code: "no-vault", detail: "no active vault".into() })
}

#[tauri::command]
pub fn vault_scan(state: State<'_, AppState>) -> CmdResult<VaultTree> {
    Ok(notes::scan(&active_root(&state)?)?)
}

#[tauri::command]
pub fn note_read(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    Ok(notes::read_text(&active_root(&state)?, &path)?)
}

#[tauri::command]
pub fn note_write(state: State<'_, AppState>, path: String, content: String) -> CmdResult<()> {
    let root = active_root(&state)?;
    notes::write_text(&root, &path, &content)?;
    touch_index(&state, &root, &[&path]);
    Ok(())
}

#[tauri::command]
pub fn note_create(state: State<'_, AppState>, path: String, content: String) -> CmdResult<()> {
    let root = active_root(&state)?;
    notes::create_note(&root, &path, &content)?;
    touch_index(&state, &root, &[&path]);
    Ok(())
}

#[tauri::command]
pub fn folder_create(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    Ok(notes::create_folder(&active_root(&state)?, &path)?)
}

#[tauri::command]
pub fn entry_rename(state: State<'_, AppState>, from: String, to: String) -> CmdResult<()> {
    let root = active_root(&state)?;
    notes::rename(&root, &from, &to)?;
    touch_index(&state, &root, &[&from, &to]);
    Ok(())
}

#[tauri::command]
pub fn entry_trash(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    let root = active_root(&state)?;
    let moved = notes::trash(&root, &path, now_ms())?;
    touch_index(&state, &root, &[&path]);
    Ok(moved)
}

/// Create (or reopen) the sample vault in the Documents folder and fill it
/// with the demo notes.
#[tauri::command]
pub fn open_sample_vault(app: tauri::AppHandle, state: State<'_, AppState>) -> CmdResult<Vault> {
    let parent = default_vault_parent(app)?;
    std::fs::create_dir_all(&parent).map_err(internal)?;
    let root = parent.join("NoSidian Demo Vault");
    let vault = if root.exists() {
        Vault::open(&root, now_ms())?
    } else {
        Vault::create(&parent, "NoSidian Demo Vault", now_ms())?
    };
    notes::seed_sample(&vault.root)?;
    remember_vault(&state, &vault)?;
    Ok(vault)
}

// ---------- Vault assets (banner images) ----------

#[tauri::command]
pub fn asset_write(state: State<'_, AppState>, name: String, data: String) -> CmdResult<()> {
    Ok(nosidian_core::assets::write_asset(&active_root(&state)?, &name, &data)?)
}

#[tauri::command]
pub fn asset_read(state: State<'_, AppState>, name: String) -> CmdResult<String> {
    Ok(nosidian_core::assets::read_asset_data_url(&active_root(&state)?, &name)?)
}

#[tauri::command]
pub fn asset_delete(state: State<'_, AppState>, name: String) -> CmdResult<()> {
    Ok(nosidian_core::assets::delete_asset(&active_root(&state)?, &name)?)
}

// ---------- Index: search, tags, links ----------

use nosidian_core::index::{NoteLinks, NoteSummary, SearchHit, SearchSort, TagCount, VaultIndex};

/// Run `f` on the active vault's index, building it first if needed.
fn with_index<T>(state: &State<'_, AppState>, f: impl FnOnce(&VaultIndex) -> T) -> CmdResult<T> {
    let root = active_root(state)?;
    let mut guard = state.index.lock().map_err(internal)?;
    if guard.as_ref().map(|(r, _)| r != &root).unwrap_or(true) {
        *guard = Some((root.clone(), VaultIndex::build(&root)?));
    }
    Ok(f(&guard.as_ref().expect("index just built").1))
}

/// Update the index for changed paths (no-op if it hasn't been built yet).
fn touch_index(state: &State<'_, AppState>, root: &std::path::Path, paths: &[&str]) {
    if let Ok(mut guard) = state.index.lock() {
        if let Some((r, idx)) = guard.as_mut() {
            if r == root {
                for p in paths {
                    idx.refresh_path(root, p);
                }
            }
        }
    }
}

#[tauri::command]
pub fn index_rebuild(state: State<'_, AppState>) -> CmdResult<usize> {
    let root = active_root(&state)?;
    let idx = VaultIndex::build(&root)?;
    let n = idx.len();
    *state.index.lock().map_err(internal)? = Some((root, idx));
    Ok(n)
}

#[tauri::command]
pub fn index_search(state: State<'_, AppState>, query: String, sort: Option<SearchSort>, limit: Option<usize>) -> CmdResult<Vec<SearchHit>> {
    with_index(&state, |i| i.search(&query, sort.unwrap_or_default(), limit.unwrap_or(100)))
}

#[tauri::command]
pub fn index_tags(state: State<'_, AppState>) -> CmdResult<Vec<TagCount>> {
    with_index(&state, |i| i.tags())
}

#[tauri::command]
pub fn index_links(state: State<'_, AppState>, path: String) -> CmdResult<NoteLinks> {
    with_index(&state, |i| i.links(&path))
}

#[tauri::command]
pub fn index_summaries(state: State<'_, AppState>) -> CmdResult<Vec<NoteSummary>> {
    with_index(&state, |i| i.summaries())
}

// ---------- Feature data stores ----------

use nosidian_core::{files, history, store};

/// Read a vault document (`.nosidian/<name>.json`); `null` when missing.
#[tauri::command]
pub fn store_read(state: State<'_, AppState>, name: String) -> CmdResult<serde_json::Value> {
    Ok(store::read_doc(&store::vault_dir(&active_root(&state)?), &name)?)
}

#[tauri::command]
pub fn store_write(state: State<'_, AppState>, name: String, value: serde_json::Value) -> CmdResult<()> {
    Ok(store::write_doc(&store::vault_dir(&active_root(&state)?), &name, &value)?)
}

/// App-wide documents (the companion pet, plugins) in the OS config folder.
#[tauri::command]
pub fn app_store_read(app: tauri::AppHandle, name: String) -> CmdResult<serde_json::Value> {
    let dir = app.path().app_config_dir().map_err(internal)?;
    Ok(store::read_doc(&dir, &name)?)
}

#[tauri::command]
pub fn app_store_write(app: tauri::AppHandle, name: String, value: serde_json::Value) -> CmdResult<()> {
    let dir = app.path().app_config_dir().map_err(internal)?;
    Ok(store::write_doc(&dir, &name, &value)?)
}

// ---------- Note history ----------

#[tauri::command]
pub fn history_list(state: State<'_, AppState>, path: String) -> CmdResult<Vec<history::Snapshot>> {
    Ok(history::list(&active_root(&state)?, &path)?)
}

#[tauri::command]
pub fn history_snapshot(state: State<'_, AppState>, path: String, content: String) -> CmdResult<Option<history::Snapshot>> {
    Ok(history::snapshot(&active_root(&state)?, &path, &content, now_ms())?)
}

#[tauri::command]
pub fn history_read(state: State<'_, AppState>, path: String, ts: u64) -> CmdResult<String> {
    Ok(history::read(&active_root(&state)?, &path, ts)?)
}

// ---------- Attachments, import and export ----------

#[tauri::command]
pub fn attachments_list(state: State<'_, AppState>) -> CmdResult<Vec<String>> {
    Ok(files::attachments(&active_root(&state)?)?)
}

/// Raw bytes of a vault file (images, audio, PDFs), sent as binary.
#[tauri::command]
pub fn file_read(state: State<'_, AppState>, path: String) -> CmdResult<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(files::read_file(&active_root(&state)?, &path)?))
}

/// Write base64 data into the vault (pasted images, uploaded 3D models).
#[tauri::command]
pub fn file_write(state: State<'_, AppState>, path: String, data: String) -> CmdResult<()> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|_| CommandError { code: "invalid-path", detail: path.clone() })?;
    Ok(files::write_file(&active_root(&state)?, &path, &bytes)?)
}

/// A file dropped from outside the app, saved under a free name in `folder`.
#[tauri::command]
pub fn file_add(state: State<'_, AppState>, folder: String, name: String, data: String) -> CmdResult<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|_| CommandError { code: "invalid-path", detail: name.clone() })?;
    let root = active_root(&state)?;
    let rel = files::add_file(&root, &folder, &name, &bytes)?;
    touch_index(&state, &root, &[rel.as_str()]);
    Ok(rel)
}

#[tauri::command]
pub fn files_import(state: State<'_, AppState>, sources: Vec<PathBuf>, folder: String) -> CmdResult<Vec<String>> {
    let root = active_root(&state)?;
    let added = files::import(&root, &sources, &folder)?;
    let refs: Vec<&str> = added.iter().map(String::as_str).collect();
    touch_index(&state, &root, &refs);
    Ok(added)
}

/// Write text to a path the user picked in a save dialog.
#[tauri::command]
pub fn export_text(path: PathBuf, content: String) -> CmdResult<()> {
    std::fs::write(&path, content).map_err(|e| CoreError::Io { path, source: e }.into())
}

/// Write binary data (an image, for example) to a path the user picked.
#[tauri::command]
pub fn export_bytes(path: PathBuf, bytes: Vec<u8>) -> CmdResult<()> {
    std::fs::write(&path, bytes).map_err(|e| CoreError::Io { path, source: e }.into())
}

#[tauri::command]
pub fn vault_backup(state: State<'_, AppState>) -> CmdResult<String> {
    let b = files::backup(&active_root(&state)?, now_ms())?;
    serde_json::to_string_pretty(&b).map_err(internal)
}

/// Show a vault entry (or the vault itself when `path` is empty) in the
/// system file manager, with the entry selected where the OS supports it.
#[tauri::command]
pub fn reveal_in_os(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let root = active_root(&state)?;
    let target = if path.trim().is_empty() { root } else { notes::resolve(&root, &path)? };
    #[cfg(target_os = "windows")]
    let r = {
        let mut arg = std::ffi::OsString::from("/select,");
        arg.push(&target);
        std::process::Command::new("explorer").arg(arg).spawn()
    };
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg("-R").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(target.parent().unwrap_or(&target)).spawn();
    r.map(|_| ()).map_err(internal)
}

/// Absolute filesystem path of a vault entry, for "copy location".
#[tauri::command]
pub fn entry_abs_path(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    let root = active_root(&state)?;
    let target = if path.trim().is_empty() { root } else { notes::resolve(&root, &path)? };
    Ok(target.to_string_lossy().into_owned())
}
