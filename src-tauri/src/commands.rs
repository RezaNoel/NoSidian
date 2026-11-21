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
pub fn load_profile(vault_root: PathBuf) -> CmdResult<VaultWorkspaceProfile> {
    Ok(VaultWorkspaceProfile::load(&vault_root)?)
}

#[tauri::command]
pub fn save_profile(
    vault_root: PathBuf,
    profile: VaultWorkspaceProfile,
) -> CmdResult<VaultWorkspaceProfile> {
    Ok(profile.save(&vault_root)?)
}
