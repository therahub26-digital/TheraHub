"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { setEmployeeGalleryUrls } from "@/lib/actions/employees";

// ---------------------------------------------------------------------
// Manager-facing photo album editor for a single therapist — "isi
// maksimal 3 foto", user request 2026-08-22. Mirrors
// AlarmSoundSetting.tsx's pattern: upload goes straight from this
// browser to Supabase Storage (bucket `therapist-photos`, see
// 0017_therapist_gallery_booking_window_schedule.sql's header) using the
// signed-in manager's own session — storage RLS decides whether the
// upload is allowed, scoped to the therapist's own outlet or admin/
// owner. Only the resulting list of public URLs is persisted onto
// employees.gallery_urls afterward, via setEmployeeGalleryUrls().
//
// Rendered inline (small trigger + popover-style panel) rather than as
// its own page, since /manager/therapists is a roster table and this
// needs to live per-row without blowing up the table's height when
// closed.
// ---------------------------------------------------------------------

const MAX_BYTES = 3 * 1024 * 1024; // 3MB — matches the bucket's file_size_limit
const MAX_PHOTOS = 3;

export default function EmployeePhotoGallery({ employeeId, initialUrls }: { employeeId: string; initialUrls: string[] }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState(initialUrls);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function persist(next: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeGalleryUrls(employeeId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrls(next);
    });
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same filename later
    if (!file) return;

    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG, PNG, atau WEBP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran file maksimal 3MB.");
      return;
    }
    if (urls.length >= MAX_PHOTOS) {
      setError(`Maksimal ${MAX_PHOTOS} foto — hapus salah satu dulu untuk menambah yang baru.`);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${employeeId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("therapist-photos").upload(path, file, { upsert: true });
      if (uploadErr) {
        setError("Gagal mengunggah — coba lagi.");
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from("therapist-photos").getPublicUrl(path);
      setUploading(false);
      persist([...urls, pub.publicUrl]);
    } catch {
      setError("Gagal mengunggah — coba lagi.");
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    persist(urls.filter((u) => u !== url));
  }

  const busy = uploading || isPending;

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
        <Icon name="image" size={13} /> Foto {urls.length > 0 ? `(${urls.length})` : ""}
      </button>

      {open && (
        <div
          className="stack g3"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, width: 260,
            background: "var(--bg-surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            padding: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <div className="row between" style={{ alignItems: "center" }}>
            <span className="tiny bold" style={{ color: "var(--text-2)" }}>Album Foto ({urls.length}/{MAX_PHOTOS})</span>
            <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Tutup">
              <Icon name="x" size={13} />
            </button>
          </div>

          {urls.length > 0 && (
            <div className="grid grid-3" style={{ gap: 6 }}>
              {urls.map((url) => (
                <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Foto terapis" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removePhoto(url)}
                    aria-label="Hapus foto"
                    style={{
                      position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%",
                      background: "rgba(3,7,12,0.7)", border: "none", color: "#fff", display: "flex",
                      alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer",
                    }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChosen} />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || urls.length >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload" size={13} /> {uploading ? "Mengunggah…" : "Tambah Foto"}
          </button>

          <div className="tiny dim">Format JPG/PNG/WEBP, maksimal 3MB, maksimal {MAX_PHOTOS} foto.</div>

          {error && (
            <div className="tiny" style={{ color: "var(--danger)" }}>
              <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
