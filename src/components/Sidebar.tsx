import { useState } from "react";
import { api, pickFiles, pickFolder } from "../lib/api";
import { useLibrary } from "../store/library";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { Icon, type IconName } from "./Icon";
import type { Playlist } from "../types";

export type View =
  | { kind: "library" }
  | { kind: "playlist"; id: number; name: string }
  | { kind: "browser" }
  | { kind: "settings" };

interface Props {
  view: View;
  onNavigate: (view: View) => void;
}

export function Sidebar({ view, onNavigate }: Props) {
  const { playlists, tracks, importing, importPaths, refreshPlaylists } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const ctx = useContextMenu<Playlist>();

  async function commitCreate() {
    const name = draft.trim();
    setCreating(false);
    setDraft("");
    if (!name) return;
    await api.createPlaylist(name);
    await refreshPlaylists();
  }

  async function commitRename(id: number) {
    const name = draft.trim();
    setRenaming(null);
    setDraft("");
    if (!name) return;
    await api.renamePlaylist(id, name);
    await refreshPlaylists();
    if (view.kind === "playlist" && view.id === id) onNavigate({ kind: "playlist", id, name });
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col">
      <div className="px-4 pb-4 pt-5 text-[13px] font-semibold tracking-tight">SoundLight</div>

      <nav className="px-2">
        <Item
          active={view.kind === "library"}
          icon="note"
          label="Library"
          count={tracks.length}
          onClick={() => onNavigate({ kind: "library" })}
        />
        <Item
          active={view.kind === "browser"}
          icon="globe"
          label="Browse"
          onClick={() => onNavigate({ kind: "browser" })}
        />
        <Item
          active={view.kind === "settings"}
          icon="settings"
          label="Settings"
          onClick={() => onNavigate({ kind: "settings" })}
        />
      </nav>

      <div className="mt-6 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] uppercase tracking-wider text-faint">Playlists</span>
        <button
          onClick={() => {
            setCreating(true);
            setDraft("");
          }}
          aria-label="New playlist"
          className="text-faint transition hover:text-text"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {creating && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Playlist name"
            className="mb-1 w-full rounded-md bg-raised px-2 py-1 text-[12.5px] outline-none placeholder:text-faint"
          />
        )}

        {playlists.map((p) =>
          renaming === p.id ? (
            <input
              key={p.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename(p.id);
                if (e.key === "Escape") setRenaming(null);
              }}
              className="mb-1 w-full rounded-md bg-raised px-2 py-1 text-[12.5px] outline-none"
            />
          ) : (
            <Item
              key={p.id}
              active={view.kind === "playlist" && view.id === p.id}
              icon="list"
              label={p.name}
              count={p.track_count}
              onClick={() => onNavigate({ kind: "playlist", id: p.id, name: p.name })}
              onContextMenu={(e) => ctx.open(e, p)}
            />
          ),
        )}

        {playlists.length === 0 && !creating && (
          <p className="px-2 py-1 text-[12px] text-faint">None yet.</p>
        )}
      </div>

      <div className="flex flex-col gap-1 p-2">
        <button
          onClick={async () => importPaths(await pickFiles())}
          disabled={importing}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-dim transition hover:bg-white/5 hover:text-text disabled:opacity-40"
        >
          <Icon name="plus" size={14} />
          {importing ? "Importing…" : "Add files"}
        </button>
        <button
          onClick={async () => importPaths(await pickFolder())}
          disabled={importing}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-dim transition hover:bg-white/5 hover:text-text disabled:opacity-40"
        >
          <Icon name="folder" size={14} />
          Add folder
        </button>
      </div>

      {ctx.menu && (
        <ContextMenu
          x={ctx.menu.x}
          y={ctx.menu.y}
          onClose={ctx.close}
          items={[
            {
              label: "Rename",
              icon: "edit",
              onSelect: () => {
                setDraft(ctx.menu!.target.name);
                setRenaming(ctx.menu!.target.id);
              },
            },
            {
              label: "Delete playlist",
              icon: "trash",
              danger: true,
              separatorBefore: true,
              onSelect: async () => {
                const { id } = ctx.menu!.target;
                await api.deletePlaylist(id);
                await refreshPlaylists();
                if (view.kind === "playlist" && view.id === id) {
                  onNavigate({ kind: "library" });
                }
              },
            },
          ]}
        />
      )}
    </aside>
  );
}

function Item({
  active,
  icon,
  label,
  count,
  onClick,
  onContextMenu,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  count?: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition ${
        active ? "bg-white/[0.07] text-text" : "text-dim hover:text-text"
      }`}
    >
      <Icon name={icon} size={14} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count !== undefined && <span className="text-[11px] tabular-nums text-faint">{count}</span>}
    </button>
  );
}
