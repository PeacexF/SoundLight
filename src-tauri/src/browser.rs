use anyhow::{anyhow, Result};
use serde::Serialize;
use tauri::{
    webview::WebviewBuilder, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
};

use crate::ingest::has_audio_extension;

pub const BROWSER_LABEL: &str = "browser";

/// The platform webview's default user agent omits the `Version/… Safari/…`
/// suffix, so plenty of sites decide it's an unsupported browser and serve an
/// error page instead of content (VK's `badbrowser.php`, for one). Present a
/// complete, ordinary UA so we get the real page.
#[cfg(target_os = "macos")]
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";
#[cfg(target_os = "windows")]
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Downloads must present the same UA as the browsing session, or hosts that
/// tie a stream URL to the client that requested it will reject it.
pub fn user_agent() -> &'static str {
    USER_AGENT
}

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
    log_geometry(app, "open", rect);

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

    // No `auto_resize()`: it scales the webview *proportionally* with the
    // window, but our chrome is fixed-size, so the frontend measures the slot
    // and drives the bounds explicitly instead.
    let builder = WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed))
        .user_agent(USER_AGENT)
        .initialization_script(init_script())
        .on_navigation(move |url| on_navigation(&handle, url));

    window.add_child(
        builder,
        LogicalPosition::new(rect.x, rect.y),
        LogicalSize::new(rect.width, rect.height),
    )?;

    Ok(())
}

/// Sentinel host for the injected toolbar to talk to us. `.invalid` is reserved
/// and never resolves, and we block the navigation before any request is made,
/// so this is a private channel that needs no IPC access — the page still can't
/// reach a Tauri command.
const CMD_HOST: &str = "soundlight.invalid";

/// Remembers the last real page, because by the time the toolbar asks us to
/// download, the pending navigation is our own sentinel URL.
static LAST_PAGE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub fn last_page(_app: &AppHandle) -> Option<String> {
    LAST_PAGE.lock().ok().map(|u| u.clone()).filter(|u| !u.is_empty())
}

/// Runs for every navigation the page attempts. Returning false blocks it —
/// which is how a click on a bare .mp3 link becomes a download instead of the
/// webview trying (and usually failing) to render the file.
fn on_navigation(app: &AppHandle, url: &url::Url) -> bool {
    // Toolbar commands, not real navigations.
    if url.host_str().map(|h| h.ends_with(CMD_HOST)).unwrap_or(false) {
        match url.path().trim_matches('/') {
            "download" => {
                let _ = app.emit("browser://download", ());
            }
            "close" => {
                let _ = app.emit("browser://close", ());
            }
            // A stream the page itself fetched. Carries the page as referer
            // because most hosts reject media requests without one.
            "media" => {
                let mut target = None;
                let mut referer = None;
                for (k, v) in url.query_pairs() {
                    match k.as_ref() {
                        "u" => target = Some(v.into_owned()),
                        "r" => referer = Some(v.into_owned()),
                        _ => {}
                    }
                }
                if let Some(target) = target {
                    let handle = app.clone();
                    let id = crate::download::new_id();
                    std::thread::spawn(move || {
                        crate::download::from_stream(handle, target, referer, id)
                    });
                }
            }
            _ => {}
        }
        return false;
    }
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

    if url.scheme() == "http" || url.scheme() == "https" {
        if let Ok(mut last) = LAST_PAGE.lock() {
            *last = url.to_string();
        }
    }

    let _ = app.emit(
        "browser://navigated",
        NavEvent {
            url: url.to_string(),
        },
    );
    true
}

fn init_script() -> String {
    INIT_JS.replace("__CMD_HOST__", CMD_HOST)
}

/// The toolbar is injected into every page rather than drawn in our own DOM,
/// because the native child webview renders above the main webview and would
/// occlude any chrome we placed beside it.
///
/// Built with DOM APIs rather than `innerHTML`: sites that enforce Trusted
/// Types (YouTube, for one) make `innerHTML` throw, which killed the whole
/// script. Re-checked on a timer because SPAs replace `<body>` wholesale.
const INIT_JS: &str = r##"
(function () {
  if (window.top !== window) return;

  var CMD = 'https://__CMD_HOST__/';
  var BAR_H = '44px';

  // --- stream sniffer -------------------------------------------------------
  // yt-dlp runs outside the browser and has no access to this page's login, so
  // for sites that gate audio behind a session (VK, for one) the only thing
  // that can see the real stream URL is code running inside the page. Hook the
  // request APIs and collect anything audio-shaped.
  var found = [];
  var AUDIO_RE = /\.(mp3|m4a|aac|ogg|opus|flac|wav)(\?|$)|\.m3u8(\?|$)/i;
  var onFound = null;

  function addMedia(raw) {
    if (!raw || typeof raw !== 'string') return;
    if (raw.indexOf('blob:') === 0 || raw.indexOf('data:') === 0) return;
    var abs;
    try { abs = new URL(raw, location.href).href; } catch (e) { return; }
    if (!AUDIO_RE.test(abs)) return;
    if (abs.indexOf('__CMD_HOST__') !== -1) return;
    if (found.indexOf(abs) !== -1) return;
    found.unshift(abs);
    if (found.length > 25) found.pop();
    if (onFound) onFound();
  }

  try {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input) {
        try { addMedia(typeof input === 'string' ? input : (input && input.url)); } catch (e) {}
        return origFetch.apply(this, arguments);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, u) {
      try { addMedia(u); } catch (e) {}
      return origOpen.apply(this, arguments);
    };
  } catch (e) {}

  function scanDom() {
    try {
      var nodes = document.querySelectorAll('audio, audio source, video source');
      for (var i = 0; i < nodes.length; i++) addMedia(nodes[i].src || nodes[i].getAttribute('src'));
    } catch (e) {}
  }

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text) n.textContent = text;
    return n;
  }

  function normalize(raw) {
    var s = (raw || '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf(' ') === -1 && s.indexOf('.') > 0) return 'https://' + s;
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
  }

  var BTN =
    'all:unset;cursor:pointer;color:#93939c;padding:6px 9px;border-radius:6px;' +
    'line-height:1;font:13px -apple-system,system-ui,sans-serif;';

  function button(label, title, onClick, primary) {
    var b = el('button', primary
      ? BTN + 'background:#e8e8ea;color:#0a0a0b;font-weight:600;padding:6px 12px;'
      : BTN, label);
    b.title = title;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function build() {
    var host = el('div', 'position:fixed;top:0;left:0;right:0;height:' + BAR_H +
      ';z-index:2147483647;color-scheme:dark;');
    host.id = '__sl_bar';

    var root = host.attachShadow({ mode: 'open' });

    var bar = el('div',
      'display:flex;align-items:center;gap:6px;height:' + BAR_H + ';padding:0 8px;' +
      'background:#0f0f11;border-bottom:1px solid #212125;box-sizing:border-box;');

    var input = el('input',
      'all:unset;flex:1;background:#17171a;color:#e8e8ea;padding:7px 12px;' +
      'border-radius:6px;font:12.5px -apple-system,system-ui,sans-serif;');
    input.spellcheck = false;
    input.placeholder = 'Search, or paste any link';
    try { input.value = window.location.href; } catch (e) {}
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      var t = normalize(input.value);
      if (t) window.location.href = t;
    });

    bar.appendChild(button('←', 'Back', function () { history.back(); }));
    bar.appendChild(button('→', 'Forward', function () { history.forward(); }));
    bar.appendChild(button('↻', 'Reload', function () { location.reload(); }));
    bar.appendChild(input);
    // Panel listing streams the page fetched, hidden until there are some.
    var panel = el('div',
      'position:absolute;top:' + BAR_H + ';right:8px;width:520px;max-height:320px;' +
      'overflow:auto;background:#0f0f11;border:1px solid #212125;border-radius:8px;' +
      'padding:6px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.6);');

    var foundBtn = button('Found (0)', 'Audio the page has loaded', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      renderPanel();
    });
    foundBtn.style.display = 'none';

    function renderPanel() {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      for (var i = 0; i < found.length; i++) {
        (function (u) {
          var row = el('div',
            'display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;');
          var label = el('div',
            'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
            'color:#93939c;font:11.5px -apple-system,system-ui,sans-serif;', u);
          label.title = u;
          row.appendChild(label);
          row.appendChild(button('Get', 'Download this stream', function () {
            window.location.href = CMD + 'media?u=' + encodeURIComponent(u) +
              '&r=' + encodeURIComponent(location.href);
          }, true));
          panel.appendChild(row);
        })(found[i]);
      }
    }

    onFound = function () {
      foundBtn.textContent = 'Found (' + found.length + ')';
      foundBtn.style.display = found.length ? '' : 'none';
      if (panel.style.display === 'block') renderPanel();
    };
    onFound();

    bar.appendChild(foundBtn);
    bar.appendChild(button('Download', 'Download audio from this page',
      function () { window.location.href = CMD + 'download'; }, true));
    bar.appendChild(button('✕', 'Close page',
      function () { window.location.href = CMD + 'close'; }));

    root.appendChild(bar);
    root.appendChild(panel);
    (document.body || document.documentElement).appendChild(host);

    try {
      document.documentElement.style.setProperty('padding-top', BAR_H, 'important');
      document.documentElement.style.setProperty('box-sizing', 'border-box', 'important');
    } catch (e) {}
  }

  function ensure() {
    if (!document.getElementById('__sl_bar') && (document.body || document.documentElement)) {
      try { build(); } catch (e) { /* never let a failure break the page */ }
    }
    scanDom();
  }

  ensure();
  document.addEventListener('DOMContentLoaded', ensure);
  setInterval(ensure, 1000);
})();
"##;

/// Prints what the frontend measured next to the window's real size, so a
/// mismatch (webview covering the whole window instead of just the slot) shows
/// up in the dev log instead of having to be guessed at.
fn log_geometry(app: &AppHandle, label: &str, rect: Rect) {
    let window_size = app
        .get_window("main")
        .and_then(|w| {
            let scale = w.scale_factor().unwrap_or(1.0);
            w.inner_size()
                .ok()
                .map(|s| s.to_logical::<f64>(scale))
                .map(|s| format!("{:.0}x{:.0}", s.width, s.height))
        })
        .unwrap_or_else(|| "?".into());

    eprintln!(
        "[browser:{label}] slot x={:.0} y={:.0} w={:.0} h={:.0} | window {window_size}",
        rect.x, rect.y, rect.width, rect.height
    );
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
