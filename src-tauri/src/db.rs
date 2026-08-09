use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::Path;

use crate::model::{NewTrack, Playlist, Track};

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&conn)?;
    Ok(conn)
}

/// Migrations are a plain ladder keyed off `user_version`. Each step runs once,
/// in order, forever. Never edit a step that has shipped — add a new one.
fn migrate(conn: &Connection) -> Result<()> {
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

    if version < 1 {
        conn.execute_batch(V1)?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    Ok(())
}

const V1: &str = r#"
CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  artist       TEXT    NOT NULL DEFAULT '',
  album        TEXT    NOT NULL DEFAULT '',
  album_artist TEXT,
  track_no     INTEGER,
  disc_no      INTEGER,
  year         INTEGER,
  genre        TEXT,
  duration     REAL    NOT NULL DEFAULT 0,
  bitrate      INTEGER,
  sample_rate  INTEGER,
  channels     INTEGER,
  format       TEXT    NOT NULL DEFAULT '',
  file_path    TEXT    NOT NULL UNIQUE,
  file_size    INTEGER NOT NULL DEFAULT 0,
  cover_path   TEXT,
  hash         TEXT    NOT NULL UNIQUE,
  source_url   TEXT,
  date_added   INTEGER NOT NULL,
  last_played  INTEGER,
  play_count   INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tracks_artist   ON tracks(artist);
CREATE INDEX idx_tracks_album    ON tracks(album);
CREATE INDEX idx_tracks_archived ON tracks(archived);

CREATE TABLE playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id)    ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist, album,
  content='tracks', content_rowid='id'
);

CREATE TRIGGER tracks_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE TRIGGER tracks_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
END;

CREATE TRIGGER tracks_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;
"#;

const TRACK_COLUMNS: &str = "id, title, artist, album, album_artist, track_no, disc_no, year, \
     genre, duration, bitrate, sample_rate, channels, format, file_path, file_size, \
     cover_path, hash, source_url, date_added, last_played, play_count, archived";

fn row_to_track(row: &Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get("id")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album")?,
        album_artist: row.get("album_artist")?,
        track_no: row.get("track_no")?,
        disc_no: row.get("disc_no")?,
        year: row.get("year")?,
        genre: row.get("genre")?,
        duration: row.get("duration")?,
        bitrate: row.get("bitrate")?,
        sample_rate: row.get("sample_rate")?,
        channels: row.get("channels")?,
        format: row.get("format")?,
        file_path: row.get("file_path")?,
        file_size: row.get("file_size")?,
        cover_path: row.get("cover_path")?,
        hash: row.get("hash")?,
        source_url: row.get("source_url")?,
        date_added: row.get("date_added")?,
        last_played: row.get("last_played")?,
        play_count: row.get("play_count")?,
        archived: row.get::<_, i64>("archived")? != 0,
    })
}

pub fn track_by_hash(conn: &Connection, hash: &str) -> Result<Option<Track>> {
    let sql = format!("SELECT {TRACK_COLUMNS} FROM tracks WHERE hash = ?1");
    let found = conn
        .query_row(&sql, params![hash], row_to_track)
        .optional()?;
    Ok(found)
}

pub fn insert_track(conn: &Connection, t: &NewTrack, now: i64) -> Result<i64> {
    conn.execute(
        "INSERT INTO tracks (
            title, artist, album, album_artist, track_no, disc_no, year, genre,
            duration, bitrate, sample_rate, channels, format, file_path, file_size,
            cover_path, hash, source_url, date_added, play_count, archived
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, 0, 0
         )",
        params![
            t.title,
            t.artist,
            t.album,
            t.album_artist,
            t.track_no,
            t.disc_no,
            t.year,
            t.genre,
            t.duration,
            t.bitrate,
            t.sample_rate,
            t.channels,
            t.format,
            t.file_path,
            t.file_size,
            t.cover_path,
            t.hash,
            t.source_url,
            now,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_tracks(conn: &Connection) -> Result<Vec<Track>> {
    let sql = format!(
        "SELECT {TRACK_COLUMNS} FROM tracks WHERE archived = 0
         ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE, disc_no, track_no, title COLLATE NOCASE"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_track)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn search_tracks(conn: &Connection, query: &str) -> Result<Vec<Track>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return list_tracks(conn);
    }

    let sql = format!(
        "SELECT {} FROM tracks t
         JOIN tracks_fts f ON f.rowid = t.id
         WHERE tracks_fts MATCH ?1 AND t.archived = 0
         ORDER BY rank",
        TRACK_COLUMNS
            .split(", ")
            .map(|c| format!("t.{c}"))
            .collect::<Vec<_>>()
            .join(", ")
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![fts_query(trimmed)], row_to_track)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Turns raw user input into a safe FTS5 prefix query. Every token is wrapped in
/// double quotes so FTS operators the user typed (`-`, `*`, `OR`, `NEAR`) are
/// treated as literal text and can't produce a syntax error.
fn fts_query(input: &str) -> String {
    input
        .split_whitespace()
        .map(|tok| format!("\"{}\"*", tok.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn mark_played(conn: &Connection, track_id: i64, now: i64) -> Result<()> {
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1, last_played = ?2 WHERE id = ?1",
        params![track_id, now],
    )?;
    Ok(())
}

pub fn set_archived(conn: &Connection, track_id: i64, archived: bool) -> Result<()> {
    conn.execute(
        "UPDATE tracks SET archived = ?2 WHERE id = ?1",
        params![track_id, archived as i64],
    )?;
    Ok(())
}

pub fn track_by_id(conn: &Connection, id: i64) -> Result<Option<Track>> {
    let sql = format!("SELECT {TRACK_COLUMNS} FROM tracks WHERE id = ?1");
    Ok(conn.query_row(&sql, params![id], row_to_track).optional()?)
}

/// Applies an edit to the row. Only fields present in the edit are touched, so
/// the UI can send a partial update without clobbering anything else.
pub fn update_track_metadata(conn: &Connection, id: i64, edit: &crate::tags::TagEdit) -> Result<()> {
    conn.execute(
        "UPDATE tracks SET
            title        = COALESCE(?2, title),
            artist       = COALESCE(?3, artist),
            album        = COALESCE(?4, album),
            album_artist = COALESCE(?5, album_artist),
            track_no     = COALESCE(?6, track_no),
            disc_no      = COALESCE(?7, disc_no),
            year         = COALESCE(?8, year),
            genre        = COALESCE(?9, genre)
         WHERE id = ?1",
        params![
            id,
            edit.title,
            edit.artist,
            edit.album,
            edit.album_artist,
            edit.track_no,
            edit.disc_no,
            edit.year,
            edit.genre,
        ],
    )?;
    Ok(())
}

/// Removes the row and returns the files it owned, so the caller can decide
/// whether to unlink them.
pub fn delete_track(conn: &Connection, id: i64) -> Result<Option<(String, Option<String>)>> {
    let paths = conn
        .query_row(
            "SELECT file_path, cover_path FROM tracks WHERE id = ?1",
            params![id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()?;

    if paths.is_some() {
        conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])?;
    }
    Ok(paths)
}

/// Rows whose audio file has vanished from disk.
pub fn missing_files(conn: &Connection) -> Result<Vec<Track>> {
    Ok(list_tracks(conn)?
        .into_iter()
        .filter(|t| !std::path::Path::new(&t.file_path).is_file())
        .collect())
}

// -- Playlists ---------------------------------------------------------------

pub fn create_playlist(conn: &Connection, name: &str, now: i64) -> Result<i64> {
    conn.execute(
        "INSERT INTO playlists (name, description, created_at) VALUES (?1, NULL, ?2)",
        params![name, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_playlists(conn: &Connection) -> Result<Vec<Playlist>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.created_at,
                (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
         FROM playlists p
         ORDER BY p.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            created_at: row.get("created_at")?,
            track_count: row.get("track_count")?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn playlist_tracks(conn: &Connection, playlist_id: i64) -> Result<Vec<Track>> {
    let sql = format!(
        "SELECT {} FROM tracks t
         JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ?1 AND t.archived = 0
         ORDER BY pt.position",
        TRACK_COLUMNS
            .split(", ")
            .map(|c| format!("t.{c}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![playlist_id], row_to_track)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn add_to_playlist(conn: &Connection, playlist_id: i64, track_id: i64) -> Result<()> {
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        params![playlist_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
         VALUES (?1, ?2, ?3)",
        params![playlist_id, track_id, next],
    )?;
    Ok(())
}

pub fn remove_from_playlist(conn: &Connection, playlist_id: i64, track_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
        params![playlist_id, track_id],
    )?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
    Ok(())
}

pub fn rename_playlist(conn: &Connection, playlist_id: i64, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE playlists SET name = ?2 WHERE id = ?1",
        params![playlist_id, name],
    )?;
    Ok(())
}

/// Rewrites the whole ordering in one transaction — simpler and less error-prone
/// than trying to shuffle individual positions around.
pub fn reorder_playlist(conn: &mut Connection, playlist_id: i64, track_ids: &[i64]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "UPDATE playlist_tracks SET position = ?3
             WHERE playlist_id = ?1 AND track_id = ?2",
        )?;
        for (position, track_id) in track_ids.iter().enumerate() {
            stmt.execute(params![playlist_id, track_id, position as i64])?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn sample(hash: &str, title: &str, artist: &str) -> NewTrack {
        NewTrack {
            title: title.into(),
            artist: artist.into(),
            album: "Album".into(),
            album_artist: None,
            track_no: None,
            disc_no: None,
            year: None,
            genre: None,
            duration: 180.0,
            bitrate: Some(320),
            sample_rate: Some(44100),
            channels: Some(2),
            format: "MP3".into(),
            file_path: format!("/tmp/{hash}.mp3"),
            file_size: 1024,
            cover_path: None,
            hash: hash.into(),
            source_url: None,
        }
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = mem();
        migrate(&conn).unwrap();
        let v: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn fts5_is_available_and_searchable() {
        let conn = mem();
        insert_track(&conn, &sample("h1", "Blue Monday", "New Order"), 0).unwrap();
        insert_track(&conn, &sample("h2", "Temptation", "New Order"), 0).unwrap();
        insert_track(&conn, &sample("h3", "Bizarre Love", "Pet Shop Boys"), 0).unwrap();

        assert_eq!(search_tracks(&conn, "new order").unwrap().len(), 2);
        // Prefix matching
        assert_eq!(search_tracks(&conn, "tempt").unwrap().len(), 1);
        // Empty query falls through to the full list
        assert_eq!(search_tracks(&conn, "  ").unwrap().len(), 3);
    }

    #[test]
    fn fts_query_neutralizes_operators() {
        let conn = mem();
        insert_track(&conn, &sample("h1", "Song", "Artist").into(), 0).unwrap();
        // These would be FTS5 syntax errors if passed through raw.
        for nasty in ["\"", "-foo", "a OR", "NEAR(", "*", "x AND"] {
            assert!(
                search_tracks(&conn, nasty).is_ok(),
                "query {nasty:?} should not error"
            );
        }
    }

    #[test]
    fn duplicate_hash_is_rejected() {
        let conn = mem();
        insert_track(&conn, &sample("same", "A", "X"), 0).unwrap();
        let mut dup = sample("same", "B", "Y");
        dup.file_path = "/tmp/other.mp3".into();
        assert!(insert_track(&conn, &dup, 0).is_err());
        assert!(track_by_hash(&conn, "same").unwrap().is_some());
    }

    #[test]
    fn fts_index_follows_updates_and_deletes() {
        let conn = mem();
        let id = insert_track(&conn, &sample("h1", "Original", "Artist"), 0).unwrap();

        conn.execute("UPDATE tracks SET title = 'Renamed' WHERE id = ?1", params![id])
            .unwrap();
        assert_eq!(search_tracks(&conn, "Renamed").unwrap().len(), 1);
        assert_eq!(search_tracks(&conn, "Original").unwrap().len(), 0);

        conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
            .unwrap();
        assert_eq!(search_tracks(&conn, "Renamed").unwrap().len(), 0);
    }

    #[test]
    fn playlist_positions_increment_and_cascade() {
        let conn = mem();
        let a = insert_track(&conn, &sample("h1", "A", "X"), 0).unwrap();
        let b = insert_track(&conn, &sample("h2", "B", "X"), 0).unwrap();
        let pid = create_playlist(&conn, "Mix", 0).unwrap();

        add_to_playlist(&conn, pid, a).unwrap();
        add_to_playlist(&conn, pid, b).unwrap();
        add_to_playlist(&conn, pid, a).unwrap(); // dupe is a no-op

        let tracks = playlist_tracks(&conn, pid).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].id, a);
        assert_eq!(list_playlists(&conn).unwrap()[0].track_count, 2);

        // Deleting a track should drop its playlist entries.
        conn.execute("DELETE FROM tracks WHERE id = ?1", params![b])
            .unwrap();
        assert_eq!(playlist_tracks(&conn, pid).unwrap().len(), 1);
    }
}
