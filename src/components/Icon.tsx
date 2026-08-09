interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

const FILLED = new Set(["play", "pause", "note"]);

const PATHS = {
  play: "M8 5.14v13.72a1 1 0 0 0 1.54.84l10.71-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z",
  pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z",
  note: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  prev: "M7 5v14M19 5.5v13a1 1 0 0 1-1.55.83L8 12.83a1 1 0 0 1 0-1.66l9.45-6.5A1 1 0 0 1 19 5.5Z",
  next: "M17 5v14M5 5.5v13a1 1 0 0 0 1.55.83L16 12.83a1 1 0 0 0 0-1.66l-9.45-6.5A1 1 0 0 0 5 5.5Z",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  repeat: "M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  volume: "M11 5 6 9H2v6h4l5 4V5Z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13",
  mute: "M11 5 6 9H2v6h4l5 4V5Z M22 9l-6 6M16 9l6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  download: "M12 3v12M7 11l5 5 5-5M4 21h16",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z",
  back: "M19 12H5M12 19l-7-7 7-7",
  forward: "M5 12h14M12 5l7 7-7 7",
  reload: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  more: "M12 6h.01M12 12h.01M12 18h.01",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  check: "M20 6 9 17l-5-5",
  // Sliders rather than a gear: a gear needs arcs that don't survive being
  // flattened into this single-path icon set.
  settings: "M3 8h11M18 8h3M3 16h5M12 16h9M16 5.5v5M9 13.5v5",
  queue: "M3 6h11M3 12h11M3 18h7M17 10v9M21 8l-4 2",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "" }: Props) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
