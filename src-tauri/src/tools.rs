use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// yt-dlp is the workhorse for "download from any source" — it knows how to
/// extract audio from far more sites than request-sniffing ever would.
///
/// ffmpeg is *optional*: with it we transcode to mp3 and embed artwork, without
/// it we keep yt-dlp's best single audio stream (usually m4a/opus), which the
/// webview plays and lofty tags just fine.
#[derive(Debug, Clone, Serialize)]
pub struct ToolStatus {
    pub yt_dlp: Option<String>,
    pub ffmpeg: Option<String>,
    pub can_download: bool,
    pub can_transcode: bool,
}

pub fn bin_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("no app data dir: {e}"))?
        .join("bin");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn status(app: &AppHandle) -> ToolStatus {
    let yt_dlp = find(app, YT_DLP);
    let ffmpeg = find(app, FFMPEG);
    ToolStatus {
        can_download: yt_dlp.is_some(),
        can_transcode: ffmpeg.is_some(),
        yt_dlp: yt_dlp.map(|p| p.to_string_lossy().into_owned()),
        ffmpeg: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
    }
}

pub const YT_DLP: &str = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
pub const FFMPEG: &str = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

/// Our own managed copy wins over a system install, so an app-triggered update
/// can't be shadowed by an older binary earlier on PATH.
pub fn find(app: &AppHandle, name: &str) -> Option<PathBuf> {
    if let Ok(dir) = bin_dir(app) {
        let managed = dir.join(name);
        if managed.is_file() {
            return Some(managed);
        }
    }
    find_on_path(name)
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable(candidate))
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return std::fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[cfg(not(unix))]
    true
}

/// yt-dlp publishes standalone builds at a stable "latest" URL per platform.
fn yt_dlp_asset() -> Result<&'static str> {
    Ok(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", _) => "yt-dlp_macos",
        ("linux", "aarch64") => "yt-dlp_linux_aarch64",
        ("linux", _) => "yt-dlp_linux",
        ("windows", _) => "yt-dlp.exe",
        (os, arch) => return Err(anyhow!("unsupported platform: {os}/{arch}")),
    })
}

pub async fn install_yt_dlp(app: &AppHandle) -> Result<PathBuf> {
    let url = format!(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
        yt_dlp_asset()?
    );

    let bytes = reqwest::Client::builder()
        .user_agent("SoundLight")
        .build()?
        .get(&url)
        .send()
        .await
        .context("could not reach GitHub")?
        .error_for_status()
        .context("yt-dlp download failed")?
        .bytes()
        .await?;

    let dest = bin_dir(app)?.join(YT_DLP);
    std::fs::write(&dest, &bytes).with_context(|| format!("writing {}", dest.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))?;
    }

    Ok(dest)
}

/// yt-dlp updates constantly to keep working against sites that change; this is
/// its own self-update, which is more reliable than us re-fetching the release.
pub fn update_yt_dlp(app: &AppHandle) -> Result<String> {
    let exe = find(app, YT_DLP).ok_or_else(|| anyhow!("yt-dlp is not installed"))?;
    let out = std::process::Command::new(exe)
        .arg("-U")
        .output()
        .context("running yt-dlp -U")?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn version(exe: &Path) -> Option<String> {
    let out = std::process::Command::new(exe).arg("--version").output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}
