import { create } from "zustand";
import { api } from "../lib/api";
import type { ImportReport, Playlist, Track } from "../types";

interface LibraryState {
  tracks: Track[];
  playlists: Playlist[];
  query: string;
  loading: boolean;
  importing: boolean;
  lastImport: ImportReport | null;
  error: string | null;

  refresh: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  setQuery: (q: string) => void;
  importPaths: (paths: string[]) => Promise<void>;
  dismissImport: () => void;
}

let searchToken = 0;

export const useLibrary = create<LibraryState>((set, get) => ({
  tracks: [],
  playlists: [],
  query: "",
  loading: true,
  importing: false,
  lastImport: null,
  error: null,

  async refresh() {
    const token = ++searchToken;
    const { query } = get();
    try {
      const tracks = query.trim()
        ? await api.searchTracks(query)
        : await api.listTracks();
      // A slower earlier search must not overwrite a newer one.
      if (token === searchToken) set({ tracks, loading: false, error: null });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  async refreshPlaylists() {
    try {
      set({ playlists: await api.listPlaylists() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setQuery(q) {
    set({ query: q });
    void get().refresh();
  },

  async importPaths(paths) {
    if (paths.length === 0) return;
    set({ importing: true, error: null });
    try {
      const report = await api.importPaths(paths);
      set({ lastImport: report, importing: false });
      await get().refresh();
    } catch (e) {
      set({ error: String(e), importing: false });
    }
  },

  dismissImport() {
    set({ lastImport: null });
  },
}));
