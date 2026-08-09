import { useState } from "react";
import { fileUrl } from "../lib/api";
import { Icon } from "./Icon";

interface Props {
  path: string | null;
  size: number;
  className?: string;
}

export function Cover({ path, size, className = "" }: Props) {
  const [broken, setBroken] = useState(false);

  const base = `shrink-0 rounded overflow-hidden bg-raised ${className}`;
  const style = { width: size, height: size };

  if (!path || broken) {
    return (
      <div
        className={`${base} grid place-items-center text-ink-mute`}
        style={style}
      >
        <Icon name="note" size={Math.round(size * 0.42)} />
      </div>
    );
  }

  return (
    <img
      src={fileUrl(path)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
      className={`${base} object-cover`}
      style={style}
    />
  );
}
