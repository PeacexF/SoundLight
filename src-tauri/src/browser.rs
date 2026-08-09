use anyhow::{anyhow, Result};
use serde::Serialize;
use tauri::{
    webview::WebviewBuilder, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
};

use crate::ingest::has_audio_extension;

pub const BROWSER_LABEL: &str = "browser";

/// Where the browser viewport sits inside the main window, in logical pixels.
/// The frontend owns layout and tells us; Rust never guesses.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Serialize)]
struct NavEvent {
    url: String,
}

#[derive(Clone, Serialize)]
pub struct MediaHit {
    pub url: String,
    pub page_url: String,
}

/// The page renders in a *child* webview that has no access to our IPC. Our own
/// chrome (address bar, download button) stays in the trusted main webview, so
/// an arbitrary site can never reach a Tauri command.
pub fn open(app: &AppHandle, url: &str, rect: Rect) -> Result<()> {
    if let Some(existing) = app.get_webview(BROWSER_LABEL) {
        existing.set_position(LogicalPosition::new(rect.x, rect.y))?;
        existing.set_size(LogicalSize::new(rect.width, rect.height))?;
        if !url.is_empty() {
            existing.navigate(url.parse()?)?;
        }
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| anyhow!("main window is gone"))?;

    let parsed = url.parse()?;
    let handle = app.clone();

    let builder = WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed))
        .auto_resize()
        .on_navigation(move |url| on_navigation(&handle, url));

    window.add_child(
        builder,
        LogicalPosition::new(rect.x, rect.y),
        LogicalSize::new(rect.width, rect.height),
    )?;

    Ok(())
}

/// Runs for every navigation the page attempts. Returning false blocks it —
/// which is how a click on a bare .mp3 link becomes a download instead of the
/// webview trying (and usually failing) to render the file.
fn on_navigation(app: &AppHandle, url: &url::Url) -> bool {
    let looks_like_audio = std::path::Path::new(url.path())
        .file_name()
        .map(|n| has_audio_extension(std::path::Path::new(n)))
        .unwrap_or(false);

    if looks_like_audio {
        let page_url = app
            .get_webview(BROWSER_LABEL)
            .and_then(|w| w.url().ok())
            .map(|u| u.to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "browser://media",
            MediaHit {
                url: url.to_string(),
                page_url,
            },
        );
        return false;
    }

    let _ = app.emit(
        "browser://navigated",
        NavEvent {
            url: url.to_string(),
        },
    );
    true
}

pub fn reposition(app: &AppHandle, rect: Rect) -> Result<()> {
    if let Some(webview) = app.get_webview(BROWSER_LABEL) {
        webview.set_position(LogicalPosition::new(rect.x, rect.y))?;
        webview.set_size(LogicalSize::new(rect.width, rect.height))?;
    }
    Ok(())
}

pub fn close(app: &AppHandle) -> Result<()> {
    if let Some(webview) = app.get_webview(BROWSER_LABEL) {
        webview.close()?;
    }
    Ok(())
}

pub fn navigate(app: &AppHandle, url: &str) -> Result<()> {
    let webview = app
        .get_webview(BROWSER_LABEL)
        .ok_or_else(|| anyhow!("browser is not open"))?;
    webview.navigate(url.parse()?)?;
    Ok(())
}

pub fn eval(app: &AppHandle, script: &str) -> Result<()> {
    let webview = app
        .get_webview(BROWSER_LABEL)
        .ok_or_else(|| anyhow!("browser is not open"))?;
    webview.eval(script)?;
    Ok(())
}

pub fn current_url(app: &AppHandle) -> Option<String> {
    app.get_webview(BROWSER_LABEL)
        .and_then(|w| w.url().ok())
        .map(|u| u.to_string())
}

/// Accepts what a user actually types: a bare domain, a full URL, or a phrase
/// to search for.
pub fn normalize_input(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "about:blank".into();
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    // A single token with a dot and no spaces is a domain, not a search.
    let looks_like_host =
        !trimmed.contains(' ') && trimmed.contains('.') && !trimmed.starts_with('.');
    if looks_like_host {
        format!("https://{trimmed}")
    } else {
        format!(
            "https://duckduckgo.com/?q={}",
            urlencode(trimmed)
        )
    }
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_is_classified_as_url_or_search() {
        assert_eq!(normalize_input("https://a.com"), "https://a.com");
        assert_eq!(normalize_input("bandcamp.com"), "https://bandcamp.com");
        assert_eq!(
            normalize_input("aphex twin"),
            "https://duckduckgo.com/?q=aphex+twin"
        );
        assert_eq!(normalize_input(""), "about:blank");
        // A phrase containing a dot is still a search, because of the space.
        assert!(normalize_input("hello world.mp3").contains("duckduckgo"));
    }
}
