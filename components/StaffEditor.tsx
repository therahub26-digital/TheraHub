"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import {
  createEmployee,
  updateEmployeeProfile,
  setEmployeePhotoUrl,
  type ActionResult,
} from "@/lib/actions/employees";
import { FloatingPanel as Panel } from "@/components/FloatingPanel";
import { todayIsoDate } from "@/lib/wallclock";
import type { JobRole } from "@/lib/types";

// ---------------------------------------------------------------------
// "Tambah Staff" + per-row "Edit" — added 2026-08-23, user feedback:
// "tambah staf/therapis belum berfungsi dan edit profil nya tidak ada:
// foto profil, data pribadi, tanggal join". Two exported pieces:
//   - NewStaffForm: the create flow, opened from the /manager/therapists
//     page header (was previously a dead button with no onClick).
//   - EditStaffButton: opened per row in either table (Daftar Terapis /
//     Staff Pendukung) on that same page.
// Both share one inline form. jobRole drives isTherapist automatically
// ("Terapis" = therapist, everything else = staff) rather than a
// separate checkbox — the two were never meant to disagree.
//
// KTP upload is deliberately NOT here — see lib/actions/employees.ts's
// header on createEmployee/updateEmployeeProfile for why that needs its
// own migration (new column + non-public Storage bucket), which is
// drafted separately for the user to approve, not silently added here.
//
// Panel uses components/FloatingPanel.tsx — added 2026-08-24 after the
// user reported "tombol edit tidak fungsi" on room/outlet cards, which
// turned out to be every `.card` clipping a plain `position: absolute`
// panel to invisibility (app/ui.css: .card { overflow: hidden }). This
// file had the identical `position: absolute` pattern (both rows sit
// inside a `.card`-wrapped table on /manager/therapists), so it gets the
// same portal-based fix rather than waiting for its own bug report.
// ---------------------------------------------------------------------

const JOB_ROLES: JobRole[] = ["Terapis", "Kasir", "Manager", "Office Boy", "Admin Umum", "Supervisor"];
const THERAPIST_GRADES = ["Junior", "Senior", "Master"] as const;
const CONTRACT_TYPES = ["Tetap", "Kontrak", "Harian"] as const;

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

// "" = Belum diatur — dikirim sebagai null ke server, dan landing publik
// tidak menampilkan badge apa pun ("belum diatur ≠ nol").
const MASSAGE_INTENSITIES = [
  { value: "", label: "Belum diatur" },
  { value: "STRONG", label: "Strong" },
  { value: "MEDIUM", label: "Medium" },
  { value: "MEDIUM_STRONG", label: "Medium Strong" },
] as const;
type MassageIntensityValue = (typeof MASSAGE_INTENSITIES)[number]["value"];

type FormValues = {
  name: string;
  jobRole: JobRole;
  grade: string;
  therapistGrade: (typeof THERAPIST_GRADES)[number];
  massageIntensity: MassageIntensityValue;
  phone: string;
  email: string;
  joinDate: string;
  contractType: (typeof CONTRACT_TYPES)[number];
};

function todayIso(): string {
  return todayIsoDate();
}

function FormFields({
  values,
  disabled,
  onChange,
}: {
  values: FormValues;
  disabled: boolean;
  onChange: (patch: Partial<FormValues>) => void;
}) {
  const isTherapist = values.jobRole === "Terapis";
  return (
    <>
      <label className="stack g1">
        <span className="tiny dim">Nama lengkap</span>
        <input className="input" value={values.name} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Peran / jabatan</span>
          <select className="select" value={values.jobRole} disabled={disabled} onChange={(e) => onChange({ jobRole: e.target.value as JobRole })}>
            {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Tanggal join</span>
          <input className="input" type="date" value={values.joinDate} disabled={disabled} onChange={(e) => onChange({ joinDate: e.target.value })} />
        </label>
      </div>

      {isTherapist && (
        <div className="row g2">
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Grade terapis</span>
            <select className="select" value={values.therapistGrade} disabled={disabled} onChange={(e) => onChange({ therapistGrade: e.target.value as FormValues["therapistGrade"] })}>
              {THERAPIST_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="stack g1" style={{ flex: 1 }}>
            <span className="tiny dim">Tingkat pijatan (landing publik)</span>
            <select className="select" value={values.massageIntensity} disabled={disabled} onChange={(e) => onChange({ massageIntensity: e.target.value as MassageIntensityValue })}>
              {MASSAGE_INTENSITIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">No. HP</span>
          <input className="input" value={values.phone} disabled={disabled} placeholder="08xx..." onChange={(e) => onChange({ phone: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Email</span>
          <input className="input" type="email" value={values.email} disabled={disabled} onChange={(e) => onChange({ email: e.target.value })} />
        </label>
      </div>

      <label className="stack g1">
        <span className="tiny dim">Status kontrak</span>
        <select className="select" value={values.contractType} disabled={disabled} onChange={(e) => onChange({ contractType: e.target.value as FormValues["contractType"] })}>
          {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </>
  );
}

/** "Tambah Staff" — opens from the page header, covers both therapist and non-therapist roles. */
export function NewStaffForm({ outletId, tenantId }: { outletId: string; tenantId: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const empty: FormValues = {
    name: "", jobRole: "Terapis", grade: "", therapistGrade: "Junior", massageIntensity: "",
    phone: "", email: "", joinDate: todayIso(), contractType: "Tetap",
  };
  const [values, setValues] = useState<FormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  return (
    <>
      <button
        ref={anchorRef}
        className="btn btn-primary btn-sm"
        onClick={() => { setValues(empty); setError(null); setOpen(true); }}
      >
        <Icon name="plus" size={14} /> Tambah Staff
      </button>
      {open && (
        <Panel anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Staff / Terapis baru</div>
          <FormFields values={values} disabled={isPending} onChange={patch} />
          <ErrorNote error={error} />
          <div className="row g2">
            <button
              className="btn btn-primary btn-sm"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await createEmployee({
                    outletId, tenantId,
                    name: values.name,
                    jobRole: values.jobRole,
                    isTherapist: values.jobRole === "Terapis",
                    therapistGrade: values.jobRole === "Terapis" ? values.therapistGrade : null,
                    phone: values.phone,
                    email: values.email,
                    joinDate: values.joinDate,
                    contractType: values.contractType,
                  });
                  if (r.ok) { setValues(empty); setOpen(false); }
                  else setError(r.error);
                });
              }}
            >
              <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
          </div>
        </Panel>
      )}
    </>
  );
}

/** Inline profile-photo uploader — single photo (employees.photo_url), not the up-to-3 gallery album. */
function ProfilePhotoUploader({ employeeId, currentUrl }: { employeeId: string; currentUrl?: string }) {
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
      const r = await setEmployeePhotoUrl(employeeId, pub.publicUrl);
      setUploading(false);
      if (!r.ok) setError(r.error);
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  return (
    <div className="row g2" style={{ alignItems: "center" }}>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-deep)", border: "1px solid var(--border)" }} />
      )}
      <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
        <Icon name="camera" size={12} /> {uploading ? "Mengunggah…" : "Ganti Foto"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onChoose} />
      <ErrorNote error={error} />
    </div>
  );
}

/** Per-row "Edit" — profile photo + personal data + join date, for an existing therapist or staff row. */
export function EditStaffButton({
  employeeId,
  photoUrl,
  initial,
}: {
  employeeId: string;
  photoUrl?: string;
  initial: {
    name: string;
    jobRole: JobRole;
    therapistGrade?: "Junior" | "Senior" | "Master";
    massageIntensity?: "STRONG" | "MEDIUM" | "MEDIUM_STRONG";
    phone: string;
    email: string;
    joinDate: string;
    contractType: "Tetap" | "Kontrak" | "Harian";
  };
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const startValues: FormValues = {
    name: initial.name,
    jobRole: initial.jobRole,
    grade: "",
    therapistGrade: initial.therapistGrade ?? "Junior",
    massageIntensity: initial.massageIntensity ?? "",
    phone: initial.phone,
    email: initial.email,
    joinDate: initial.joinDate,
    contractType: initial.contractType,
  };
  const [values, setValues] = useState<FormValues>(startValues);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  return (
    <>
      <button
        ref={anchorRef}
        className="btn btn-ghost btn-sm"
        onClick={() => { setValues(startValues); setError(null); setOpen(true); }}
      >
        <Icon name="edit" size={12} /> Edit
      </button>
      {open && (
        <Panel anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Edit profil — {initial.name}</div>

          <ProfilePhotoUploader employeeId={employeeId} currentUrl={photoUrl} />

          <FormFields values={values} disabled={isPending} onChange={patch} />
          <ErrorNote error={error} />
          <div className="row g2">
            <button
              className="btn btn-primary btn-sm"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r: ActionResult = await updateEmployeeProfile({
                    employeeId,
                    name: values.name,
                    jobRole: values.jobRole,
                    therapistGrade: values.jobRole === "Terapis" ? values.therapistGrade : null,
                    massageIntensity: values.jobRole === "Terapis" ? (values.massageIntensity || null) : null,
                    phone: values.phone,
                    email: values.email,
                    joinDate: values.joinDate,
                    contractType: values.contractType,
                  });
                  if (r.ok) setOpen(false);
                  else setError(r.error);
                });
              }}
            >
              <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
          </div>
        </Panel>
      )}
    </>
  );
}
