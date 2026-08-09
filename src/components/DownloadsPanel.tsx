import { useDownloads } from "../store/downloads";
import type { DownloadProgress } from "../types";
import { Icon } from "./Icon";

const LABELS: Record<DownloadProgress["stage"], string> = {
  starting: "Starting",
  downloading: "Downloading",
  converting: "Converting",
  importing: "Importing",
  done: "Done",
  failed: "Failed",
};

export function DownloadsPanel() {
  const { jobs, panelOpen, setPanelOpen, clearFinished } = useDownloads();
  if (!panelOpen) return null;

  return (
    <div className="w-[22rem] rounded-xl border border-line bg-surface shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[12px] font-medium">Downloads</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearFinished}
            className="rounded px-1.5 py-0.5 text-[11px] text-faint transition hover:text-dim"
          >
            Clear
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close downloads"
            className="rounded p-1 text-faint transition hover:text-text"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto px-3 pb-3">
        {jobs.length === 0 && (
          <p className="py-3 text-center text-[12px] text-faint">Nothing downloading.</p>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="border-t border-line py-2 first:border-t-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]" title={job.title}>
                {job.title}
              </span>
              <span
                className={`shrink-0 text-[11px] ${
                  job.stage === "failed"
                    ? "text-red-400"
                    : job.stage === "done"
                      ? "text-accent"
                      : "text-faint"
                }`}
              >
                {LABELS[job.stage]}
              </span>
            </div>

            {job.stage !== "done" && job.stage !== "failed" && (
              <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full bg-accent transition-all ${
                    job.percent === null ? "w-1/3 animate-pulse" : ""
                  }`}
                  style={job.percent !== null ? { width: `${job.percent}%` } : undefined}
                />
              </div>
            )}

            {job.detail && (
              <div
                className={`mt-1 truncate text-[11px] ${
                  job.stage === "failed" ? "text-red-400/80" : "text-faint"
                }`}
                title={job.detail}
              >
                {job.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
