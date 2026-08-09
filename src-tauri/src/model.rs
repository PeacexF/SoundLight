use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    /// Seconds.
    pub duration: f64,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub format: String,
    pub file_path: String,
    pub file_size: i64,
    pub cover_path: Option<String>,
    pub hash: String,
    /// Where it was downloaded from, if it was.
    pub source_url: Option<String>,
    pub date_added: i64,
    pub last_played: Option<i64>,
    pub play_count: i64,
    pub archived: bool,
}

/// Everything the ingest pipeline knows before a row exists.
#[derive(Debug, Clone)]
pub struct NewTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: f64,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub format: String,
    pub file_path: String,
    pub file_size: i64,
    pub cover_path: Option<String>,
    pub hash: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub track_count: i64,
}

#[derive(Debug, Default, Serialize)]
pub struct ImportReport {
    pub imported: usize,
    /// Already in the library (same content hash).
    pub duplicates: usize,
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Serialize)]
pub struct ImportFailure {
    pub path: String,
    pub error: String,
}
