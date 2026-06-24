import * as SQLite from 'expo-sqlite';
import { Track, Playlist, PlaylistTrack } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('soundlight.db');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tracks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      artist     TEXT NOT NULL DEFAULT '',
      album      TEXT NOT NULL DEFAULT '',
      duration   REAL NOT NULL DEFAULT 0,
      bitrate    INTEGER,
      file_path  TEXT NOT NULL UNIQUE,
      cover_path TEXT,
      date_added INTEGER NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      archived   INTEGER NOT NULL DEFAULT 0,
      hash       TEXT
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_artist  ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album   ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_archived ON tracks(archived);

    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts
      USING fts5(title, artist, album, content=tracks, content_rowid=id);
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album)
      VALUES (new.id, new.title, new.artist, new.album);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
      VALUES ('delete', old.id, old.title, old.artist, old.album);
    END;

    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
      VALUES ('delete', old.id, old.title, old.artist, old.album);
      INSERT INTO tracks_fts(rowid, title, artist, album)
      VALUES (new.id, new.title, new.artist, new.album);
    END;
  `);
}

// Tracks
export async function insertTrack(
  track: Omit<Track, 'id' | 'play_count' | 'archived'>
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO tracks
       (title, artist, album, duration, bitrate, file_path, cover_path, date_added, play_count, archived, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [
      track.title,
      track.artist,
      track.album,
      track.duration,
      track.bitrate ?? null,
      track.file_path,
      track.cover_path ?? null,
      track.date_added,
      track.hash ?? null,
    ]
  );
  return result.lastInsertRowId;
}

export async function getAllTracks(): Promise<Track[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE archived = 0 ORDER BY artist, album, title`
  );
  return rows.map(normalizeTrack);
}

export async function searchTracks(query: string): Promise<Track[]> {
  if (!query.trim()) return getAllTracks();
  const db = await getDb();
  const escaped = query.trim().replace(/"/g, '""');
  const rows = await db.getAllAsync<Track>(
    `SELECT t.* FROM tracks t
     JOIN tracks_fts ON tracks_fts.rowid = t.id
     WHERE tracks_fts MATCH ? AND t.archived = 0
     ORDER BY rank`,
    [`"${escaped}"*`]
  );
  return rows.map(normalizeTrack);
}

export async function incrementPlayCount(trackId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tracks SET play_count = play_count + 1 WHERE id = ?`,
    [trackId]
  );
}

export async function archiveTrack(trackId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tracks SET archived = 1 WHERE id = ?`, [trackId]);
}

export async function restoreTrack(trackId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tracks SET archived = 0 WHERE id = ?`, [trackId]);
}

// Playlists
export async function createPlaylist(name: string, description?: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO playlists (name, description, created_at) VALUES (?, ?, ?)`,
    [name, description ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  return db.getAllAsync<Playlist>(`SELECT * FROM playlists ORDER BY name`);
}

export async function getPlaylistTracks(playlistId: number): Promise<Track[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Track>(
    `SELECT t.* FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position`,
    [playlistId]
  );
  return rows.map(normalizeTrack);
}

export async function addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ max_pos: number | null }>(
    `SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?`,
    [playlistId]
  );
  const nextPos = (row?.max_pos ?? -1) + 1;
  await db.runAsync(
    `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)`,
    [playlistId, trackId, nextPos]
  );
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
    [playlistId, trackId]
  );
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, [playlistId]);
}


function normalizeTrack(row: Track): Track {
  return {
    ...row,
    archived: Boolean(row.archived),
  };
}