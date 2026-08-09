import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api } from "./lib/api";
import { useLibrary } from "./store/library";
import { usePlayer } from "./store/player";
import { useDownloads } from "./store/downloads";
import { useBrowser } from "./store/browser";
import { Sidebar, type View } from "./components/Sidebar";
import { TrackList } from "./components/TrackList";
import { PlayerBar } from "./components/PlayerBar";
import { QueuePanel } from "./components/QueuePanel";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { ImportToast } from "./components/ImportToast";
import { BrowserView } from "./views/BrowserView";
import { SettingsView } from "./views/SettingsView";
import { Icon } from "./components/Icon";
import type { Track } from "./types";

export default function App() {
  const [view, setView] = useState<View>({ kind: "library" });
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  const { tracks, query, loading, error, refresh, refreshPlaylists, setQuery, importPaths } =
    useLibrary();
  const { refreshTools } = useDownloads();

  const loadPlaylist = useCallback(async (id: number) => {
    setPlaylistTracks(await api.playlistTracks(id));
  }, []);

  useEffect(() => {
    void refresh();
    void refreshPlaylists();
    void refreshTools();
  }, [refresh, refreshPlaylists, refreshTools]);

  useEffect(() => {
    if (view.kind === "playlist") void loadPlaylist(view.id);
  }, [view, loadPlaylist]);

  // Dropping files or folders anywhere imports them.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") void importPaths(event.payload.paths);
    });
    return () => void unlisten.then((f) => f());
  }, [importPaths]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        usePlayer.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onChanged = useCallback(() => {
    void refresh();
    if (view.kind === "playlist") void loadPlaylist(view.id);
  }, [refresh, view, loadPlaylist]);

  const showing = view.kind === "playlist" ? playlistTracks : tracks;
  const isBrowser = view.kind === "browser";

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          view={view}
          onNavigate={(next) => {
            // The open page covers the content area, so the sidebar is the only
            // control guaranteed to stay clickable. Tapping Browse again closes
            // whatever page is loaded.
            if (next.kind === "browser" && view.kind === "browser") {
              useBrowser.getState().close();
              return;
            }
            setView(next);
          }}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {!isBrowser && (
            <header className="flex items-center gap-4 px-5 pb-3 pt-5">
              <h1 className="text-[19px] font-semibold tracking-tight">
                {view.kind === "library"
                  ? "Library"
                  : view.kind === "settings"
                    ? "Settings"
                    : view.name}
              </h1>

              {view.kind === "library" && (
                <label className="ml-auto flex h-8 w-64 items-center gap-2 rounded-md bg-raised px-3 focus-within:ring-1 focus-within:ring-white/15">
                  <Icon name="search" size={14} className="shrink-0 text-faint" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-faint"
                  />
                </label>
              )}
            </header>
          )}

          {error && !isBrowser && (
            <div className="mx-5 mb-2 rounded-md bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          )}

          {/* The browser view stays mounted so its child webview isn't torn
              down and rebuilt every time you check the library. */}
          <div className={isBrowser ? "flex min-h-0 flex-1" : "hidden"}>
            <BrowserView active={isBrowser} />
          </div>

          {view.kind === "settings" && <SettingsView onChanged={onChanged} />}

          {(view.kind === "library" || view.kind === "playlist") &&
            (loading ? (
              <div className="grid flex-1 place-items-center text-[12.5px] text-faint">
                Loading…
              </div>
            ) : (
              <TrackList
                tracks={showing}
                playlistId={view.kind === "playlist" ? view.id : undefined}
                onChanged={onChanged}
                empty={
                  view.kind === "playlist" ? (
                    <Empty title="Empty playlist" hint="Right-click tracks to add them here." />
                  ) : query ? (
                    <Empty title={`No results for "${query}"`} hint="Try another search." />
                  ) : (
                    <Empty
                      title="Nothing here yet"
                      hint="Drop files in, or use Browse to download something."
                    />
                  )
                }
              />
            ))}

          {/* Both are bottom-right transients, so they stack instead of
              covering each other. */}
          <div className="absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
            <ImportToast />
            <DownloadsPanel />
          </div>
        </main>

        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>

      <PlayerBar onToggleQueue={() => setQueueOpen((v) => !v)} />
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Icon name="note" size={28} className="text-line" />
      <div className="mt-1 text-[13px]">{title}</div>
      <div className="max-w-xs text-[12px] text-faint">{hint}</div>
    </div>
  );
}
