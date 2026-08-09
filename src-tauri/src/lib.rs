mod browser;
mod commands;
mod db;
mod download;
mod ingest;
mod model;
mod paths;
mod tags;
mod tools;

use commands::AppState;
use paths::Library;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let library = Library::resolve(app.handle())?;
            library.ensure()?;

            let conn = db::open(&library.db_path())?;

            app.manage(AppState {
                library,
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library_root,
            commands::import_paths,
            commands::list_tracks,
            commands::search_tracks,
            commands::mark_played,
            commands::set_archived,
            // playlists
            commands::list_playlists,
            commands::create_playlist,
            commands::playlist_tracks,
            commands::add_to_playlist,
            commands::remove_from_playlist,
            commands::delete_playlist,
            commands::rename_playlist,
            commands::reorder_playlist,
            // track management
            commands::update_track,
            commands::update_tracks,
            commands::delete_tracks,
            commands::missing_tracks,
            commands::reveal_track,
            // browser
            commands::browser_open,
            commands::browser_resize,
            commands::browser_close,
            commands::browser_navigate,
            commands::browser_back,
            commands::browser_forward,
            commands::browser_reload,
            commands::browser_url,
            // downloads
            commands::tools_status,
            commands::install_yt_dlp,
            commands::update_yt_dlp,
            commands::download_extract,
            commands::download_direct,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SoundLight");
}
