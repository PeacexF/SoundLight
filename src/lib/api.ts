import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImportReport, Playlist, TagEdit, ToolStatus, Track } from "../types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const api = {
  libraryRoot: () => invoke<string>("library_root"),
  importPaths: (paths: string[]) => invoke<ImportReport>("import_paths", { paths }),
  listTracks: () => invoke<Track[]>("list_tracks"),
  searchTracks: (query: string) => invoke<Track[]>("search_tracks", { query }),
  markPlayed: (trackId: number) => invoke<void>("mark_played", { trackId }),
  setArchived: (trackId: number, archived: boolean) =>
    invoke<void>("set_archived", { trackId, archived }),

  listPlaylists: () => invoke<Playlist[]>("list_playlists"),
  createPlaylist: (name: string) => invoke<number>("create_playlist", { name }),
  playlistTracks: (playlistId: number) =>
    invoke<Track[]>("playlist_tracks", { playlistId }),
  addToPlaylist: (playlistId: number, trackId: number) =>
    invoke<void>("add_to_playlist", { playlistId, trackId }),
  removeFromPlaylist: (playlistId: number, trackId: number) =>
    invoke<void>("remove_from_playlist", { playlistId, trackId }),
  deletePlaylist: (playlistId: number) =>
    invoke<void>("delete_playlist", { playlistId }),
  renamePlaylist: (playlistId: number, name: string) =>
    invoke<void>("rename_playlist", { playlistId, name }),
  reorderPlaylist: (playlistId: number, trackIds: number[]) =>
    invoke<void>("reorder_playlist", { playlistId, trackIds }),

  // Track management
  updateTrack: (trackId: number, edit: TagEdit) =>
    invoke<void>("update_track", { trackId, edit }),
  updateTracks: (trackIds: number[], edit: TagEdit) =>
    invoke<string[]>("update_tracks", { trackIds, edit }),
  deleteTracks: (trackIds: number[], deleteFiles: boolean) =>
    invoke<number>("delete_tracks", { trackIds, deleteFiles }),
  missingTracks: () => invoke<Track[]>("missing_tracks"),
  revealTrack: (path: string) => invoke<void>("reveal_track", { path }),

  // Browser
  browserOpen: (url: string, rect: Rect) => invoke<void>("browser_open", { url, rect }),
  browserResize: (rect: Rect) => invoke<void>("browser_resize", { rect }),
  browserClose: () => invoke<void>("browser_close"),
  browserNavigate: (url: string) => invoke<void>("browser_navigate", { url }),
  browserBack: () => invoke<void>("browser_back"),
  browserForward: () => invoke<void>("browser_forward"),
  browserReload: () => invoke<void>("browser_reload"),
  browserUrl: () => invoke<string | null>("browser_url"),

  // Downloads
  toolsStatus: () => invoke<ToolStatus>("tools_status"),
  installYtDlp: () => invoke<string>("install_yt_dlp"),
  updateYtDlp: () => invoke<string>("update_yt_dlp"),
  downloadExtract: (url?: string) => invoke<number>("download_extract", { url: url ?? null }),
  downloadDirect: (url: string) => invoke<number>("download_direct", { url }),
};

/** Native picker for files, then folders — both feed the same ingest command. */
export async function pickFiles(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "aiff", "wv"],
      },
    ],
  });
  return normalize(picked);
}

export async function pickFolder(): Promise<string[]> {
  const picked = await open({ multiple: true, directory: true });
  return normalize(picked);
}

function normalize(picked: string | string[] | null): string[] {
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

/** Local files must go through the asset protocol to be readable by the webview. */
export function fileUrl(path: string): string {
  return convertFileSrc(path);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
