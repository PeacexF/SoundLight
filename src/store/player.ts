import { create } from "zustand";
import { api, fileUrl } from "../lib/api";
import type { RepeatMode, Track } from "../types";

/**
 * One `<audio>` element for the whole app. Playing through the webview rather
 * than Rust buys us the Media Session API — OS media keys and the native
 * now-playing widget on all three platforms — for almost no code.
 */
const audio = new Audio();
audio.preload = "auto";

interface PlayerState {
  /** Current play order (already shuffled, if shuffle is on). */
  queue: Track[];
  /** Original order, so shuffle can be undone. */
  sourceQueue: Track[];
  index: number;
  isPlaying: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  error: string | null;

  playQueue: (tracks: Track[], startIndex: number) => void;
  enqueueNext: (tracks: Track[]) => void;
  enqueue: (tracks: Track[]) => void;
  removeFromQueue: (trackId: number) => void;
  jumpTo: (index: number) => void;
  clearQueue: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const usePlayer = create<PlayerState>((set, get) => {
  function load(index: number, autoplay: boolean) {
    const { queue } = get();
    const track = queue[index];
    if (!track) return;

    set({ index, loading: true, position: 0, error: null });
    audio.src = fileUrl(track.file_path);
    audio.load();

    if (autoplay) {
      audio.play().catch((e) => set({ error: String(e), isPlaying: false }));
    }

    api.markPlayed(track.id).catch(() => {
      /* play counts are best-effort */
    });
    updateMediaSession(track);
  }

  function updateMediaSession(track: Track) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.cover_path
        ? [{ src: fileUrl(track.cover_path), sizes: "512x512" }]
        : [],
    });
  }

  // --- audio element -> store ---
  audio.addEventListener("timeupdate", () => set({ position: audio.currentTime }));
  audio.addEventListener("durationchange", () =>
    set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
  );
  audio.addEventListener("play", () => set({ isPlaying: true, loading: false }));
  audio.addEventListener("pause", () => set({ isPlaying: false }));
  audio.addEventListener("canplay", () => set({ loading: false }));
  audio.addEventListener("error", () => {
    const track = get().queue[get().index];
    set({
      loading: false,
      isPlaying: false,
      error: track ? `Can't play "${track.title}" — the file may be missing.` : "Playback failed.",
    });
  });

  audio.addEventListener("ended", () => {
    const { repeat, index, queue } = get();

    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (index < queue.length - 1) {
      load(index + 1, true);
      return;
    }
    if (repeat === "all" && queue.length > 0) {
      load(0, true);
      return;
    }
    set({ isPlaying: false, position: 0 });
  });

  return {
    queue: [],
    sourceQueue: [],
    index: -1,
    isPlaying: false,
    loading: false,
    position: 0,
    duration: 0,
    volume: 1,
    muted: false,
    repeat: "off",
    shuffle: false,
    error: null,

    playQueue(tracks, startIndex) {
      if (tracks.length === 0) return;
      const { shuffle } = get();

      if (shuffle) {
        // Keep the clicked track first, shuffle everything behind it.
        const picked = tracks[startIndex];
        const rest = shuffled(tracks.filter((_, i) => i !== startIndex));
        set({ sourceQueue: tracks, queue: [picked, ...rest] });
        load(0, true);
      } else {
        set({ sourceQueue: tracks, queue: tracks });
        load(startIndex, true);
      }
    },

    enqueueNext(tracks) {
      const { queue, index } = get();
      if (queue.length === 0) {
        get().playQueue(tracks, 0);
        return;
      }
      const next = queue.slice();
      next.splice(index + 1, 0, ...tracks);
      set({ queue: next });
    },

    enqueue(tracks) {
      const { queue } = get();
      if (queue.length === 0) {
        get().playQueue(tracks, 0);
        return;
      }
      set({ queue: [...queue, ...tracks] });
    },

    removeFromQueue(trackId) {
      const { queue, index } = get();
      const at = queue.findIndex((t) => t.id === trackId);
      if (at < 0 || at === index) return; // never yank the playing track
      set({
        queue: queue.filter((_, i) => i !== at),
        index: at < index ? index - 1 : index,
      });
    },

    jumpTo(target) {
      if (target >= 0 && target < get().queue.length) load(target, true);
    },

    clearQueue() {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      set({ queue: [], sourceQueue: [], index: -1, isPlaying: false, position: 0, duration: 0 });
    },

    toggle() {
      if (get().index < 0) return;
      if (audio.paused) {
        audio.play().catch((e) => set({ error: String(e) }));
      } else {
        audio.pause();
      }
    },

    next() {
      const { index, queue, repeat } = get();
      if (index < queue.length - 1) load(index + 1, true);
      else if (repeat === "all" && queue.length > 0) load(0, true);
    },

    previous() {
      const { index, queue, repeat } = get();
      // Restart the track first, like every other music player.
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      if (index > 0) load(index - 1, true);
      else if (repeat === "all" && queue.length > 0) load(queue.length - 1, true);
      else audio.currentTime = 0;
    },

    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
      set({ position: audio.currentTime });
    },

    setVolume(v) {
      const clamped = Math.max(0, Math.min(1, v));
      audio.volume = clamped;
      audio.muted = false;
      set({ volume: clamped, muted: false });
    },

    toggleMute() {
      const muted = !get().muted;
      audio.muted = muted;
      set({ muted });
    },

    cycleRepeat() {
      const order: RepeatMode[] = ["off", "all", "one"];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: next });
    },

    toggleShuffle() {
      const { shuffle, queue, sourceQueue, index } = get();
      const current = queue[index];

      if (!shuffle) {
        const rest = shuffled(queue.filter((_, i) => i !== index));
        set({
          shuffle: true,
          queue: current ? [current, ...rest] : shuffled(queue),
          index: current ? 0 : index,
        });
      } else {
        // Restore original order, keeping the current track current.
        const restored = sourceQueue.length ? sourceQueue : queue;
        const at = current ? restored.findIndex((t) => t.id === current.id) : -1;
        set({ shuffle: false, queue: restored, index: at >= 0 ? at : index });
      }
    },
  };
});

// --- OS media keys ---
if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => usePlayer.getState().toggle());
  ms.setActionHandler("pause", () => usePlayer.getState().toggle());
  ms.setActionHandler("nexttrack", () => usePlayer.getState().next());
  ms.setActionHandler("previoustrack", () => usePlayer.getState().previous());
  ms.setActionHandler("seekto", (d) => {
    if (d.seekTime != null) usePlayer.getState().seek(d.seekTime);
  });

  usePlayer.subscribe((s) => {
    ms.playbackState = s.isPlaying ? "playing" : s.index >= 0 ? "paused" : "none";
  });
}

/** The track that's actually loaded, or null. */
export function useCurrentTrack(): Track | null {
  return usePlayer((s) => (s.index >= 0 ? s.queue[s.index] ?? null : null));
}
