use anyhow::{anyhow, Result};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Everything SoundLight owns lives under one root the user can back up or move:
///
/// ```text
/// ~/Music/SoundLight/
///   soundlight.db
///   library/{artist}/{album}/{file}
///   covers/{hash}.{ext}
/// ```
pub struct Library {
    pub root: PathBuf,
}

impl Library {
    pub fn resolve(app: &AppHandle) -> Result<Self> {
        let root = app
            .path()
            .audio_dir()
            .map_err(|e| anyhow!("could not locate the system music folder: {e}"))?
            .join("SoundLight");
        Ok(Self { root })
    }

    pub fn ensure(&self) -> Result<()> {
        std::fs::create_dir_all(self.audio_dir())?;
        std::fs::create_dir_all(self.covers_dir())?;
        Ok(())
    }

    pub fn db_path(&self) -> PathBuf {
        self.root.join("soundlight.db")
    }

    pub fn audio_dir(&self) -> PathBuf {
        self.root.join("library")
    }

    pub fn covers_dir(&self) -> PathBuf {
        self.root.join("covers")
    }
}

/// Strips characters that are illegal or annoying in path components, so tag
/// text can be used as a folder name on every platform.
pub fn sanitize_component(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    // Trailing dots and spaces break Windows paths.
    let trimmed = cleaned.trim().trim_end_matches('.').trim();

    if trimmed.is_empty() {
        "Unknown".to_string()
    } else if trimmed.chars().count() > 120 {
        trimmed.chars().take(120).collect::<String>().trim().to_string()
    } else {
        trimmed.to_string()
    }
}
