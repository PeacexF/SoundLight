import { useState } from "react";
import { api, pickFiles, pickFolder } from "../lib/api";
import { useLibrary } from "../store/library";
import { Icon } from "./Icon";

export type View = { kind: "library" } | { kind: "playlist"; id: number; name: string };

interface Props {
  view: View;
  onNavigate: (view: View) => void;
}

export function Sidebar({ view, onNavigate }: Props) {
  const { playlists, tracks, importing, importPaths, refreshPlaylists } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await api.createPlaylist(trimmed);
    setName("");
    setCreating(false);
    await refreshPlaylists();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded bg-accent text-app">
            <Icon name="note" size={13} />
          </span>
          SoundLight
        </div>
      </div>

      <nav className="px-2">
        <NavItem
          active={view.kind === "library"}
          icon="library"
          label="Library"
          count={view.kind === "library" ? tracks.length : undefined}
          onClick={() => onNavigate({ kind: "library" })}
        />
      </nav>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Playlists
        </span>
        <button
          onClick={() => setCreating((v) => !v)}
          aria-label="New playlist"
          title="New playlist"
          className="text-ink-mute transition hover:text-ink"
        >
          <Icon name="plus" size={15} />
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="px-2 pb-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setCreating(false)}
            placeholder="Playlist name"
            className="w-full rounded bg-raised px-2 py-1.5 text-sm outline-none ring-accent placeholder:text-ink-mute focus:ring-1"
          />
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {playlists.map((p) => (
          <NavItem
            key={p.id}
            active={view.kind === "playlist" && view.id === p.id}
            icon="list"
            label={p.name}
            count={p.track_count}
            onClick={() => onNavigate({ kind: "playlist", id: p.id, name: p.name })}
          />
        ))}
        {playlists.length === 0 && !creating && (
          <p className="px-2 py-1 text-xs leading-relaxed text-ink-mute">
            No playlists yet.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line p-3">
        <button
          onClick={async () => importPaths(await pickFiles())}
          disabled={importing}
          className="flex items-center justify-center gap-2 rounded-full bg-accent px-3 py-2 text-sm font-semibold text-app transition hover:bg-accent-dim disabled:opacity-50"
        >
          <Icon name="plus" size={15} />
          {importing ? "Importing…" : "Add files"}
        </button>
        <button
          onClick={async () => importPaths(await pickFolder())}
          disabled={importing}
          className="flex items-center justify-center gap-2 rounded-full border border-line px-3 py-2 text-sm text-ink-dim transition hover:border-ink-mute hover:text-ink disabled:opacity-50"
        >
          <Icon name="folder" size={15} />
          Add folder
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition ${
        active ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
      }`}
    >
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] tabular-nums text-ink-mute">{count}</span>
      )}
    </button>
  );
}
