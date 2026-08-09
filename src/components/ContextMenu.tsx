import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Renders a nested submenu instead of acting on click. */
  items?: MenuItem[];
  separatorBefore?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<number | null>(null);

  // Keep the menu inside the window rather than letting it run off an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-52 rounded-lg border border-line bg-raised py-1 shadow-2xl shadow-black/60"
    >
      {items.map((item, i) => (
        <div key={i} className="relative">
          {item.separatorBefore && <div className="my-1 h-px bg-line" />}
          <button
            disabled={item.disabled}
            onMouseEnter={() => setOpenSub(item.items ? i : null)}
            onClick={() => {
              if (item.items) return;
              item.onSelect?.();
              onClose();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition
              ${item.disabled ? "cursor-default text-faint" : "hover:bg-white/5"}
              ${item.danger && !item.disabled ? "text-red-400" : ""}`}
          >
            {item.icon && <Icon name={item.icon} size={14} className="shrink-0 opacity-70" />}
            <span className="flex-1 truncate">{item.label}</span>
            {item.items && <Icon name="forward" size={12} className="opacity-50" />}
          </button>

          {item.items && openSub === i && (
            <div className="absolute left-full top-0 ml-1 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-line bg-raised py-1 shadow-2xl shadow-black/60">
              {item.items.length === 0 && (
                <div className="px-3 py-1.5 text-[13px] text-faint">Nothing here</div>
              )}
              {item.items.map((sub, j) => (
                <button
                  key={j}
                  onClick={() => {
                    sub.onSelect?.();
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-white/5"
                >
                  <span className="flex-1 truncate">{sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Small helper so views can wire up right-click with two lines. */
export function useContextMenu<T>() {
  const [state, setState] = useState<{ x: number; y: number; target: T } | null>(null);

  return {
    menu: state,
    open(e: React.MouseEvent, target: T) {
      e.preventDefault();
      setState({ x: e.clientX, y: e.clientY, target });
    },
    close: () => setState(null),
  };
}
