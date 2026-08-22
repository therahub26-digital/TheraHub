"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { setAlarmSoundUrl } from "@/lib/actions/outlets";

// ---------------------------------------------------------------------
// Manager-facing control for the "session ran out of time" alarm sound
// heard on the therapist session page (components/SessionAlarm.tsx).
// Requested directly by the user: instead of a fixed beep, a manager
// should be able to upload their own sound.
//
// Upload goes straight from this browser to Supabase Storage (bucket
// `alarm-sounds`, first Storage usage in this codebase — see
// 0015_alarm_sound.sql's header) using the signed-in user's own session,
// not a Server Action — storage RLS (alarm_sounds_insert) is what
// actually decides whether this upload is allowed, scoped to the
// manager's own outlet or admin/owner. Only the resulting public URL is
// then persisted onto the outlet row via setAlarmSoundUrl().
// ---------------------------------------------------------------------

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — matches the bucket's file_size_limit, checked client-side first for a fast error instead of waiting on the upload to be rejected server-side.

export default function AlarmSoundSetting({ outletId, currentUrl }: { outletId: string; currentUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same filename later
    if (!file) return;

    setError(null);

    if (!file.type.startsWith("audio/")) {
      setError("File harus berupa audio (MP3, WAV, atau OGG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran file maksimal 2MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${outletId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("alarm-sounds").upload(path, file, { upsert: true });
      if (uploadErr) {
        setError("Gagal mengunggah — coba lagi.");
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from("alarm-sounds").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      startTransition(async () => {
        const result = await setAlarmSoundUrl(outletId, publicUrl);
        setUploading(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setUrl(publicUrl);
      });
    } catch {
      setError("Gagal mengunggah — coba lagi.");
      setUploading(false);
    }
  }

  function resetToDefault() {
    setError(null);
    startTransition(async () => {
      const result = await setAlarmSoundUrl(outletId, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(null);
    });
  }

  const busy = uploading || isPending;

  return (
    <div className="stack g3">
      <div className="row between" style={{ alignItems: "center" }}>
        <div>
          <div className="small strong" style={{ color: "var(--text-1)" }}>
            {url ? "Suara kustom aktif" : "Pakai bunyi default"}
          </div>
          <div className="tiny dim">
            {url ? "Terapis akan mendengar suara ini saat waktu sesi habis." : "Bunyi beep bawaan aplikasi — belum ada suara kustom diunggah."}
          </div>
        </div>
        {url && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => audioRef.current?.play().catch(() => {})}>
            <Icon name="play" size={13} /> Dengarkan
          </button>
        )}
      </div>

      {url && <audio ref={audioRef} src={url} preload="none" />}

      <div className="row g2">
        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onFileChosen} />
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={pickFile}>
          <Icon name="upload" size={13} /> {uploading ? "Mengunggah…" : "Unggah Suara Baru"}
        </button>
        {url && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={resetToDefault}>
            <Icon name="rotate-ccw" size={13} /> Kembalikan ke Default
          </button>
        )}
      </div>

      <div className="tiny dim">Format MP3/WAV/OGG, maksimal 2MB.</div>

      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
    </div>
  );
}
