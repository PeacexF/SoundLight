import { Audio, AVPlaybackStatus } from 'expo-av';
import { Track, QueueState, PlayerState } from '../types';
import { incrementPlayCount } from '../db/db';

let currentSound: Audio.Sound | null = null;
let listeners: Array<(state: QueueState) => void> = [];

const state: QueueState = {
  tracks: [],
  currentIndex: -1,
  playerState: 'stopped',
  positionMs: 0,
  durationMs: 0,
};

// Pub API
export function subscribe(fn: (state: QueueState) => void): () => void {
  listeners.push(fn);
  fn({ ...state });
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function getState(): QueueState {
  return { ...state };
}

export async function playQueue(tracks: Track[], startIndex = 0): Promise<void> {
  state.tracks = tracks;
  state.currentIndex = startIndex;
  await loadAndPlay();
}

export async function playTrack(track: Track): Promise<void> {
  await playQueue([track], 0);
}

export async function togglePlayPause(): Promise<void> {
  if (!currentSound) return;
  if (state.playerState === 'playing') {
    await currentSound.pauseAsync();
  } else {
    await currentSound.playAsync();
  }
}

export async function seekTo(positionMs: number): Promise<void> {
  if (!currentSound) return;
  await currentSound.setPositionAsync(positionMs);
}

export async function next(): Promise<void> {
  if (state.currentIndex < state.tracks.length - 1) {
    state.currentIndex += 1;
    await loadAndPlay();
  }
}

export async function previous(): Promise<void> {
  if (state.positionMs > 3000) {
    await seekTo(0);
  } else if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    await loadAndPlay();
  }
}

export async function addToQueue(track: Track): Promise<void> {
  state.tracks.push(track);
  emit();
}

export async function clearQueue(): Promise<void> {
  await unloadCurrent();
  state.tracks = [];
  state.currentIndex = -1;
  state.playerState = 'stopped';
  state.positionMs = 0;
  state.durationMs = 0;
  emit();
}

// Internal

async function loadAndPlay(): Promise<void> {
  const track = currentTrack();
  if (!track) return;

  await unloadCurrent();

  state.playerState = 'loading';
  emit();

  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: track.file_path },
    { shouldPlay: true, progressUpdateIntervalMillis: 500 },
    onPlaybackStatusUpdate
  );

  currentSound = sound;
  await incrementPlayCount(track.id);
}

async function unloadCurrent(): Promise<void> {
  if (currentSound) {
    await currentSound.unloadAsync();
    currentSound = null;
  }
}

function onPlaybackStatusUpdate(status: AVPlaybackStatus): void {
  if (!status.isLoaded) {
    if (status.error) {
      console.error('Playback error:', status.error);
      state.playerState = 'stopped';
      emit();
    }
    return;
  }

  state.positionMs = status.positionMillis;
  state.durationMs = status.durationMillis ?? 0;
  state.playerState = status.isPlaying ? 'playing' : 'paused';

  if (status.didJustFinish) {
    handleTrackEnd();
  }

  emit();
}

async function handleTrackEnd(): Promise<void> {
  if (state.currentIndex < state.tracks.length - 1) {
    state.currentIndex += 1;
    await loadAndPlay();
  } else {
    // End of queue
    state.playerState = 'stopped';
    state.positionMs = 0;
    emit();
  }
}

function currentTrack(): Track | null {
  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) return null;
  return state.tracks[state.currentIndex];
}

function emit(): void {
  const snapshot = { ...state };
  for (const fn of listeners) fn(snapshot);
}