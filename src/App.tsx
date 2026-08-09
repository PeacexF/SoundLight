import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api } from "./lib/api";
import { useLibrary } from "./store/library";
import { usePlayer } from "./store/player";
import { Sidebar, type View } from "./components/Sidebar";
import { TrackList } from "./components/TrackList";
import { PlayerBar } from "./components/PlayerBar";
import { ImportToast } from "./components/ImportToast";
import { Icon } from "./components/Icon";
import type { Track } from "./types";

export default function App() {
  const [view, setView] = useState<View>({ kind: "library" });
  const { tracks, query, loading, error, refresh, refreshPlaylists, setQuery, importPaths } =
    useLibrary();
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  useEffect(() => {
    void refresh();
    void refreshPlaylists();
  }, [refresh, refreshPlaylists]);

  // Playlist contents are fetched on demand rather than kept in the store.
  useEffect(() => {
    if (view.kind !== "playlist") return;
    let stale = false;
    api.playlistTracks(view.id).then((t) => {
      if (!stale) setPlaylistTracks(t);
    });
    return () => {
      stale = true;
    };
  }, [view]);

  // Dropping files or folders onto the window imports them.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void importPaths(event.payload.paths);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [importPaths]);

  // Space toggles playback unless the user is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        usePlayer.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showing = view.kind === "library" ? tracks : playlistTracks;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onNavigate={setView} />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-4 px-5 pb-4 pt-5">
            <h1 className="text-2xl font-bold tracking-tight">
              {view.kind === "library" ? "Library" : view.name}
            </h1>

            {view.kind === "library" && (
              <label className="ml-auto flex h-9 w-72 items-center gap-2 rounded-full bg-raised px-3.5 focus-within:ring-1 focus-within:ring-accent">
                <Icon name="search" size={15} className="shrink-0 text-ink-mute" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your library"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-ink-mute"
                />
              </label>
            )}
          </header>

          {error && (
            <div className="mx-5 mb-3 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid flex-1 place-items-center text-sm text-ink-mute">
              Loading…
            </div>
          ) : (
            <TrackList
              tracks={showing}
              empty={
                view.kind === "playlist" ? (
                  <EmptyState
                    title="This playlist is empty"
                    hint="Add tracks to it from your library."
                  />
                ) : query ? (
                  <EmptyState title={`No results for "${query}"`} hint="Try another search." />
                ) : (
                  <EmptyState
                    title="Your library is empty"
                    hint="Drop files here, or use Add files / Add folder."
                  />
                )
              }
            />
          )}

          <ImportToast />
        </main>
      </div>

      <PlayerBar />
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon name="note" size={40} className="text-line" />
      <div className="mt-1 font-medium">{title}</div>
      <div className="max-w-xs text-sm text-ink-mute">{hint}</div>
    </div>
  );
}
