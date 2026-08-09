use anyhow::{Context, Result};
use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::Tag;
use serde::Deserialize;
use std::path::Path;

/// A tag edit from the UI. `None` means "leave this field alone".
#[derive(Debug, Clone, Deserialize)]
pub struct TagEdit {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
}

/// Writes the edit into the file itself, not just our database — so the change
/// survives re-importing, and follows the file if it's copied elsewhere.
pub fn write_to_file(path: &Path, edit: &TagEdit) -> Result<()> {
    let mut tagged = Probe::open(path)
        .with_context(|| format!("opening {}", path.display()))?
        .read()
        .context("parsing audio file")?;

    if tagged.primary_tag_mut().is_none() {
        let kind = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(kind));
    }
    let tag = tagged
        .primary_tag_mut()
        .context("file format does not support tags")?;

    // Empty string is a deliberate "clear this field".
    let mut set = |key: ItemKey, value: &Option<String>| {
        if let Some(v) = value {
            if v.trim().is_empty() {
                tag.remove_key(&key);
            } else {
                tag.insert_text(key, v.trim().to_string());
            }
        }
    };

    set(ItemKey::TrackTitle, &edit.title);
    set(ItemKey::TrackArtist, &edit.artist);
    set(ItemKey::AlbumTitle, &edit.album);
    set(ItemKey::AlbumArtist, &edit.album_artist);
    set(ItemKey::Genre, &edit.genre);

    if let Some(n) = edit.track_no {
        tag.insert_text(ItemKey::TrackNumber, n.to_string());
    }
    if let Some(n) = edit.disc_no {
        tag.insert_text(ItemKey::DiscNumber, n.to_string());
    }
    if let Some(y) = edit.year {
        tag.insert_text(ItemKey::Year, y.to_string());
    }

    tagged
        .save_to_path(path, WriteOptions::default())
        .with_context(|| format!("writing tags to {}", path.display()))?;

    Ok(())
}
