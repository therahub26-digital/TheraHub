"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { Field, Switch, InfoNote, Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_SPECS, specLine } from "@/lib/media";
import {
  setOutletProfileText,
  setOutletPublished,
  setOutletCoverUrl,
  setOutletHighlights,
  createOutletFacility,
  updateOutletFacility,
  deleteOutletFacility,
  addOutletGalleryPhoto,
  setOutletGalleryLabel,
  deleteOutletGalleryPhoto,
} from "@/lib/actions/outletProfile";

// ---------------------------------------------------------------------
// Client half of /admin/outlets/[id]/profile.
//
// Adjie (2026-08-25): "outlet: halaman profil outlet belum berfungsi."
// Setiap kontrol di halaman itu tadinya `disabled`. Komponen di file ini
// menggantikan semuanya dengan kontrol sungguhan yang memanggil
// lib/actions/outletProfile.ts.
//
// Pola unggah foto = pola yang sudah dipakai ProfilePhotoUploader
// (StaffEditor.tsx) dan TenantBrandingUploaders.tsx: unggah langsung ke
// Supabase Storage dari browser, lalu simpan URL publiknya lewat server
// action. Bucket + RLS-nya: supabase/migrations/0028_outlet_photos_bucket.sql
// (`outlet-photos`, public read, folder per outlet `<outletId>/...`).
// ---------------------------------------------------------------------

const FACILITY_ICONS = [
  "sparkles", "droplet", "wifi", "car", "coffee", "utensils", "wind", "waves",
  "flower", "sun", "shield", "door-open", "users", "gem", "crown", "camera",
  "life-buoy", "cctv", "home", "timer", "heart-handshake", "award", "star", "map-pin",
] as const;

function Note({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="tiny" style={{ color: tone === "error" ? "var(--danger)" : "var(--success)", marginTop: 6 }}>
      <Icon name={tone === "error" ? "alert-triangle" : "check-circle"} size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {children}
    </div>
  );
}

/** Shared save-state for the small inline forms in this file. */
function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      onDone?.();
      router.refresh();
      // Pesan "Tersimpan." sengaja tidak dibuat hilang otomatis pakai
      // setTimeout — timer yang jalan setelah komponen di-unmount adalah
      // sumber warning React yang tidak perlu. Pesannya hilang sendiri
      // begitu ada perubahan berikutnya (setSaved(false) di atas).
    });
  }

  return { pending, error, saved, run, setError };
}

// =====================================================================
// Status publikasi
// =====================================================================

export function OutletPublishSwitch({ outletId, published }: { outletId: string; published: boolean }) {
  const { pending, error, run } = useSaver();
  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <Switch
        on={published}
        pending={pending}
        label="Publikasi halaman profil outlet"
        onChange={(next) => run(() => setOutletPublished(outletId, next))}
      />
      <Note tone="error">{error}</Note>
    </div>
  );
}

// =====================================================================
// Cover
// =====================================================================

export function OutletCoverUploader({ outletId, hasCover }: { outletId: string; hasCover: boolean }) {
  const { pending, error, run, setError } = useSaver();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const spec = MEDIA_SPECS.cover;

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar (JPG/WebP/PNG)."); return; }
    if (file.size > spec.maxKb * 1024) { setError(`Ukuran file maksimal ${spec.maxKb} KB.`); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${outletId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("outlet-photos").upload(path, file);
      if (upErr) {
        setUploading(false);
        setError(`Gagal mengunggah — ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("outlet-photos").getPublicUrl(path);
      setUploading(false);
      run(() => setOutletCoverUrl(outletId, pub.publicUrl));
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  const busy = uploading || pending;

  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <div className="row g2">
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={13} /> {busy ? "Mengunggah…" : hasCover ? "Ganti Foto" : "Unggah Foto"}
        </button>
        {hasCover && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={() => run(() => setOutletCoverUrl(outletId, ""))}
          >
            <Icon name="trash" size={13} /> Hapus
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" style={{ display: "none" }} onChange={onChoose} />
      <Note tone="error">{error}</Note>
    </div>
  );
}

/** Kotak unggah besar yang tampil saat outlet belum punya cover sama sekali. */
export function OutletCoverDropzone({ outletId }: { outletId: string }) {
  const { pending, error, run, setError } = useSaver();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const spec = MEDIA_SPECS.cover;

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar (JPG/WebP/PNG)."); return; }
    if (file.size > spec.maxKb * 1024) { setError(`Ukuran file maksimal ${spec.maxKb} KB.`); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${outletId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("outlet-photos").upload(path, file);
      if (upErr) {
        setUploading(false);
        setError(`Gagal mengunggah — ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("outlet-photos").getPublicUrl(path);
      setUploading(false);
      run(() => setOutletCoverUrl(outletId, pub.publicUrl));
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  const busy = uploading || pending;

  return (
    <>
      <button
        className="stack g2"
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        style={{
          width: "100%", aspectRatio: `${spec.width} / ${spec.height}`, maxHeight: 220,
          alignItems: "center", justifyContent: "center", borderRadius: "var(--r-md)",
          border: "1.5px dashed var(--border-3)", background: "transparent",
          color: "var(--text-3)", cursor: busy ? "default" : "pointer",
        }}
      >
        <span className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
          <Icon name="camera" size={19} />
        </span>
        <span className="small bold" style={{ color: "var(--text-2)" }}>
          {busy ? "Mengunggah…" : "Unggah foto cover"}
        </span>
        <span className="tiny dim">{specLine("cover")}</span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" style={{ display: "none" }} onChange={onChoose} />
      <Note tone="error">{error}</Note>
    </>
  );
}

// =====================================================================
// Tagline & deskripsi
// =====================================================================

export function OutletTextForm({
  outletId,
  tagline: initialTagline,
  description: initialDescription,
}: {
  outletId: string;
  tagline: string;
  description: string;
}) {
  const { pending, error, saved, run } = useSaver();
  const [tagline, setTagline] = useState(initialTagline);
  const [description, setDescription] = useState(initialDescription);
  const dirty = tagline !== initialTagline || description !== initialDescription;

  return (
    <div className="stack g4">
      <Field label="Tagline" hint="Satu kalimat singkat, tampil besar di bagian atas halaman">
        <input className="input" value={tagline} maxLength={120} onChange={(e) => setTagline(e.target.value)} />
      </Field>
      <Field label="Deskripsi" hint="Jelaskan suasana, keunggulan, dan lokasi outlet">
        <textarea
          className="textarea"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          style={{ minHeight: 96 }}
        />
      </Field>
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => setOutletProfileText(outletId, { tagline, description }))}
        >
          <Icon name="save" size={13} /> {pending ? "Menyimpan…" : "Simpan Tagline & Deskripsi"}
        </button>
        {saved && !dirty && <span className="tiny" style={{ color: "var(--success)" }}>Tersimpan.</span>}
      </div>
      <Note tone="error">{error}</Note>
    </div>
  );
}

// =====================================================================
// Poin unggulan
// =====================================================================

export function OutletHighlightsEditor({ outletId, highlights }: { outletId: string; highlights: string[] }) {
  const { pending, error, run } = useSaver();
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    run(() => setOutletHighlights(outletId, [...highlights, v]), () => setDraft(""));
  }

  return (
    <>
      <div className="row g2 wrap" style={{ marginBottom: 12 }}>
        {highlights.length === 0 && <span className="tiny dim">Belum ada poin unggulan.</span>}
        {highlights.map((h, i) => (
          <span key={`${h}-${i}`} className="chip on">
            <Icon name="check" size={12} /> {h}
            <button
              type="button"
              aria-label={`Hapus poin ${h}`}
              disabled={pending}
              onClick={() => run(() => setOutletHighlights(outletId, highlights.filter((_, j) => j !== i)))}
              style={{ background: "none", border: "none", padding: 0, marginLeft: 4, cursor: "pointer", color: "inherit", opacity: 0.6 }}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="row g2">
        <input
          className="input"
          placeholder="Tambah poin unggulan baru…"
          style={{ maxWidth: 340 }}
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending || !draft.trim() || highlights.length >= 8} onClick={add}>
          <Icon name="plus" size={13} /> Tambah
        </button>
      </div>
      {highlights.length >= 8 && <div className="tiny dim" style={{ marginTop: 6 }}>Maksimal 8 poin unggulan.</div>}
      <Note tone="error">{error}</Note>
    </>
  );
}

// =====================================================================
// Fasilitas
// =====================================================================

function IconSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="row g2">
      <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}>
        <Icon name={value} size={15} />
      </span>
      <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ height: 30, fontSize: 12 }}>
        {FACILITY_ICONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}

type Facility = { id: string; name: string; icon: string; desc: string };

function FacilityCard({ facility }: { facility: Facility }) {
  const { pending, error, run } = useSaver();
  const [name, setName] = useState(facility.name);
  const [icon, setIcon] = useState(facility.icon);
  const [desc, setDesc] = useState(facility.desc);
  const dirty = name !== facility.name || icon !== facility.icon || desc !== facility.desc;

  return (
    <div className="stack g2" style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
      <div className="between">
        <IconSelect value={icon} onChange={setIcon} disabled={pending} />
        <button
          className="btn btn-quiet btn-icon btn-sm"
          type="button"
          disabled={pending}
          title="Hapus fasilitas"
          onClick={() => run(() => deleteOutletFacility(facility.id))}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
      <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ height: 32, fontSize: 12.5, fontWeight: 600 }} />
      <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 56, fontSize: 12 }} />
      {dirty && (
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={pending}
          onClick={() => run(() => updateOutletFacility(facility.id, { name, icon, description: desc }))}
        >
          <Icon name="save" size={12} /> {pending ? "Menyimpan…" : "Simpan"}
        </button>
      )}
      <Note tone="error">{error}</Note>
    </div>
  );
}

export function OutletFacilitiesEditor({ facilities }: { facilities: Facility[] }) {
  return (
    <div className="grid grid-3">
      {facilities.map((f) => (
        <FacilityCard key={f.id} facility={f} />
      ))}
      {facilities.length === 0 && <span className="tiny dim">Belum ada fasilitas — tambahkan lewat tombol di atas.</span>}
    </div>
  );
}

export function AddFacilityButton({ outletId }: { outletId: string }) {
  const { pending, error, run } = useSaver();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("sparkles");
  const [desc, setDesc] = useState("");

  function submit() {
    if (!name.trim()) return;
    run(
      () => createOutletFacility(outletId, { name, icon, description: desc }),
      () => { setName(""); setDesc(""); setIcon("sparkles"); setOpen(false); }
    );
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} /> Tambah Fasilitas
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ minWidth: 260 }}>
      <input className="input" placeholder="Nama fasilitas" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ height: 32, fontSize: 12.5 }} />
      <IconSelect value={icon} onChange={setIcon} disabled={pending} />
      <textarea className="textarea" placeholder="Deskripsi singkat" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 48, fontSize: 12 }} />
      <div className="row g2">
        <button className="btn btn-primary btn-sm" type="button" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-quiet btn-sm" type="button" disabled={pending} onClick={() => setOpen(false)}>Batal</button>
      </div>
      <Note tone="error">{error}</Note>
    </div>
  );
}

// =====================================================================
// Galeri foto
// =====================================================================

type GalleryPhoto = { id: string; label: string; src: string };

function GalleryCard({ photo }: { photo: GalleryPhoto }) {
  const { pending, error, run } = useSaver();
  const [label, setLabel] = useState(photo.label);
  const shot = MEDIA_SPECS.gallery;
  const dirty = label !== photo.label;

  return (
    <div className="stack g2">
      <div
        style={{
          position: "relative", aspectRatio: `${shot.width} / ${shot.height}`,
          borderRadius: "var(--r-md)", overflow: "hidden",
          border: "1px solid var(--border)", background: "var(--bg-surface-2)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={photo.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <button
          className="btn btn-quiet btn-icon btn-sm"
          type="button"
          disabled={pending}
          title="Hapus foto"
          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.42)", color: "#fff" }}
          onClick={() => run(() => deleteOutletGalleryPhoto(photo.id))}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} style={{ height: 30, fontSize: 12 }} />
      {dirty && (
        <button className="btn btn-primary btn-sm" type="button" disabled={pending} onClick={() => run(() => setOutletGalleryLabel(photo.id, label))}>
          {pending ? "Menyimpan…" : "Simpan judul"}
        </button>
      )}
      <Note tone="error">{error}</Note>
    </div>
  );
}

export function OutletGalleryEditor({ outletId, photos }: { outletId: string; photos: GalleryPhoto[] }) {
  const { pending, error, run, setError } = useSaver();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shot = MEDIA_SPECS.gallery;

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar (JPG/WebP/PNG)."); return; }
    if (file.size > shot.maxKb * 1024) { setError(`Ukuran file maksimal ${shot.maxKb} KB.`); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${outletId}/gallery-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("outlet-photos").upload(path, file);
      if (upErr) {
        setUploading(false);
        setError(`Gagal mengunggah — ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("outlet-photos").getPublicUrl(path);
      setUploading(false);
      run(() => addOutletGalleryPhoto(outletId, { label: file.name.replace(/\.[^.]+$/, ""), url: pub.publicUrl }));
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  const busy = uploading || pending;

  return (
    <>
      <div className="grid grid-3">
        {photos.map((g) => (
          <GalleryCard key={g.id} photo={g} />
        ))}
        <button
          className="stack g2"
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          style={{
            aspectRatio: `${shot.width} / ${shot.height}`, alignItems: "center", justifyContent: "center",
            borderRadius: "var(--r-md)", border: "1.5px dashed var(--border-3)",
            background: "transparent", color: "var(--text-3)", cursor: busy ? "default" : "pointer",
          }}
        >
          <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Icon name="camera" size={16} />
          </span>
          <span className="tiny bold" style={{ color: "var(--text-2)" }}>{busy ? "Mengunggah…" : "Tambah foto"}</span>
          <span className="tiny dim">{shot.width}×{shot.height}</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" style={{ display: "none" }} onChange={onChoose} />
      <Note tone="error">{error}</Note>
    </>
  );
}

// =====================================================================
// Ringkasan spesifikasi cover (dipakai halaman, dipisah biar rapi)
// =====================================================================

export function CoverSpecBadges() {
  const cover = MEDIA_SPECS.cover;
  return (
    <div className="row g3 wrap" style={{ marginTop: 12 }}>
      <Badge tone="neutral" icon="images">{cover.width}×{cover.height} px</Badge>
      <Badge tone="neutral">Rasio {cover.ratio}</Badge>
      <Badge tone="neutral">Maks {cover.maxKb} KB</Badge>
      <span className="tiny dim">{cover.note}</span>
    </div>
  );
}

export function UnpublishedNote() {
  return (
    <div className="card-body" style={{ paddingTop: 0 }}>
      <InfoNote tone="warning" icon="alert-triangle">
        Outlet ini belum publikasikan halaman profilnya — biasanya karena masih dalam proses setup.
        Aktifkan switch di atas begitu foto dan fasilitas sudah siap ditampilkan.
      </InfoNote>
    </div>
  );
}

