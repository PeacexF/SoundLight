import { formatDuration } from "../lib/api";
import { useCurrentTrack, usePlayer } from "../store/player";
import { Cover } from "./Cover";
import { Icon } from "./Icon";

export function PlayerBar() {
  const track = useCurrentTrack();
  const {
    isPlaying,
    position,
    duration,
    volume,
    muted,
    repeat,
    shuffle,
    error,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    cycleRepeat,
    toggleShuffle,
  } = usePlayer();

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const volPct = (muted ? 0 : volume) * 100;

  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-4 border-t border-line bg-panel px-4">
      {/* Now playing */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {track ? (
          <>
            <Cover path={track.cover_path} size={48} />
            <div className="min-w-0">
              <div className="truncate font-medium">{track.title}</div>
              <div className="truncate text-xs text-ink-dim">{track.artist}</div>
            </div>
          </>
        ) : (
          <div className="text-sm text-ink-mute">Nothing playing</div>
        )}
      </div>

      {/* Transport */}
      <div className="flex w-[42%] max-w-2xl flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <IconButton
            label="Shuffle"
            active={shuffle}
            onClick={toggleShuffle}
            icon="shuffle"
          />
          <IconButton label="Previous" onClick={previous} icon="prev" size={18} />

          <button
            onClick={toggle}
            disabled={!track}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-9 w-9 place-items-center rounded-full bg-ink text-app transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          >
            <Icon name={isPlaying ? "pause" : "play"} size={17} />
          </button>

          <IconButton label="Next" onClick={next} icon="next" size={18} />
          <IconButton
            label={`Repeat: ${repeat}`}
            active={repeat !== "off"}
            onClick={cycleRepeat}
            icon="repeat"
            badge={repeat === "one" ? "1" : undefined}
          />
        </div>

        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-[11px] tabular-nums text-ink-mute">
            {formatDuration(position)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={position}
            disabled={!track}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            className="h-1 flex-1"
            style={{
              ["--track-bg" as string]: `linear-gradient(to right, var(--color-accent) ${pct}%, #33333d ${pct}%)`,
            }}
          />
          <span className="w-10 text-[11px] tabular-nums text-ink-mute">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex flex-1 items-center justify-end gap-2">
        {error && (
          <span className="max-w-[16rem] truncate text-xs text-red-400" title={error}>
            {error}
          </span>
        )}
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          icon={muted || volume === 0 ? "mute" : "volume"}
          size={17}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 w-24"
          style={{
            ["--track-bg" as string]: `linear-gradient(to right, var(--color-ink-dim) ${volPct}%, #33333d ${volPct}%)`,
          }}
        />
      </div>
    </footer>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  active = false,
  size = 16,
  badge,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  onClick: () => void;
  active?: boolean;
  size?: number;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative transition ${
        active ? "text-accent" : "text-ink-dim hover:text-ink"
      }`}
    >
      <Icon name={icon} size={size} />
      {badge && (
        <span className="absolute -right-1 -top-1 text-[9px] font-bold">{badge}</span>
      )}
    </button>
  );
}
