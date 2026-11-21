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
    code: &'static str,
    detail: String,
}

impl From<CoreError> for CommandError {
    fn from(e: CoreError) -> Self {
        CommandError {
            code: e.code(),
            detail: e.to_string(),
        }
    }
}

fn internal(detail: impl ToString) -> CommandError {
    CommandError {
        code: "unknown",
        detail: detail.to_string(),
    }
}

type CmdResult<T> = Result<T, CommandError>;

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

fn active_root(state: &State<'_, AppState>) -> CmdResult<PathBuf> {
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
    Ok(notes::write_text(&active_root(&state)?, &path, &content)?)
}

#[tauri::command]
pub fn note_create(state: State<'_, AppState>, path: String, content: String) -> CmdResult<()> {
    Ok(notes::create_note(&active_root(&state)?, &path, &content)?)
}

#[tauri::command]
pub fn folder_create(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    Ok(notes::create_folder(&active_root(&state)?, &path)?)
}

#[tauri::command]
pub fn entry_rename(state: State<'_, AppState>, from: String, to: String) -> CmdResult<()> {
    Ok(notes::rename(&active_root(&state)?, &from, &to)?)
}

#[tauri::command]
pub fn entry_trash(state: State<'_, AppState>, path: String) -> CmdResult<String> {
    Ok(notes::trash(&active_root(&state)?, &path, now_ms())?)
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
