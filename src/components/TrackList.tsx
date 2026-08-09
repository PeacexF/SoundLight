import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration } from "../lib/api";
import { sortTracks } from "../lib/sort";
import { useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import type { Sort, SortKey, Track } from "../types";
import { ContextMenu, useContextMenu, type MenuItem } from "./ContextMenu";
import { Cover } from "./Cover";
import { Button, Dialog } from "./Dialog";
import { EditTagsDialog } from "./EditTagsDialog";
import { Icon } from "./Icon";

interface Props {
  tracks: Track[];
  empty: React.ReactNode;
  /** Set when viewing a playlist: enables reordering and "remove from playlist". */
  playlistId?: number;
  onChanged: () => void;
}

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "title", label: "Title", className: "" },
  { key: "album", label: "Album", className: "" },
  { key: "duration", label: "Time", className: "text-right" },
];

export function TrackList({ tracks, empty, playlistId, onChanged }: Props) {
  const { playlists, refreshPlaylists } = useLibrary();
  const { queue, index, isPlaying, playQueue, enqueueNext, enqueue } = usePlayer();
  const currentId = index >= 0 ? queue[index]?.id : undefined;

  const [sort, setSort] = useState<Sort | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Track[] | null>(null);
  const [deleting, setDeleting] = useState<Track[] | null>(null);
  const anchor = useRef<number | null>(null);
  const ctx = useContextMenu<Track>();

  // Playlists have a meaningful stored order, so they start unsorted.
  const shown = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);

  // Drop selections for tracks that no longer exist.
  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(tracks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]);

  function onRowClick(e: React.MouseEvent, track: Track, i: number) {
    if (e.shiftKey && anchor.current !== null) {
      const [from, to] = [anchor.current, i].sort((a, b) => a - b);
      setSelected(new Set(shown.slice(from, to + 1).map((t) => t.id)));
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected);
      next.has(track.id) ? next.delete(track.id) : next.add(track.id);
      setSelected(next);
      anchor.current = i;
    } else {
      setSelected(new Set([track.id]));
      anchor.current = i;
    }
  }

  /** Right-clicking outside the selection replaces it, like a file manager. */
  function targets(track: Track): Track[] {
    if (selected.has(track.id) && selected.size > 1) {
      return shown.filter((t) => selected.has(t.id));
    }
    return [track];
  }

  function menuFor(track: Track): MenuItem[] {
    const picked = targets(track);
    const many = picked.length > 1;

    return [
      {
        label: many ? `Play ${picked.length} tracks` : "Play",
        icon: "play",
        onSelect: () => playQueue(picked, 0),
      },
      { label: "Play next", icon: "queue", onSelect: () => enqueueNext(picked) },
      { label: "Add to queue", icon: "plus", onSelect: () => enqueue(picked) },
      {
        label: "Add to playlist",
        icon: "list",
        separatorBefore: true,
        items: playlists.map((p) => ({
          label: p.name,
          onSelect: async () => {
            for (const t of picked) await api.addToPlaylist(p.id, t.id);
            await refreshPlaylists();
          },
        })),
      },
      ...(playlistId
        ? [
            {
              label: "Remove from playlist",
              icon: "x" as const,
              onSelect: async () => {
                for (const t of picked) await api.removeFromPlaylist(playlistId, t.id);
                onChanged();
                await refreshPlaylists();
              },
            },
          ]
        : []),
      {
        label: many ? `Edit ${picked.length} tracks…` : "Edit info…",
        icon: "edit",
        separatorBefore: true,
        onSelect: () => setEditing(picked),
      },
      {
        label: "Show in file manager",
        icon: "folder",
        disabled: many,
        onSelect: () => api.revealTrack(track.file_path),
      },
      {
        label: many ? `Delete ${picked.length} from library` : "Delete from library",
        icon: "trash",
        danger: true,
        separatorBefore: true,
        onSelect: () => setDeleting(picked),
      },
    ];
  }

  // --- drag to reorder (playlists only, and only in stored order) ---
  const dragFrom = useRef<number | null>(null);
  const canReorder = playlistId !== undefined && sort === null;

  async function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to || playlistId === undefined) return;

    const reordered = shown.slice();
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    await api.reorderPlaylist(playlistId, reordered.map((t) => t.id));
    onChanged();
  }

  if (tracks.length === 0) {
    return <div className="grid flex-1 place-items-center">{empty}</div>;
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="sticky top-0 z-10 grid grid-cols-[1.75rem_2.25rem_1fr_1fr_3.5rem] items-center gap-3 bg-bg/95 px-2 pb-1.5 pt-1 text-[11px] text-faint backdrop-blur">
          <span className="text-center">#</span>
          <span />
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() =>
                setSort((s) =>
                  s?.key === col.key
                    ? s.dir === "asc"
                      ? { key: col.key, dir: "desc" }
                      : null
                    : { key: col.key, dir: "asc" },
                )
              }
              className={`flex items-center gap-1 transition hover:text-dim ${col.className} ${
                col.className.includes("right") ? "justify-end" : ""
              }`}
            >
              {col.label}
              {sort?.key === col.key && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
            </button>
          ))}
        </div>

        {shown.map((track, i) => {
          const isCurrent = track.id === currentId;
          const isSelected = selected.has(track.id);
          return (
            <div
              key={track.id}
              draggable={canReorder}
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => canReorder && e.preventDefault()}
              onDrop={() => canReorder && onDrop(i)}
              onClick={(e) => onRowClick(e, track, i)}
              onDoubleClick={() => playQueue(shown, i)}
              onContextMenu={(e) => {
                if (!selected.has(track.id)) setSelected(new Set([track.id]));
                ctx.open(e, track);
              }}
              className={`group grid cursor-default grid-cols-[1.75rem_2.25rem_1fr_1fr_3.5rem] items-center gap-3 rounded-md px-2 py-1 ${
                isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.035]"
              }`}
            >
              <span className="grid h-4 place-items-center text-[11px] tabular-nums text-faint">
                {isCurrent && isPlaying ? (
                  <Icon name="volume" size={12} className="text-accent" />
                ) : (
                  <>
                    <span className="group-hover:hidden">{i + 1}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playQueue(shown, i);
                      }}
                      className="hidden text-text group-hover:block"
                      aria-label={`Play ${track.title}`}
                    >
                      <Icon name="play" size={11} />
                    </button>
                  </>
                )}
              </span>

              <Cover path={track.cover_path} size={30} />

              <span className="min-w-0">
                <span className={`block truncate ${isCurrent ? "text-accent" : ""}`}>
                  {track.title}
                </span>
                <span className="block truncate text-[11.5px] text-dim">{track.artist}</span>
              </span>

              <span className="min-w-0 truncate text-dim">{track.album}</span>

              <span className="text-right text-[11.5px] tabular-nums text-faint">
                {formatDuration(track.duration)}
              </span>
            </div>
          );
        })}
      </div>

      {ctx.menu && (
        <ContextMenu
          x={ctx.menu.x}
          y={ctx.menu.y}
          items={menuFor(ctx.menu.target)}
          onClose={ctx.close}
        />
      )}

      {editing && (
        <EditTagsDialog
          tracks={editing}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}

      {deleting && (
        <DeleteDialog
          tracks={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            setSelected(new Set());
            onChanged();
          }}
        />
      )}
    </>
  );
}

function DeleteDialog({
  tracks,
  onClose,
  onDone,
}: {
  tracks: Track[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [alsoFiles, setAlsoFiles] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    await api.deleteTracks(tracks.map((t) => t.id), alsoFiles);
    onDone();
  }

  return (
    <Dialog
      title={tracks.length > 1 ? `Delete ${tracks.length} tracks?` : "Delete track?"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-dim">
        {tracks.length > 1
          ? `${tracks.length} tracks will be removed from your library.`
          : `"${tracks[0].title}" will be removed from your library.`}
      </p>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={alsoFiles}
          onChange={(e) => setAlsoFiles(e.target.checked)}
          className="accent-red-500"
        />
        Also delete the {tracks.length > 1 ? "files" : "file"} from disk
      </label>

      {!alsoFiles && (
        <p className="mt-2 text-[12px] text-faint">
          Files stay in your library folder and can be re-imported.
        </p>
      )}
    </Dialog>
  );
}
