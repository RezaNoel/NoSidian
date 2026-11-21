//! Tauri entry point: wires the platform-independent core to the UI through
//! a small set of commands. Shared by desktop (`main.rs`) and mobile.

mod commands;

use std::sync::Mutex;

use nosidian_core::ConfigStore;
use tauri::Manager;

pub struct AppState {
    pub config: Mutex<ConfigStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            app.manage(AppState {
                config: Mutex::new(ConfigStore::new(dir)),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running NoSidian");
}
