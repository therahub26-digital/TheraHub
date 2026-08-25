"use client";

import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { createUserWithLogin, type AccessRole } from "@/lib/actions/employees";
import { FloatingPanel as Panel } from "@/components/FloatingPanel";
import type { JobRole } from "@/lib/types";

// ---------------------------------------------------------------------
// "+ Tambah User" on /admin/users. Adjie (2026-08-25): "tombol tambah
// user ... belum berfungsi", then clarified the button must create
// "Karyawan + akun login sekaligus". Mirrors components/StaffEditor.tsx's
// NewStaffForm (same FloatingPanel pattern, same field set for the
// employee half) but adds outlet choice (admin covers the whole tenant,
// not one outlet like a manager) and the login-account half: an
// optional "Peran akses" — leaving it "Tidak ada" creates the employee
// only, same as Manager's "Tambah Staff".
//
// On success with a login created, the temporary password is shown
// once in the panel itself (never emailed — no outgoing-email infra
// exists in this project yet) with an explicit "catat sekarang, tidak
// akan ditampilkan lagi" warning, since createUserWithLogin() never
// returns it again after this call.
// ---------------------------------------------------------------------

const JOB_ROLES: JobRole[] = ["Terapis", "Kasir", "Manager", "Office Boy", "Admin Umum", "Supervisor"];
const THERAPIST_GRADES = ["Junior", "Senior", "Master"] as const;
const CONTRACT_TYPES = ["Tetap", "Kontrak", "Harian"] as const;
const ACCESS_ROLES: AccessRole[] = ["", "admin", "owner", "manager", "kasir", "therapist"];

// Duplikat kecil dari lib/actions/employees.ts's ACCESS_ROLE_LABELS (TIDAK
// diimpor dari sana) — file "use server" cuma boleh meng-export async
// function; mengekspor const object dari file itu dulu pernah bikin
// Vercel/Turbopack build gagal ("A \"use server\" file can only export
// async functions, found object"), persis pelajaran backlog 7.11.
const ACCESS_ROLE_LABELS: Record<Exclude<AccessRole, "">, string> = {
  admin: "Admin", owner: "Owner", manager: "Manager", kasir: "Kasir", therapist: "Terapis",
};

/** Job role -> the access role an admin most likely means, left editable. "" = no natural match, admin picks (or leaves "Tidak ada"). */
function defaultAccessRoleFor(jobRole: JobRole): AccessRole {
  if (jobRole === "Manager") return "manager";
  if (jobRole === "Kasir") return "kasir";
  if (jobRole === "Terapis") return "therapist";
  return "";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

type FormValues = {
  name: string;
  jobRole: JobRole;
  outletId: string;
  therapistGrade: (typeof THERAPIST_GRADES)[number];
  phone: string;
  email: string;
  joinDate: string;
  contractType: (typeof CONTRACT_TYPES)[number];
  accessRole: AccessRole;
};

export function NewUserForm({
  outlets,
  tenantId,
}: {
  outlets: { id: string; name: string }[];
  tenantId: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const empty: FormValues = {
    name: "",
    jobRole: "Terapis",
    outletId: outlets[0]?.id ?? "",
    therapistGrade: "Junior",
    phone: "",
    email: "",
    joinDate: todayIso(),
    contractType: "Tetap",
    accessRole: "therapist",
  };
  const [values, setValues] = useState<FormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<FormValues>) {
    setValues((v) => {
      const next = { ...v, ...p };
      // Job role changed and the access role was still whatever the OLD
      // job role's default was -> slide the default along with it, but
      // never clobber a choice the admin already made deliberately.
      if (p.jobRole && v.accessRole === defaultAccessRoleFor(v.jobRole)) {
        next.accessRole = defaultAccessRoleFor(p.jobRole);
      }
      return next;
    });
  }

  const isTherapist = values.jobRole === "Terapis";

  function close() {
    setOpen(false);
    setResult(null);
  }

  return (
    <>
      <button
        ref={anchorRef}
        className="btn btn-primary btn-sm"
        onClick={() => { setValues(empty); setError(null); setResult(null); setOpen(true); }}
      >
        <Icon name="plus" size={14} /> Tambah User
      </button>
      {open && (
        <Panel anchorRef={anchorRef} onClose={close}>
          {result ? (
            <>
              <div className="small strong" style={{ color: "var(--text-1)" }}>User dibuat — catat sandi ini sekarang</div>
              <div className="tiny dim" style={{ marginTop: 4 }}>
                Sandi sementara ini tidak akan ditampilkan lagi. Sampaikan ke {values.name.trim() || "user"} lalu minta ganti sandi setelah login pertama.
              </div>
              <div className="stack g1" style={{ marginTop: 10 }}>
                <div className="tiny dim">Email</div>
                <div className="input" style={{ userSelect: "all" }}>{result.email}</div>
                <div className="tiny dim" style={{ marginTop: 6 }}>Sandi sementara</div>
                <div className="input" style={{ userSelect: "all", fontFamily: "monospace" }}>{result.tempPassword}</div>
              </div>
              <div className="row g2" style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={close}>Selesai</button>
              </div>
            </>
          ) : (
            <>
              <div className="small strong" style={{ color: "var(--text-1)" }}>User baru</div>

              <label className="stack g1">
                <span className="tiny dim">Nama lengkap</span>
                <input className="input" value={values.name} disabled={isPending} onChange={(e) => patch({ name: e.target.value })} />
              </label>

              <div className="row g2">
                <label className="stack g1" style={{ flex: 1 }}>
                  <span className="tiny dim">Peran / jabatan</span>
                  <select className="select" value={values.jobRole} disabled={isPending} onChange={(e) => patch({ jobRole: e.target.value as JobRole })}>
                    {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="stack g1" style={{ flex: 1 }}>
                  <span className="tiny dim">Outlet</span>
                  <select className="select" value={values.outletId} disabled={isPending} onChange={(e) => patch({ outletId: e.target.value })}>
                    {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              </div>

              {isTherapist && (
                <label className="stack g1">
                  <span className="tiny dim">Grade terapis</span>
                  <select className="select" value={values.therapistGrade} disabled={isPending} onChange={(e) => patch({ therapistGrade: e.target.value as FormValues["therapistGrade"] })}>
                    {THERAPIST_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
              )}

              <div className="row g2">
                <label className="stack g1" style={{ flex: 1 }}>
                  <span className="tiny dim">No. HP</span>
                  <input className="input" value={values.phone} disabled={isPending} placeholder="08xx..." onChange={(e) => patch({ phone: e.target.value })} />
                </label>
                <label className="stack g1" style={{ flex: 1 }}>
                  <span className="tiny dim">Tanggal join</span>
                  <input className="input" type="date" value={values.joinDate} disabled={isPending} onChange={(e) => patch({ joinDate: e.target.value })} />
                </label>
              </div>

              <label className="stack g1">
                <span className="tiny dim">Status kontrak</span>
                <select className="select" value={values.contractType} disabled={isPending} onChange={(e) => patch({ contractType: e.target.value as FormValues["contractType"] })}>
                  {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <div style={{ borderTop: "1px solid var(--border)", margin: "10px 0" }} />

              <label className="stack g1">
                <span className="tiny dim">Peran akses (akun login)</span>
                <select className="select" value={values.accessRole} disabled={isPending} onChange={(e) => patch({ accessRole: e.target.value as AccessRole })}>
                  {ACCESS_ROLES.map((r) => <option key={r} value={r}>{r === "" ? "Tidak ada — karyawan saja" : ACCESS_ROLE_LABELS[r]}</option>)}
                </select>
              </label>

              {values.accessRole && (
                <label className="stack g1">
                  <span className="tiny dim">Email (dipakai untuk login)</span>
                  <input className="input" type="email" value={values.email} disabled={isPending} onChange={(e) => patch({ email: e.target.value })} />
                </label>
              )}

              <ErrorNote error={error} />
              <div className="row g2">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await createUserWithLogin({
                        outletId: values.outletId,
                        tenantId,
                        name: values.name,
                        jobRole: values.jobRole,
                        therapistGrade: isTherapist ? values.therapistGrade : null,
                        phone: values.phone,
                        email: values.email,
                        joinDate: values.joinDate,
                        contractType: values.contractType,
                        accessRole: values.accessRole,
                      });
                      if (!r.ok) { setError(r.error); return; }
                      if (r.loginCreated) setResult({ email: r.email, tempPassword: r.tempPassword });
                      else close();
                    });
                  }}
                >
                  <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
                </button>
                <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={close}>Batal</button>
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}
