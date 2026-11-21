//! Tauri entry point: wires the platform-independent core to the UI through
//! a small set of commands. Shared by desktop (`main.rs`) and mobile.

mod bridge;
mod commands;

use std::sync::Mutex;

use std::path::PathBuf;

use nosidian_core::index::VaultIndex;
use nosidian_core::ConfigStore;
use tauri::Manager;

pub struct AppState {
    pub config: Mutex<ConfigStore>,
    /// Search/link index of the active vault, built on first use.
    pub index: Mutex<Option<(PathBuf, VaultIndex)>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(bridge::McpBridge::default())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            app.manage(AppState {
                config: Mutex::new(ConfigStore::new(dir)),
                index: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::enabled_modules,
            commands::default_vault_parent,
            commands::create_vault,
            commands::open_vault,
            commands::load_profile,
            commands::save_profile,
            commands::vault_scan,
            commands::note_read,
            commands::note_write,
            commands::note_create,
            commands::folder_create,
            commands::entry_rename,
            commands::entry_trash,
            commands::open_sample_vault,
            commands::asset_write,
            commands::asset_read,
            commands::asset_delete,
            commands::index_rebuild,
            commands::index_search,
            commands::index_tags,
            commands::index_links,
            commands::index_summaries,
            commands::store_read,
            commands::store_write,
            commands::app_store_read,
            commands::app_store_write,
            commands::history_list,
            commands::history_snapshot,
            commands::history_read,
            commands::attachments_list,
            commands::file_read,
            commands::file_write,
            commands::files_import,
            commands::export_text,
            commands::vault_backup,
            bridge::terminal_exec,
            bridge::mcp_start,
            bridge::mcp_stop,
            bridge::mcp_respond,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NoSidian");
}
