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
    <div className="absolute bottom-4 right-4 z-10 w-80 rounded-lg border border-line bg-raised p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Import finished</div>
          <div className="mt-0.5 text-xs text-ink-dim">{parts.join(" · ")}</div>

          {failed.length > 0 && (
            <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-ink-mute">
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
          className="text-ink-mute transition hover:text-ink"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  );
}
