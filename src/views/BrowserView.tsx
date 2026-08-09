import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { useBrowser } from "../store/browser";
import { useDownloads } from "../store/downloads";

/**
 * The page renders in a native child webview. On macOS that view is a sibling
 * of the main webview and renders *above* it regardless of the bounds we set —
 * verified in practice: the frontend measured x=224 y=46 correctly and the page
 * still covered the whole window.
 *
 * So this view deliberately owns no chrome. The address bar, Download and Close
 * are injected into the page itself (see `browser.rs::init_script`), where
 * nothing can occlude them.
 */
export function BrowserView({ active }: { active: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState("");
  const { url, open, close } = useBrowser();
  const { extract } = useDownloads();

  const rect = () => {
    const r = slot.current?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  };

  const syncRect = useCallback(async () => {
    const r = rect();
    if (r) await api.browserResize(r);
  }, []);

  // A hot reload leaves the native webview floating with React unaware of it.
  useEffect(() => {
    void api.browserClose();
  }, []);

  useEffect(() => {
    if (!url || !active) {
      void api.browserClose();
      return;
    }
    const el = slot.current;
    if (!el) return;
    const r = rect();
    if (r) void api.browserOpen(url, r);

    const observer = new ResizeObserver(() => void syncRect());
    observer.observe(el);
    window.addEventListener("resize", syncRect);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncRect);
    };
  }, [active, url, syncRect]);

  // The injected toolbar reaches us through blocked navigations to a sentinel
  // host, which Rust turns into these events.
  useEffect(() => {
    const subs = [
      listen<{ url: string }>("browser://navigated", (e) => setAddress(e.payload.url)),
      listen("browser://download", () => void extract()),
      listen("browser://close", () => close()),
    ];
    return () => {
      for (const s of subs) void s.then((f) => f());
    };
  }, [extract, close]);

  return (
    <div ref={slot} className="flex min-h-0 flex-1 flex-col">
      {!url && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (address.trim()) open(address.trim());
            }}
            className="w-full max-w-md"
          >
            <input
              autoFocus
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              placeholder="Search, or paste any link"
              className="w-full rounded-md bg-raised px-3.5 py-2.5 text-[13px] outline-none ring-white/15 placeholder:text-faint focus:ring-1"
            />
          </form>
          <p className="text-[12px] text-faint">
            The toolbar appears at the top of the page once it loads.
          </p>
        </div>
      )}
    </div>
  );
}
