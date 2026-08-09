import { formatDuration } from "../lib/api";
import type { Track } from "../types";
import { Cover } from "./Cover";
import { Icon } from "./Icon";

interface Props {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}

export function TrackRow({ track, index, isCurrent, isPlaying, onPlay }: Props) {
  return (
    <button
      onDoubleClick={onPlay}
      onClick={onPlay}
      className={`group grid w-full grid-cols-[2rem_auto_1fr_1fr_4rem] items-center gap-3 rounded px-3 py-1.5 text-left
        ${isCurrent ? "bg-hover" : "hover:bg-hover"}`}
    >
      <span className="grid h-4 w-8 place-items-center text-xs tabular-nums text-ink-mute">
        {isCurrent && isPlaying ? (
          <Icon name="volume" size={13} className="text-accent" />
        ) : (
          <>
            <span className="group-hover:hidden">{index + 1}</span>
            <Icon name="play" size={12} className="hidden text-ink group-hover:block" />
          </>
        )}
      </span>

      <Cover path={track.cover_path} size={36} />

      <span className="min-w-0">
        <span
          className={`block truncate ${isCurrent ? "text-accent" : "text-ink"}`}
        >
          {track.title}
        </span>
        <span className="block truncate text-xs text-ink-dim">{track.artist}</span>
      </span>

      <span className="min-w-0 truncate text-sm text-ink-dim">{track.album}</span>

      <span className="text-right text-xs tabular-nums text-ink-mute">
        {formatDuration(track.duration)}
      </span>
    </button>
  );
}
