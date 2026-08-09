import { formatDuration } from "../lib/api";
import { useCurrentTrack, usePlayer } from "../store/player";
import { useDownloads } from "../store/downloads";
import { Cover } from "./Cover";
import { Icon, type IconName } from "./Icon";

export function PlayerBar({ onToggleQueue }: { onToggleQueue: () => void }) {
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
  const { jobs, setPanelOpen } = useDownloads();

  const active = jobs.filter((j) => j.stage !== "done" && j.stage !== "failed").length;
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const volPct = (muted ? 0 : volume) * 100;

  return (
    <footer className="flex h-16 shrink-0 items-center gap-4 border-t border-line px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {track ? (
          <>
            <Cover path={track.cover_path} size={38} />
            <div className="min-w-0">
              <div className="truncate text-[12.5px]">{track.title}</div>
              <div className="truncate text-[11px] text-dim">{track.artist}</div>
            </div>
          </>
        ) : (
          <span className="text-[12px] text-faint">Nothing playing</span>
        )}
      </div>

      <div className="flex w-[40%] max-w-xl flex-col items-center gap-1">
        <div className="flex items-center gap-3.5">
          <Ctrl icon="shuffle" label="Shuffle" active={shuffle} onClick={toggleShuffle} />
          <Ctrl icon="prev" label="Previous" onClick={previous} size={16} />
          <button
            onClick={toggle}
            disabled={!track}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-8 w-8 place-items-center rounded-full bg-text text-bg transition hover:opacity-90 disabled:opacity-25"
          >
            <Icon name={isPlaying ? "pause" : "play"} size={15} />
          </button>
          <Ctrl icon="next" label="Next" onClick={next} size={16} />
          <Ctrl
            icon="repeat"
            label={`Repeat: ${repeat}`}
            active={repeat !== "off"}
            onClick={cycleRepeat}
            badge={repeat === "one" ? "1" : undefined}
          />
        </div>

        <div className="flex w-full items-center gap-2">
          <span className="w-9 text-right text-[10.5px] tabular-nums text-faint">
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
              ["--track-bg" as string]: `linear-gradient(to right, var(--color-accent) ${pct}%, #2a2a30 ${pct}%)`,
            }}
          />
          <span className="w-9 text-[10.5px] tabular-nums text-faint">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2.5">
        {error && (
          <span className="max-w-[14rem] truncate text-[11px] text-red-400" title={error}>
            {error}
          </span>
        )}

        <button
          onClick={() => setPanelOpen(true)}
          aria-label="Downloads"
          title="Downloads"
          className="relative text-dim transition hover:text-text"
        >
          <Icon name="download" size={15} />
          {active > 0 && (
            <span className="absolute -right-1.5 -top-1 rounded-full bg-accent px-1 text-[9px] font-semibold text-bg">
              {active}
            </span>
          )}
        </button>

        <Ctrl icon="queue" label="Queue" onClick={onToggleQueue} size={15} />
        <Ctrl
          icon={muted || volume === 0 ? "mute" : "volume"}
          label={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          size={15}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 w-20"
          style={{
            ["--track-bg" as string]: `linear-gradient(to right, var(--color-dim) ${volPct}%, #2a2a30 ${volPct}%)`,
          }}
        />
      </div>
    </footer>
  );
}

function Ctrl({
  icon,
  label,
  onClick,
  active = false,
  size = 14,
  badge,
}: {
  icon: IconName;
  label: string;
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
      className={`relative transition ${active ? "text-accent" : "text-dim hover:text-text"}`}
    >
      <Icon name={icon} size={size} />
      {badge && <span className="absolute -right-1 -top-1 text-[8px] font-bold">{badge}</span>}
    </button>
  );
}
