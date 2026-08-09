import type { Sort, Track } from "../types";

const COMPARATORS: Record<Sort["key"], (a: Track, b: Track) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  artist: (a, b) =>
    a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) ||
    (a.track_no ?? 0) - (b.track_no ?? 0),
  album: (a, b) =>
    a.album.localeCompare(b.album) ||
    (a.disc_no ?? 0) - (b.disc_no ?? 0) ||
    (a.track_no ?? 0) - (b.track_no ?? 0),
  duration: (a, b) => a.duration - b.duration,
  date_added: (a, b) => a.date_added - b.date_added,
};

/** Playlists carry their own order, so sorting there is opt-in only. */
export function sortTracks(tracks: Track[], sort: Sort | null): Track[] {
  if (!sort) return tracks;
  const cmp = COMPARATORS[sort.key];
  const sorted = tracks.slice().sort(cmp);
  return sort.dir === "desc" ? sorted.reverse() : sorted;
}
