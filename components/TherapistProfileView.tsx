"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Card, CardHead } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  setTherapistPersonalData,
  setTherapistProfilePhotoUrl,
  type TherapistPersonalDataInput,
} from "@/lib/actions/therapistProfile";
import type { TherapistPersonalData } from "@/lib/data/therapistProfile";
import { BANKS, BANK_OTHER } from "@/lib/constants/banks";

// ---------------------------------------------------------------------
// Shared UI for "Profil Terapis" — one component, three entry points
// with different edit rights:
//   - app/manager/therapists/[id]/profile/page.tsx  (canEdit: Manager)
//   - app/admin/users/[id]/profile/page.tsx          (canEdit: false, Admin/Owner)
//   - app/therapist/profile/page.tsx                 (canEdit: self)
//
// canEdit is resolved server-side (canEditTherapistProfile(), see
// lib/actions/therapistProfile.ts) and passed in as a prop — this
// component just renders inputs vs. plain text based on it. The real
// enforcement is RLS + the self-update trigger (migration 0026); this
// prop only controls what the UI *offers*, matching the pattern already
// used for BusinessProfileForm/StaffEditor in this codebase.
// ---------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  canEdit,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="stack g1">
      <span className="tiny uppercase dim">{label}</span>
      {canEdit ? (
        <input
          className="input"
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span className="small" style={{ color: "var(--text-1)", minHeight: 20 }}>
          {value || <span className="dim">— belum diisi —</span>}
        </span>
      )}
    </label>
  );
}

// Nama Bank dipilih dari daftar tertutup (lib/constants/banks.ts) supaya
// ejaannya seragam untuk daftar transfer payroll. Dua hal yang ditangani
// di sini supaya tidak ada data yang hilang:
//
//  1. Data LAMA yang terlanjur diketik bebas (mis. "bca" huruf kecil)
//     tidak cocok dengan opsi mana pun. Nilai itu tetap ditampilkan
//     sebagai opsi sendiri bertanda "data lama" — kalau tidak, membuka
//     form lalu menyimpan akan diam-diam mengosongkan bank terapis.
//  2. Bank yang tidak ada di daftar (BPR, bank daerah lain) tetap bisa
//     lewat opsi "Lainnya", yang memunculkan kolom ketik.
function BankField({
  value, onChange, canEdit,
}: { value: string; onChange: (v: string) => void; canEdit: boolean }) {
  const known = BANKS.includes(value);
  const isLegacy = value !== "" && !known;
  // "Lainnya" aktif kalau user memilihnya sendiri, atau kalau nilai
  // tersimpan memang di luar daftar.
  const [other, setOther] = useState(isLegacy);

  if (!canEdit) {
    return (
      <label className="stack g1">
        <span className="tiny uppercase dim">Nama Bank</span>
        <span className="small" style={{ color: "var(--text-1)", minHeight: 20 }}>
          {value || <span className="dim">— belum diisi —</span>}
        </span>
      </label>
    );
  }

  return (
    <label className="stack g1">
      <span className="tiny uppercase dim">Nama Bank</span>
      <select
        className="input"
        value={other ? BANK_OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === BANK_OTHER) {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(v);
          }
        }}
      >
        <option value="">— pilih bank —</option>
        {BANKS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        {isLegacy && !other && <option value={value}>{value} (data lama)</option>}
        <option value={BANK_OTHER}>Lainnya…</option>
      </select>
      {other && (
        <input
          className="input"
          value={value}
          placeholder="Tulis nama bank"
          style={{ marginTop: 6 }}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function PhotoUploader({ employeeId, currentUrl, canEdit }: { employeeId: string; currentUrl?: string; canEdit: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar."); return; }
    if (file.size > 3 * 1024 * 1024) { setError("Ukuran file maksimal 3MB."); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${employeeId}/profile-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("therapist-photos").upload(path, file, { upsert: true });
      if (uploadErr) { setError("Gagal mengunggah — coba lagi."); setUploading(false); return; }
      const { data: pub } = supabase.storage.from("therapist-photos").getPublicUrl(path);
      const r = await setTherapistProfilePhotoUrl(employeeId, pub.publicUrl);
      setUploading(false);
      if (!r.ok) setError(r.error);
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  return (
    <div className="row g3" style={{ alignItems: "center" }}>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--bg-deep)", border: "1px solid var(--border)" }} />
      )}
      {canEdit && (
        <div className="stack g1">
          <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Icon name="camera" size={12} /> {uploading ? "Mengunggah…" : "Ganti Foto"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onChoose} />
          {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export default function TherapistProfileView({
  employeeId,
  name,
  code,
  phone,
  photoUrl,
  initial,
  canEdit,
  editNote,
}: {
  employeeId: string;
  name: string;
  code: string;
  phone: string;
  photoUrl?: string;
  initial: TherapistPersonalData;
  canEdit: boolean;
  /** Shown when canEdit is false — e.g. "Admin/Owner hanya bisa melihat...". */
  editNote?: string;
}) {
  const [values, setValues] = useState<TherapistPersonalDataInput>({
    address: initial.address,
    nik: initial.nik,
    birthPlace: initial.birthPlace,
    birthDate: initial.birthDate,
    bankName: initial.bankName,
    bankAccountNumber: initial.bankAccountNumber,
    bankAccountHolder: initial.bankAccountHolder,
    emergencyContactName: initial.emergencyContactName,
    emergencyContactPhone: initial.emergencyContactPhone,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(p: Partial<TherapistPersonalDataInput>) {
    setValues((v) => ({ ...v, ...p }));
    setSaved(false);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setTherapistPersonalData(employeeId, values);
      if (!r.ok) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div className="stack g4">
      <Card>
        <CardHead title={name} sub={`${code}${phone ? " · " + phone : ""}`} />
        <PhotoUploader employeeId={employeeId} currentUrl={photoUrl} canEdit={canEdit} />
        {!canEdit && editNote && (
          <div className="tiny dim" style={{ marginTop: 10 }}>
            <Icon name="lock" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            {editNote}
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Data Pribadi" sub="Alamat, KTP, dan tempat & tanggal lahir." />
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Alamat" value={values.address} onChange={(v) => patch({ address: v })} canEdit={canEdit} placeholder="Alamat lengkap" />
          <Field label="NIK / KTP" value={values.nik} onChange={(v) => patch({ nik: v })} canEdit={canEdit} placeholder="16 digit" />
          <Field label="Tempat Lahir" value={values.birthPlace} onChange={(v) => patch({ birthPlace: v })} canEdit={canEdit} placeholder="Kota kelahiran" />
          <Field label="Tanggal Lahir" value={values.birthDate} onChange={(v) => patch({ birthDate: v })} canEdit={canEdit} type="date" />
        </div>
      </Card>

      <Card>
        <CardHead title="Rekening Bank" sub="Untuk keperluan payroll & reimbursement." />
        <div className="grid grid-2" style={{ gap: 12 }}>
          <BankField value={values.bankName} onChange={(v) => patch({ bankName: v })} canEdit={canEdit} />
          <Field label="Nomor Rekening" value={values.bankAccountNumber} onChange={(v) => patch({ bankAccountNumber: v })} canEdit={canEdit} />
          <Field label="Atas Nama" value={values.bankAccountHolder} onChange={(v) => patch({ bankAccountHolder: v })} canEdit={canEdit} placeholder="Nama pemilik rekening" />
        </div>
      </Card>

      <Card>
        <CardHead title="Kontak Darurat" />
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Nama Kontak Darurat" value={values.emergencyContactName} onChange={(v) => patch({ emergencyContactName: v })} canEdit={canEdit} />
          <Field label="No. HP Kontak Darurat" value={values.emergencyContactPhone} onChange={(v) => patch({ emergencyContactPhone: v })} canEdit={canEdit} />
        </div>
      </Card>

      {canEdit && (
        <div className="row g2" style={{ alignItems: "center" }}>
          <button className="btn btn-primary btn-sm" disabled={isPending} onClick={onSave}>
            {isPending ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
          {saved && <span className="tiny" style={{ color: "var(--success)" }}><Icon name="check" size={12} /> Tersimpan.</span>}
          {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
