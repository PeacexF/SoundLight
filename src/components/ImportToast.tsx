import { useLibrary } from "../store/library";
import { Icon } from "./Icon";

/** Import results matter enough to report, but not enough to interrupt. */
export function ImportToast() {
  const { lastImport, dismissImport } = useLibrary();
  if (!lastImport) return null;

  const { imported, duplicates, failed } = lastImport;
  const parts = [
    `${imported} added`,
    duplicates > 0 && `${duplicates} already in library`,
    failed.length > 0 && `${failed.length} failed`,
  ].filter(Boolean);

  return (
    <div className="w-[22rem] rounded-xl border border-line bg-surface p-3 shadow-2xl shadow-black/60">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium">Import finished</div>
          <div className="mt-0.5 text-[11.5px] text-dim">{parts.join(" · ")}</div>

          {failed.length > 0 && (
            <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-faint">
              {failed.slice(0, 8).map((f) => (
                <li key={f.path} className="truncate" title={`${f.path}: ${f.error}`}>
                  {f.path.split("/").pop()} — {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={dismissImport}
          aria-label="Dismiss"
          className="text-faint transition hover:text-text"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
