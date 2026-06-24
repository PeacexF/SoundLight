export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  bitrate: number | null;
  file_path: string;
  cover_path: string | null;
  date_added: number;
  play_count: number;
  archived: boolean;
  hash: string | null;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
}

export interface PlaylistTrack {
  playlist_id: number;
  track_id: number;
  position: number;
}

export type PlayerState = 'playing' | 'paused' | 'stopped' | 'loading';

export interface QueueState {
  tracks: Track[];
  currentIndex: number;
  playerState: PlayerState;
  positionMs: number;
  durationMs: number;
}