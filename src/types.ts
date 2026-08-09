export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  album_artist: string | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  genre: string | null;
  /** Seconds. */
  duration: number;
  bitrate: number | null;
  sample_rate: number | null;
  channels: number | null;
  format: string;
  file_path: string;
  file_size: number;
  cover_path: string | null;
  hash: string;
  source_url: string | null;
  date_added: number;
  last_played: number | null;
  play_count: number;
  archived: boolean;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
  track_count: number;
}

export interface ImportReport {
  imported: number;
  duplicates: number;
  failed: { path: string; error: string }[];
}

export type RepeatMode = "off" | "all" | "one";

export interface ToolStatus {
  yt_dlp: string | null;
  ffmpeg: string | null;
  can_download: boolean;
  can_transcode: boolean;
}

export type DownloadStage =
  | "starting"
  | "downloading"
  | "converting"
  | "importing"
  | "done"
  | "failed";

export interface DownloadProgress {
  id: number;
  url: string;
  title: string;
  stage: DownloadStage;
  percent: number | null;
  detail: string | null;
}

/** Fields left undefined are not touched; empty strings clear a tag. */
export interface TagEdit {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  track_no?: number;
  disc_no?: number;
  year?: number;
  genre?: string;
}

export type SortKey = "title" | "artist" | "album" | "duration" | "date_added";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}
