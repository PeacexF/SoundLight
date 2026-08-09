use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;
use crate::ingest;
use crate::tools;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Starting,
    Downloading,
    Converting,
    Importing,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub id: u64,
    pub url: String,
    pub title: String,
    pub stage: Stage,
    /// 0-100, or null when the source doesn't report a total.
    pub percent: Option<f64>,
    pub detail: Option<String>,
}

fn emit(app: &AppHandle, p: &Progress) {
    let _ = app.emit("download://progress", p.clone());
}

/// Signals the frontend that the library changed underneath it.
fn emit_library_changed(app: &AppHandle) {
    let _ = app.emit("library://changed", ());
}

pub fn new_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

fn scratch_dir(id: u64) -> Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!("soundlight-dl-{id}"));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Hands the finished file to the one ingest path everything else uses.
fn finish(app: &AppHandle, file: &std::path::Path, source_url: &str, p: &mut Progress) -> Result<()> {
    p.stage = Stage::Importing;
    p.percent = Some(100.0);
    emit(app, p);

    let state = app.state::<AppState>();
    let conn = state
        .conn
        .lock()
        .map_err(|e| anyhow!("database is busy: {e}"))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let result = ingest::ingest_file(&conn, &state.library, file, Some(source_url.to_string()), now)?;
    drop(conn);

    p.stage = Stage::Done;
    p.detail = Some(match result {
        Some(_) => "Added to library".into(),
        None => "Already in library".into(),
    });
    emit(app, p);
    emit_library_changed(app);
    Ok(())
}

fn fail(app: &AppHandle, p: &mut Progress, e: &anyhow::Error) {
    p.stage = Stage::Failed;
    p.detail = Some(format!("{e:#}"));
    emit(app, p);
}

// ---------------------------------------------------------------------------
// Direct file downloads (a link that already points at audio)
// ---------------------------------------------------------------------------

/// A media URL captured from inside a page. HLS playlists have to go through
/// yt-dlp (which drives ffmpeg to stitch the segments); anything that's already
/// a single file is a plain HTTP fetch.
pub fn from_stream(app: AppHandle, url: String, referer: Option<String>, id: u64) {
    let is_playlist = url.split('?').next().unwrap_or(&url).ends_with(".m3u8")
        || url.contains(".m3u8?");

    if is_playlist {
        let mut p = Progress {
            id,
            url: url.clone(),
            title: "Stream".into(),
            stage: Stage::Starting,
            percent: None,
            detail: None,
        };
        emit(&app, &p);
        if let Err(e) = extract_inner(&app, &url, id, &mut p, referer.as_deref()) {
            fail(&app, &mut p, &e);
        }
    } else {
        tauri::async_runtime::spawn(direct_with_referer(app, url, referer, id));
    }
}

pub async fn direct(app: AppHandle, url: String, id: u64) {
    direct_with_referer(app, url, None, id).await
}

pub async fn direct_with_referer(
    app: AppHandle,
    url: String,
    referer: Option<String>,
    id: u64,
) {
    let mut p = Progress {
        id,
        url: url.clone(),
        title: filename_from_url(&url),
        stage: Stage::Starting,
        percent: None,
        detail: None,
    };
    emit(&app, &p);

    if let Err(e) = direct_inner(&app, &url, id, &mut p, referer.as_deref()).await {
        fail(&app, &mut p, &e);
    }
}

async fn direct_inner(
    app: &AppHandle,
    url: &str,
    id: u64,
    p: &mut Progress,
    referer: Option<&str>,
) -> Result<()> {
    let mut request = reqwest::Client::builder()
        .user_agent(crate::browser::user_agent())
        .build()?
        .get(url);

    // Media hosts routinely 403 a request that arrives without the page it was
    // played from.
    if let Some(referer) = referer {
        request = request.header(reqwest::header::REFERER, referer);
    }

    let response = request
        .send()
        .await
        .context("request failed")?
        .error_for_status()
        .context("server rejected the request")?;

    let total = response.content_length();
    let dir = scratch_dir(id)?;
    let dest = dir.join(sanitize_filename(&p.title));
    let mut file = std::fs::File::create(&dest)?;

    p.stage = Stage::Downloading;
    emit(app, p);

    let mut stream = response.bytes_stream();
    let mut written: u64 = 0;
    let mut last_emit = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("connection dropped")?;
        file.write_all(&chunk)?;
        written += chunk.len() as u64;

        // Emitting on every chunk would flood the IPC channel.
        if written - last_emit > 256 * 1024 {
            last_emit = written;
            p.percent = total.map(|t| (written as f64 / t as f64) * 100.0);
            p.detail = Some(human_bytes(written));
            emit(app, p);
        }
    }
    file.flush()?;
    drop(file);

    if written == 0 {
        bail!("downloaded 0 bytes");
    }

    finish(app, &dest, url, p)?;
    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}

// ---------------------------------------------------------------------------
// yt-dlp extraction (a page that *contains* audio)
// ---------------------------------------------------------------------------

pub fn extract(app: AppHandle, url: String, id: u64) {
    let mut p = Progress {
        id,
        url: url.clone(),
        title: "Fetching…".into(),
        stage: Stage::Starting,
        percent: None,
        detail: None,
    };
    emit(&app, &p);

    if let Err(e) = extract_inner(&app, &url, id, &mut p, None) {
        fail(&app, &mut p, &e);
    }
}

fn extract_inner(
    app: &AppHandle,
    url: &str,
    id: u64,
    p: &mut Progress,
    referer: Option<&str>,
) -> Result<()> {
    let yt_dlp = tools::find(app, tools::YT_DLP)
        .ok_or_else(|| anyhow!("yt-dlp is not installed — install it from Settings"))?;
    let ffmpeg = tools::find(app, tools::FFMPEG);

    let dir = scratch_dir(id)?;
    let mut cmd = Command::new(&yt_dlp);
    cmd.arg("--no-playlist")
        .arg("--no-warnings")
        .arg("--newline")
        .arg("--no-simulate")
        // Prints the final path once the file is in place, so we never have to
        // guess what yt-dlp named it.
        .args(["--print", "after_move:filepath"])
        .args(["--print", "before_dl:title"])
        .args(["-o", &format!("{}/%(title).150B.%(ext)s", dir.display())]);

    if let Some(ffmpeg) = &ffmpeg {
        // With ffmpeg we can normalise everything to mp3 and keep artwork.
        cmd.args(["-f", "bestaudio/best"])
            .arg("-x")
            .args(["--audio-format", "mp3"])
            .args(["--audio-quality", "0"])
            .arg("--embed-metadata")
            .arg("--embed-thumbnail")
            .args([
                "--ffmpeg-location",
                &ffmpeg.parent().unwrap_or(ffmpeg).to_string_lossy(),
            ]);
    } else {
        // Without it, take the best *single* audio stream so no merge is needed.
        cmd.args(["-f", "bestaudio[acodec!=none][vcodec=none]/bestaudio/best"]);
    }

    if let Some(referer) = referer {
        cmd.args(["--referer", referer]);
    }

    cmd.arg(url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let mut child = cmd.spawn().context("could not start yt-dlp")?;
    let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;

    p.stage = Stage::Downloading;
    emit(app, p);

    let mut produced: Vec<PathBuf> = Vec::new();

    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        if let Some(pct) = parse_percent(&line) {
            p.percent = Some(pct);
            p.stage = Stage::Downloading;
            emit(app, p);
            continue;
        }

        if line.starts_with("[ExtractAudio]") || line.contains("Destination:") && ffmpeg.is_some() {
            p.stage = Stage::Converting;
            emit(app, p);
            continue;
        }

        // Bare lines are our two --print outputs: the title, then the path.
        let candidate = PathBuf::from(&line);
        if candidate.is_file() {
            produced.push(candidate);
        } else if !line.starts_with('[') && p.title == "Fetching…" {
            p.title = line;
            emit(app, p);
        }
    }

    let mut stderr = String::new();
    if let Some(mut err) = child.stderr.take() {
        use std::io::Read;
        let _ = err.read_to_string(&mut stderr);
    }
    let status = child.wait()?;

    if !status.success() && produced.is_empty() {
        let reason = stderr
            .lines()
            .find(|l| l.contains("ERROR"))
            .unwrap_or("yt-dlp failed")
            .trim();

        if reason.contains("Unsupported URL") {
            bail!("No audio on this page — open the track or video itself, then Download");
        }
        bail!("{reason}");
    }

    // Fall back to scanning the scratch dir if --print gave us nothing usable.
    if produced.is_empty() {
        let mut found = Vec::new();
        ingest::collect_audio_files(&dir, &mut found)?;
        produced = found;
    }
    if produced.is_empty() {
        bail!("yt-dlp produced no audio file");
    }

    for file in &produced {
        finish(app, file, url, p)?;
    }

    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}

/// yt-dlp progress lines look like: `[download]  53.2% of 4.31MiB at 1.2MiB/s`
fn parse_percent(line: &str) -> Option<f64> {
    if !line.starts_with("[download]") {
        return None;
    }
    let pct_token = line.split_whitespace().find(|t| t.ends_with('%'))?;
    pct_token.trim_end_matches('%').parse().ok()
}

fn filename_from_url(url: &str) -> String {
    url.split('?')
        .next()
        .and_then(|u| u.rsplit('/').next())
        .filter(|s| !s.is_empty())
        .map(|s| percent_decode(s))
        .unwrap_or_else(|| "download".into())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "download".into()
    } else {
        trimmed.chars().take(150).collect()
    }
}

fn human_bytes(n: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = n as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_parses_only_download_lines() {
        assert_eq!(
            parse_percent("[download]  53.2% of 4.31MiB at 1.2MiB/s"),
            Some(53.2)
        );
        assert_eq!(parse_percent("[download] 100% of 1.00MiB"), Some(100.0));
        assert_eq!(parse_percent("[info] something 50%"), None);
        assert_eq!(parse_percent("/tmp/file.mp3"), None);
    }

    #[test]
    fn filenames_come_out_of_urls() {
        assert_eq!(
            filename_from_url("https://x.com/a/Song%20Name.mp3?token=1"),
            "Song Name.mp3"
        );
        assert_eq!(filename_from_url("https://x.com/"), "download");
    }

    #[test]
    fn filenames_are_path_safe() {
        assert_eq!(sanitize_filename("a/b:c.mp3"), "a_b_c.mp3");
        assert_eq!(sanitize_filename("   "), "download");
    }

    #[test]
    fn bytes_are_human_readable() {
        assert_eq!(human_bytes(512), "512.0 B");
        assert_eq!(human_bytes(1024 * 1024), "1.0 MB");
    }
}
