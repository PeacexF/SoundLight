import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useDownloads } from "../store/downloads";
import { Button } from "../components/Dialog";
import { Icon } from "../components/Icon";
import type { Track } from "../types";

export function SettingsView({ onChanged }: { onChanged: () => void }) {
  const { tools, installing, refreshTools, installYtDlp, updateYtDlp } = useDownloads();
  const [root, setRoot] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [missing, setMissing] = useState<Track[] | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void api.libraryRoot().then(setRoot);
    void refreshTools();
  }, [refreshTools]);

  async function scanMissing() {
    setScanning(true);
    setMissing(await api.missingTracks());
    setScanning(false);
  }

  async function removeMissing() {
    if (!missing) return;
    await api.deleteTracks(missing.map((t) => t.id), false);
    setMissing([]);
    onChanged();
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
      <Section title="Downloading">
        <Row
          label="yt-dlp"
          value={tools?.yt_dlp ?? "Not installed"}
          ok={!!tools?.can_download}
          action={
            tools?.can_download ? (
              <Button
                onClick={async () => setNote(await updateYtDlp())}
              >
                Update
              </Button>
            ) : (
              <Button variant="primary" onClick={installYtDlp} disabled={installing}>
                {installing ? "Installing…" : "Install"}
              </Button>
            )
          }
        />
        <p className="mb-4 text-[12px] leading-relaxed text-faint">
          yt-dlp is what extracts audio from a page. Without it, only direct links to audio
          files can be downloaded.
        </p>

        <Row
          label="ffmpeg"
          value={tools?.ffmpeg ?? "Not found"}
          ok={!!tools?.can_transcode}
          action={null}
        />
        <p className="text-[12px] leading-relaxed text-faint">
          Optional. With ffmpeg, downloads are converted to mp3 with artwork embedded. Without
          it, the best single audio stream is kept as-is — usually m4a or opus, which play
          fine.
        </p>

        {note && <p className="mt-3 text-[12px] text-accent">{note}</p>}
      </Section>

      <Section title="Library">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-faint">Location</div>
        <div className="mb-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-raised px-2.5 py-1.5 text-[12px] text-dim">
            {root || "…"}
          </code>
          <Button onClick={() => api.revealTrack(root)}>Open</Button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={scanMissing} disabled={scanning}>
            {scanning ? "Scanning…" : "Find missing files"}
          </Button>
          {missing !== null && (
            <span className="text-[12px] text-dim">
              {missing.length === 0
                ? "Every track is where it should be."
                : `${missing.length} track${missing.length === 1 ? "" : "s"} missing.`}
            </span>
          )}
        </div>

        {missing !== null && missing.length > 0 && (
          <div className="mt-3 rounded-md border border-line bg-surface p-2">
            <div className="max-h-40 overflow-y-auto">
              {missing.map((t) => (
                <div key={t.id} className="truncate py-0.5 text-[12px] text-dim">
                  {t.artist} — {t.title}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="danger" onClick={removeMissing}>
                Remove {missing.length} from library
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 max-w-2xl">
      <h2 className="mb-3 text-[13px] font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  ok,
  action,
}: {
  label: string;
  value: string;
  ok: boolean;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-md bg-surface px-3 py-2.5">
      <Icon
        name={ok ? "check" : "x"}
        size={14}
        className={ok ? "text-accent" : "text-faint"}
      />
      <span className="text-[13px]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-faint" title={value}>
        {value}
      </span>
      {action}
    </div>
  );
}
