import { useState } from "react";
import { api } from "../lib/api";
import type { TagEdit, Track } from "../types";
import { Button, Dialog, Field } from "./Dialog";

interface Props {
  tracks: Track[];
  onClose: () => void;
  onSaved: () => void;
}

/** Placeholder shown when a field differs across a multi-track selection. */
const MIXED = "—";

export function EditTagsDialog({ tracks, onClose, onSaved }: Props) {
  const multi = tracks.length > 1;

  // For multiple tracks, a field starts blank when values disagree; leaving it
  // blank means "don't touch", which is what you want for a bulk album rename.
  const shared = (pick: (t: Track) => string | number | null) => {
    const first = pick(tracks[0]);
    return tracks.every((t) => pick(t) === first) ? String(first ?? "") : "";
  };

  const [form, setForm] = useState({
    title: multi ? "" : tracks[0].title,
    artist: shared((t) => t.artist),
    album: shared((t) => t.album),
    album_artist: shared((t) => t.album_artist),
    track_no: multi ? "" : String(tracks[0].track_no ?? ""),
    disc_no: shared((t) => t.disc_no),
    year: shared((t) => t.year),
    genre: shared((t) => t.genre),
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  async function save() {
    setSaving(true);
    setErrors([]);

    // Only send fields the user actually filled in.
    const edit: TagEdit = {};
    const text = (k: "title" | "artist" | "album" | "album_artist" | "genre") => {
      if (form[k] !== "") edit[k] = form[k];
    };
    const num = (k: "track_no" | "disc_no" | "year") => {
      const parsed = parseInt(form[k], 10);
      if (!Number.isNaN(parsed)) edit[k] = parsed;
    };
    if (!multi) edit.title = form.title;
    text("artist");
    text("album");
    text("album_artist");
    text("genre");
    num("track_no");
    num("disc_no");
    num("year");

    try {
      if (multi) {
        const failures = await api.updateTracks(tracks.map((t) => t.id), edit);
        if (failures.length > 0) {
          setErrors(failures);
          setSaving(false);
          return;
        }
      } else {
        await api.updateTrack(tracks[0].id, edit);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErrors([String(e)]);
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={multi ? `Edit ${tracks.length} tracks` : "Edit track"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {multi && (
        <p className="mb-3 text-[12px] leading-relaxed text-faint">
          Blank fields are left untouched. Fill one in to apply it to all {tracks.length}{" "}
          tracks.
        </p>
      )}

      {!multi && <Field label="Title" value={form.title} onChange={set("title")} autoFocus />}
      <Field
        label="Artist"
        value={form.artist}
        onChange={set("artist")}
        placeholder={multi ? MIXED : undefined}
      />
      <Field
        label="Album"
        value={form.album}
        onChange={set("album")}
        placeholder={multi ? MIXED : undefined}
      />
      <Field
        label="Album artist"
        value={form.album_artist}
        onChange={set("album_artist")}
        placeholder={multi ? MIXED : undefined}
      />

      <div className="grid grid-cols-3 gap-2">
        {!multi && <Field label="Track #" value={form.track_no} onChange={set("track_no")} />}
        <Field label="Disc #" value={form.disc_no} onChange={set("disc_no")} />
        <Field label="Year" value={form.year} onChange={set("year")} />
        {multi && <Field label="Genre" value={form.genre} onChange={set("genre")} />}
      </div>
      {!multi && <Field label="Genre" value={form.genre} onChange={set("genre")} />}

      {errors.length > 0 && (
        <div className="mt-2 max-h-28 overflow-y-auto rounded-md bg-red-950/40 p-2 text-[12px] text-red-300">
          {errors.map((e, i) => (
            <div key={i} className="truncate" title={e}>
              {e}
            </div>
          ))}
        </div>
      )}

      {!multi && (
        <p className="mt-2 break-all text-[11px] text-faint">{tracks[0].file_path}</p>
      )}
    </Dialog>
  );
}
