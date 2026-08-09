use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::browser::{self, Rect};
use crate::db;
use crate::download;
use crate::ingest;
use crate::model::{ImportFailure, ImportReport, Playlist, Track};
use crate::paths::Library;
use crate::tags::TagEdit;
use crate::tools::{self, ToolStatus};

pub struct AppState {
    pub library: Library,
    pub conn: Mutex<Connection>,
}

/// Commands hand the frontend a plain string on failure — anyhow's chain
/// formatting keeps the useful context ("copying into …: permission denied").
type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    format!("{e:#}")
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn library_root(state: State<'_, AppState>) -> String {
    state.library.root.to_string_lossy().into_owned()
}

/// Accepts files *and* folders; folders are walked recursively.
#[tauri::command]
pub fn import_paths(state: State<'_, AppState>, paths: Vec<String>) -> CmdResult<ImportReport> {
    let mut files: Vec<PathBuf> = Vec::new();
    let mut report = ImportReport::default();

    for raw in &paths {
        let path = PathBuf::from(raw);
        if let Err(e) = ingest::collect_audio_files(&path, &mut files) {
            report.failed.push(ImportFailure {
                path: raw.clone(),
                error: err(e),
            });
        }
    }

    let conn = state.conn.lock().map_err(|e| err(e))?;
    let now = now_ms();

    for file in files {
        match ingest::ingest_file(&conn, &state.library, &file, None, now) {
            Ok(Some(_)) => report.imported += 1,
            Ok(None) => report.duplicates += 1,
            Err(e) => report.failed.push(ImportFailure {
                path: file.to_string_lossy().into_owned(),
                error: err(e),
            }),
        }
    }

    Ok(report)
}

#[tauri::command]
pub fn list_tracks(state: State<'_, AppState>) -> CmdResult<Vec<Track>> {
    let conn = state.conn.lock().map_err(err)?;
    db::list_tracks(&conn).map_err(err)
}

#[tauri::command]
pub fn search_tracks(state: State<'_, AppState>, query: String) -> CmdResult<Vec<Track>> {
    let conn = state.conn.lock().map_err(err)?;
    db::search_tracks(&conn, &query).map_err(err)
}

#[tauri::command]
pub fn mark_played(state: State<'_, AppState>, track_id: i64) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::mark_played(&conn, track_id, now_ms()).map_err(err)
}

#[tauri::command]
pub fn set_archived(state: State<'_, AppState>, track_id: i64, archived: bool) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::set_archived(&conn, track_id, archived).map_err(err)
}

#[tauri::command]
pub fn list_playlists(state: State<'_, AppState>) -> CmdResult<Vec<Playlist>> {
    let conn = state.conn.lock().map_err(err)?;
    db::list_playlists(&conn).map_err(err)
}

#[tauri::command]
pub fn create_playlist(state: State<'_, AppState>, name: String) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(err)?;
    db::create_playlist(&conn, name.trim(), now_ms()).map_err(err)
}

#[tauri::command]
pub fn playlist_tracks(state: State<'_, AppState>, playlist_id: i64) -> CmdResult<Vec<Track>> {
    let conn = state.conn.lock().map_err(err)?;
    db::playlist_tracks(&conn, playlist_id).map_err(err)
}

#[tauri::command]
pub fn add_to_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track_id: i64,
) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::add_to_playlist(&conn, playlist_id, track_id).map_err(err)
}

#[tauri::command]
pub fn remove_from_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track_id: i64,
) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::remove_from_playlist(&conn, playlist_id, track_id).map_err(err)
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, playlist_id: i64) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::delete_playlist(&conn, playlist_id).map_err(err)
}

#[tauri::command]
pub fn rename_playlist(state: State<'_, AppState>, playlist_id: i64, name: String) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;
    db::rename_playlist(&conn, playlist_id, name.trim()).map_err(err)
}

#[tauri::command]
pub fn reorder_playlist(
    state: State<'_, AppState>,
    playlist_id: i64,
    track_ids: Vec<i64>,
) -> CmdResult<()> {
    let mut conn = state.conn.lock().map_err(err)?;
    db::reorder_playlist(&mut conn, playlist_id, &track_ids).map_err(err)
}

// -- Track management --------------------------------------------------------

/// Writes the edit to the file's own tags first, then to our row. If the file
/// write fails we stop, so the database can't drift away from what's on disk.
#[tauri::command]
pub fn update_track(state: State<'_, AppState>, track_id: i64, edit: TagEdit) -> CmdResult<()> {
    let conn = state.conn.lock().map_err(err)?;

    let track = db::track_by_id(&conn, track_id)
        .map_err(err)?
        .ok_or_else(|| "track no longer exists".to_string())?;

    crate::tags::write_to_file(Path::new(&track.file_path), &edit).map_err(err)?;
    db::update_track_metadata(&conn, track_id, &edit).map_err(err)
}

/// Applies the same edit to many tracks — the usual "fix the album name on 12
/// files" case.
#[tauri::command]
pub fn update_tracks(
    state: State<'_, AppState>,
    track_ids: Vec<i64>,
    edit: TagEdit,
) -> CmdResult<Vec<String>> {
    let conn = state.conn.lock().map_err(err)?;
    let mut errors = Vec::new();

    for id in track_ids {
        let Some(track) = db::track_by_id(&conn, id).map_err(err)? else {
            continue;
        };
        match crate::tags::write_to_file(Path::new(&track.file_path), &edit) {
            Ok(()) => {
                if let Err(e) = db::update_track_metadata(&conn, id, &edit) {
                    errors.push(format!("{}: {e:#}", track.title));
                }
            }
            Err(e) => errors.push(format!("{}: {e:#}", track.title)),
        }
    }

    Ok(errors)
}

#[tauri::command]
pub fn delete_tracks(
    state: State<'_, AppState>,
    track_ids: Vec<i64>,
    delete_files: bool,
) -> CmdResult<usize> {
    let conn = state.conn.lock().map_err(err)?;
    let mut removed = 0;

    for id in track_ids {
        if let Some((file_path, cover_path)) = db::delete_track(&conn, id).map_err(err)? {
            removed += 1;
            if delete_files {
                let _ = std::fs::remove_file(&file_path);
                if let Some(cover) = cover_path {
                    let _ = std::fs::remove_file(cover);
                }
            }
        }
    }

    Ok(removed)
}

/// Rows whose file has disappeared — lets the user clean up after moving or
/// deleting things outside the app.
#[tauri::command]
pub fn missing_tracks(state: State<'_, AppState>) -> CmdResult<Vec<Track>> {
    let conn = state.conn.lock().map_err(err)?;
    db::missing_files(&conn).map_err(err)
}

#[tauri::command]
pub fn reveal_track(app: AppHandle, path: String) -> CmdResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(PathBuf::from(path))
        .map_err(err)
}

// -- Browser -----------------------------------------------------------------

#[tauri::command]
pub fn browser_open(app: AppHandle, url: String, rect: Rect) -> CmdResult<()> {
    browser::open(&app, &browser::normalize_input(&url), rect).map_err(err)
}

#[tauri::command]
pub fn browser_resize(app: AppHandle, rect: Rect) -> CmdResult<()> {
    browser::reposition(&app, rect).map_err(err)
}

#[tauri::command]
pub fn browser_close(app: AppHandle) -> CmdResult<()> {
    browser::close(&app).map_err(err)
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, url: String) -> CmdResult<()> {
    browser::navigate(&app, &browser::normalize_input(&url)).map_err(err)
}

#[tauri::command]
pub fn browser_back(app: AppHandle) -> CmdResult<()> {
    browser::eval(&app, "history.back()").map_err(err)
}

#[tauri::command]
pub fn browser_forward(app: AppHandle) -> CmdResult<()> {
    browser::eval(&app, "history.forward()").map_err(err)
}

#[tauri::command]
pub fn browser_reload(app: AppHandle) -> CmdResult<()> {
    browser::eval(&app, "location.reload()").map_err(err)
}

#[tauri::command]
pub fn browser_url(app: AppHandle) -> Option<String> {
    browser::current_url(&app)
}

// -- Downloads ---------------------------------------------------------------

#[tauri::command]
pub fn tools_status(app: AppHandle) -> ToolStatus {
    tools::status(&app)
}

#[tauri::command]
pub async fn install_yt_dlp(app: AppHandle) -> CmdResult<String> {
    let path = tools::install_yt_dlp(&app).await.map_err(err)?;
    Ok(tools::version(&path).unwrap_or_else(|| "installed".into()))
}

#[tauri::command]
pub async fn update_yt_dlp(app: AppHandle) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || tools::update_yt_dlp(&app).map_err(err))
        .await
        .map_err(err)?
}

/// Pulls audio out of whatever page the browser is on (or an explicit URL).
#[tauri::command]
pub fn download_extract(app: AppHandle, url: Option<String>) -> CmdResult<u64> {
    let target = url
        .filter(|u| !u.trim().is_empty())
        .or_else(|| browser::current_url(&app))
        .ok_or_else(|| "nothing to download — open a page first".to_string())?;

    let id = download::new_id();
    tauri::async_runtime::spawn_blocking(move || download::extract(app, target, id));
    Ok(id)
}

/// Fetches a link that already points straight at an audio file.
#[tauri::command]
pub fn download_direct(app: AppHandle, url: String) -> CmdResult<u64> {
    if url.trim().is_empty() {
        return Err("no URL given".into());
    }
    let id = download::new_id();
    tauri::async_runtime::spawn(download::direct(app, url, id));
    Ok(id)
}
