use anyhow::{bail, Context, Result};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::MimeType;
use lofty::prelude::*;
use lofty::probe::Probe;
use rusqlite::Connection;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::db;
use crate::model::NewTrack;
use crate::paths::{sanitize_component, Library};

pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wv", "aiff", "aif", "alac", "mp4", "mpc",
];

pub fn has_audio_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// The single door into the library.
///
/// Disk imports, direct downloads and browser-captured files all land here, so
/// hashing, tagging, dedupe and the copy-into-library step happen exactly once
/// in exactly one place. Returns `None` when the file is already in the library.
pub fn ingest_file(
    conn: &Connection,
    library: &Library,
    source: &Path,
    source_url: Option<String>,
    now: i64,
) -> Result<Option<i64>> {
    if !source.is_file() {
        bail!("not a file");
    }

    let hash = hash_file(source).context("hashing failed")?;

    // Content-addressed dedupe: the same song downloaded from two different
    // sites collapses to one row, no matter what either site named it.
    if db::track_by_hash(conn, &hash)?.is_some() {
        return Ok(None);
    }

    let meta = read_metadata(source)?;
    let file_size = fs::metadata(source)?.len() as i64;

    let dest = copy_into_library(library, source, &meta)?;
    let cover_path = meta
        .cover
        .as_ref()
        .and_then(|c| write_cover(library, &hash, c).ok())
        .flatten();

    let new = NewTrack {
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        album_artist: meta.album_artist,
        track_no: meta.track_no,
        disc_no: meta.disc_no,
        year: meta.year,
        genre: meta.genre,
        duration: meta.duration,
        bitrate: meta.bitrate,
        sample_rate: meta.sample_rate,
        channels: meta.channels,
        format: meta.format,
        file_path: dest.to_string_lossy().into_owned(),
        file_size,
        cover_path: cover_path.map(|p| p.to_string_lossy().into_owned()),
        hash,
        source_url,
    };

    match db::insert_track(conn, &new, now) {
        Ok(id) => Ok(Some(id)),
        Err(e) => {
            // Don't leave an orphan file behind if the row didn't land.
            let _ = fs::remove_file(&dest);
            Err(e)
        }
    }
}

struct Metadata {
    title: String,
    artist: String,
    album: String,
    album_artist: Option<String>,
    track_no: Option<u32>,
    disc_no: Option<u32>,
    year: Option<u32>,
    genre: Option<String>,
    duration: f64,
    bitrate: Option<u32>,
    sample_rate: Option<u32>,
    channels: Option<u8>,
    format: String,
    cover: Option<Cover>,
}

struct Cover {
    data: Vec<u8>,
    extension: &'static str,
}

fn read_metadata(path: &Path) -> Result<Metadata> {
    let tagged = Probe::open(path)
        .context("could not open file")?
        .read()
        .context("could not parse audio file")?;

    let props = tagged.properties();
    let format = format!("{:?}", tagged.file_type());

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let get = |key: &ItemKey| -> Option<String> {
        tag.and_then(|t| t.get_string(key))
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };

    // Fall back to the filename when there are no usable tags at all — better
    // than a library full of "Unknown Title".
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Unknown Title".into());
    let (fallback_artist, fallback_title) = split_filename(&stem);

    let cover = tag.and_then(|t| t.pictures().first()).map(|pic| Cover {
        data: pic.data().to_vec(),
        extension: match pic.mime_type() {
            Some(MimeType::Png) => "png",
            Some(MimeType::Gif) => "gif",
            Some(MimeType::Bmp) => "bmp",
            _ => "jpg",
        },
    });

    Ok(Metadata {
        title: get(&ItemKey::TrackTitle).unwrap_or(fallback_title),
        artist: get(&ItemKey::TrackArtist).unwrap_or(fallback_artist),
        album: get(&ItemKey::AlbumTitle).unwrap_or_else(|| "Unknown Album".into()),
        album_artist: get(&ItemKey::AlbumArtist),
        track_no: get(&ItemKey::TrackNumber).and_then(|s| parse_leading_number(&s)),
        disc_no: get(&ItemKey::DiscNumber).and_then(|s| parse_leading_number(&s)),
        year: get(&ItemKey::Year)
            .or_else(|| get(&ItemKey::RecordingDate))
            .and_then(|s| parse_leading_number(&s)),
        genre: get(&ItemKey::Genre),
        duration: props.duration().as_secs_f64(),
        bitrate: props.audio_bitrate(),
        sample_rate: props.sample_rate(),
        channels: props.channels(),
        format,
        cover,
    })
}

/// Tag values like "3/12" or "2024-05-01" carry the number up front.
fn parse_leading_number(raw: &str) -> Option<u32> {
    let digits: String = raw.trim().chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// Best-effort "Artist - Title" filename split, used only when tags are absent.
fn split_filename(stem: &str) -> (String, String) {
    let mut parts: Vec<&str> = stem.split(" - ").map(str::trim).collect();

    // Drop a leading track number: "01 - Artist - Title"
    if parts.len() >= 3 && parts[0].chars().all(|c| c.is_ascii_digit()) {
        parts.remove(0);
    }

    if parts.len() >= 2 {
        (parts[0].to_string(), parts[1..].join(" - "))
    } else {
        ("Unknown Artist".to_string(), stem.to_string())
    }
}

/// Copies the file into `library/{artist}/{album}/`, never referencing it in
/// place — the whole point of a local-first library is that it survives the
/// original file being moved, renamed or deleted.
fn copy_into_library(library: &Library, source: &Path, meta: &Metadata) -> Result<PathBuf> {
    let artist_dir = sanitize_component(
        meta.album_artist
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(&meta.artist),
    );
    let album_dir = sanitize_component(&meta.album);

    let dir = library.audio_dir().join(artist_dir).join(album_dir);
    fs::create_dir_all(&dir)?;

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3")
        .to_ascii_lowercase();

    let base = match meta.track_no {
        Some(n) => format!("{:02} {}", n, sanitize_component(&meta.title)),
        None => sanitize_component(&meta.title),
    };

    let dest = unique_path(&dir, &base, &ext);
    fs::copy(source, &dest)
        .with_context(|| format!("copying into {}", dest.display()))?;
    Ok(dest)
}

/// Two different songs can legitimately share artist/album/title, so suffix
/// rather than overwrite. (Identical *content* was already caught by the hash.)
fn unique_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{base}.{ext}"));
    if !first.exists() {
        return first;
    }
    for n in 2..10_000 {
        let candidate = dir.join(format!("{base} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{base} ({}).{ext}", std::process::id()))
}

fn write_cover(library: &Library, hash: &str, cover: &Cover) -> Result<Option<PathBuf>> {
    if cover.data.is_empty() {
        return Ok(None);
    }
    let path = library
        .covers_dir()
        .join(format!("{hash}.{}", cover.extension));
    fs::write(&path, &cover.data)?;
    Ok(Some(path))
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 128 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

/// Recursively collects audio files from a folder the user dropped or picked.
pub fn collect_audio_files(root: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    if root.is_file() {
        if has_audio_extension(root) {
            out.push(root.to_path_buf());
        }
        return Ok(());
    }

    let entries = fs::read_dir(root).with_context(|| format!("reading {}", root.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Ignore unreadable subfolders rather than aborting the whole import.
            let _ = collect_audio_files(&path, out);
        } else if has_audio_extension(&path) {
            out.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_split_handles_common_shapes() {
        assert_eq!(
            split_filename("Aphex Twin - Xtal"),
            ("Aphex Twin".into(), "Xtal".into())
        );
        assert_eq!(
            split_filename("01 - Boards of Canada - Roygbiv"),
            ("Boards of Canada".into(), "Roygbiv".into())
        );
        assert_eq!(
            split_filename("Just A Title"),
            ("Unknown Artist".into(), "Just A Title".into())
        );
        // A hyphen inside the title survives.
        assert_eq!(
            split_filename("Artist - Some - Title"),
            ("Artist".into(), "Some - Title".into())
        );
    }

    #[test]
    fn leading_numbers_parse_from_messy_tags() {
        assert_eq!(parse_leading_number("3/12"), Some(3));
        assert_eq!(parse_leading_number("2024-05-01"), Some(2024));
        assert_eq!(parse_leading_number(" 7 "), Some(7));
        assert_eq!(parse_leading_number("none"), None);
    }

    #[test]
    fn sanitize_strips_path_separators() {
        assert_eq!(sanitize_component("AC/DC"), "AC_DC");
        assert_eq!(sanitize_component("  "), "Unknown");
        assert_eq!(sanitize_component("trailing."), "trailing");
        assert_eq!(sanitize_component("a:b*c?"), "a_b_c_");
    }

    #[test]
    fn extension_filter_is_case_insensitive() {
        assert!(has_audio_extension(Path::new("a.MP3")));
        assert!(has_audio_extension(Path::new("a.flac")));
        assert!(!has_audio_extension(Path::new("a.txt")));
        assert!(!has_audio_extension(Path::new("noext")));
    }

    #[test]
    fn unique_path_suffixes_on_collision() {
        let dir = std::env::temp_dir().join(format!("sl-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();

        let first = unique_path(&dir, "song", "mp3");
        assert_eq!(first.file_name().unwrap(), "song.mp3");
        fs::write(&first, b"x").unwrap();

        let second = unique_path(&dir, "song", "mp3");
        assert_eq!(second.file_name().unwrap(), "song (2).mp3");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn hashing_is_content_addressed() {
        let dir = std::env::temp_dir().join(format!("sl-hash-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.bin");
        let b = dir.join("b.bin");
        fs::write(&a, b"identical bytes").unwrap();
        fs::write(&b, b"identical bytes").unwrap();

        assert_eq!(hash_file(&a).unwrap(), hash_file(&b).unwrap());

        fs::write(&b, b"different bytes").unwrap();
        assert_ne!(hash_file(&a).unwrap(), hash_file(&b).unwrap());

        fs::remove_dir_all(&dir).unwrap();
    }
}
