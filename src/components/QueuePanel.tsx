import { formatDuration } from "../lib/api";
import { usePlayer } from "../store/player";
import { Cover } from "./Cover";
import { Icon } from "./Icon";

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue, index, jumpTo, removeFromQueue, clearQueue } = usePlayer();
  const upcoming = queue.slice(index + 1);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[13px] font-medium">Queue</span>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="rounded px-1.5 py-0.5 text-[11px] text-faint transition hover:text-dim"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close queue"
            className="rounded p-1 text-faint transition hover:text-text"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {index >= 0 && queue[index] && (
          <>
            <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-wider text-faint">
              Now playing
            </div>
            <Row track={queue[index]} current onClick={() => {}} />
          </>
        )}

        <div className="px-2 pb-1 pt-3 text-[11px] uppercase tracking-wider text-faint">
          Next up
        </div>

        {upcoming.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-faint">Nothing queued.</p>
        ) : (
          upcoming.map((track, i) => (
            <Row
              key={`${track.id}-${i}`}
              track={track}
              onClick={() => jumpTo(index + 1 + i)}
              onRemove={() => removeFromQueue(track.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function Row({
  track,
  current = false,
  onClick,
  onRemove,
}: {
  track: import("../types").Track;
  current?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onDoubleClick={onClick}
      className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.035]"
    >
      <Cover path={track.cover_path} size={30} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12.5px] ${current ? "text-accent" : ""}`}>
          {track.title}
        </div>
        <div className="truncate text-[11px] text-dim">{track.artist}</div>
      </div>
      {onRemove ? (
        <button
          onClick={onRemove}
          aria-label="Remove from queue"
          className="hidden shrink-0 p-1 text-faint transition hover:text-text group-hover:block"
        >
          <Icon name="x" size={12} />
        </button>
      ) : (
        <span className="shrink-0 text-[11px] tabular-nums text-faint">
          {formatDuration(track.duration)}
        </span>
      )}
    </div>
  );
}
