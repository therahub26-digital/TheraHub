"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Write half of the therapist leave-request workflow. See
// supabase/migrations/0022_employee_leave_requests.sql for the schema/RLS
// rationale and lib/data/leaveRequests.ts for the read layer.
//
// 0022 was APPLIED to production 2026-08-23 (verified via to_regclass +
// pg_policies). The 42P01 handling below is now a leftover safety net,
// not an expected path — it stays because a fresh/branch database that
// has not run 0022 should still fail with a sentence that names the
// reason rather than a generic "gagal". If a user ever actually sees
// MISSING_TABLE_MSG on production, something regressed; treat it as a
// report, not as normal.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

const MISSING_TABLE_MSG =
  "Fitur ajukan cuti tidak bisa diakses — tabel employee_leave_requests tidak ditemukan di database ini (migrasi 0022). Seharusnya tidak terjadi di produksi; laporkan ke admin.";

async function resolveSignedInEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, employee: null, error: "Sesi tidak ditemukan — silakan login ulang." as const };

  const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("auth_user_id", user.id).maybeSingle();
  if (!appUser?.employee_id) return { supabase, employee: null, error: "Akun ini tidak terhubung ke data karyawan." as const };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, outlet_id")
    .eq("id", appUser.employee_id)
    .maybeSingle();
  if (!employee) return { supabase, employee: null, error: "Data karyawan tidak ditemukan." as const };

  return { supabase, employee, error: null };
}

function revalidateLeave() {
  revalidatePath("/therapist/attendance");
  revalidatePath("/manager/schedule-check");
  revalidatePath("/kasir/schedule-check");
}

/**
 * Therapist sends a leave/sick-day, plain day-off, OR late-arrival
 * ("Ijin Masuk Siang", type LATE — migrasi 0036) note for a future
 * (or today's) date. Today is deliberately allowed: the attendance
 * alert's "Kirim Keterangan" path is exactly a same-day submission
 * (sakit dadakan / keperluan mendadak / ijin masuk siang).
 *
 * SEJAK 0037 TIDAK ADA LAGI PERSETUJUAN (Adjie 2026-10-15: "tidak usah
 * minta ijin, hanya pemberitahuan dan tercatat saja, takutnya si
 * manager terlewatkan"). Baris tetap di-insert PENDING lewat RLS biasa
 * (policy insert terapis memang mewajibkan PENDING); trigger database
 * `leave_request_auto_record` (SECURITY DEFINER, migrasi 0037) yang
 * langsung menaikkannya jadi APPROVED "Tercatat otomatis" dan — untuk
 * Cuti/Sakit & Libur — menulis exception jadwal sehingga terapisnya
 * otomatis tidak bekerja hari itu. LATE tidak menulis exception.
 * Pada database yang belum menjalankan 0037, baris tinggal PENDING dan
 * alur ACC lama di bawah masih bekerja — aman dua arah.
 */
export async function requestLeave(date: string, type: "OFF" | "LEAVE" | "LATE", note?: string): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error || !employee) return { ok: false, error: error ?? "Data karyawan tidak ditemukan." };

  const today = todayIsoDate();
  if (date < today) return { ok: false, error: "Tidak bisa mengajukan cuti untuk tanggal yang sudah lewat." };

  // Satu keterangan hidup per tanggal per terapis. Dulu hanya PENDING
  // yang ditolak (duplikat menunggu ACC); sekarang keterangan langsung
  // tercatat, jadi APPROVED pada tanggal yang sama pun duplikat —
  // kiriman kedua akan menimpa catatan pertama lewat upsert trigger
  // tanpa ada yang menyadarinya. Hanya REJECTED (warisan alur lama)
  // yang boleh dikirim ulang.
  const { data: existing } = await supabase
    .from("employee_leave_requests")
    .select("id, status")
    .eq("employee_id", employee.id)
    .eq("date", date)
    .in("status", ["PENDING", "APPROVED"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "PENDING"
          ? "Sudah ada pengajuan yang menunggu keputusan untuk tanggal ini."
          : "Sudah ada keterangan tercatat untuk tanggal ini — hubungi manager bila perlu diubah.",
    };
  }

  const { error: insertErr } = await supabase.from("employee_leave_requests").insert({
    employee_id: employee.id,
    outlet_id: employee.outlet_id,
    date,
    type,
    note: note?.trim() || null,
    status: "PENDING",
    requested_at: nowIso(),
  });
  if (insertErr) {
    if (isMissingTable(insertErr)) return { ok: false, error: MISSING_TABLE_MSG };
    return { ok: false, error: "Gagal mengirim pengajuan cuti — coba lagi." };
  }

  revalidateLeave();
  return { ok: true };
}

/**
 * LEGACY sejak 0037 (keterangan tercatat otomatis lewat trigger —
 * lihat requestLeave di atas): dipertahankan hanya untuk baris PENDING
 * warisan sebelum migrasi itu, atau untuk database yang belum
 * menjalankannya. Manager/kasir approves a PENDING request: marks it
 * APPROVED, then writes the actual LEAVE exception to
 * employee_schedule_exceptions — the table every booking-conflict
 * check already reads from.
 */
export async function approveLeaveRequest(requestId: string, decisionNote?: string): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error || !employee) return { ok: false, error: error ?? "Data karyawan tidak ditemukan." };

  const { data: reqRow, error: readErr } = await supabase
    .from("employee_leave_requests")
    .select("id, employee_id, outlet_id, date, note, status, type")
    .eq("id", requestId)
    .maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) return { ok: false, error: MISSING_TABLE_MSG };
    return { ok: false, error: "Pengajuan tidak ditemukan." };
  }
  if (!reqRow) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (reqRow.status !== "PENDING") return { ok: false, error: "Pengajuan ini sudah diputuskan sebelumnya." };

  const { error: updateErr } = await supabase
    .from("employee_leave_requests")
    .update({
      status: "APPROVED",
      decided_by: employee.id,
      decided_at: nowIso(),
      decision_note: decisionNote?.trim() || null,
    })
    .eq("id", requestId)
    .eq("status", "PENDING");
  if (updateErr) return { ok: false, error: "Gagal menyetujui — coba lagi." };

  // LATE ("Ijin Masuk Siang") BERHENTI di sini dengan sengaja: terapisnya
  // tetap bekerja hari itu dan tetap harus bisa dipilih saat booking,
  // jadi tidak ada baris employee_schedule_exceptions yang ditulis
  // (tabel itu pula ber-CHECK OFF/LEAVE saja). Approval-nya sendiri sudah
  // tercatat di employee_leave_requests dan itulah yang menekan alert
  // absensi + jadi catatan resmi manager.
  if ((reqRow as { type?: "OFF" | "LEAVE" | "LATE" }).type === "LATE") {
    revalidateLeave();
    return { ok: true };
  }

  const { error: excErr } = await supabase.from("employee_schedule_exceptions").upsert(
    {
      employee_id: reqRow.employee_id,
      outlet_id: reqRow.outlet_id,
      date: reqRow.date,
      // Was hardcoded to "LEAVE" until 2026-08-25 — a therapist who actually
      // asked for "Libur" (plain day off, not cuti/sakit) would still land
      // as LEAVE once approved. Now trusts the type the therapist picked
      // when submitting (see migration 0024 + TherapistLeaveRequestForm.tsx).
      type: (reqRow as { type?: "OFF" | "LEAVE" }).type ?? "LEAVE",
      note: reqRow.note || (((reqRow as { type?: "OFF" | "LEAVE" }).type ?? "LEAVE") === "OFF" ? "Libur disetujui" : "Cuti disetujui"),
    },
    { onConflict: "employee_id,date" }
  );
  if (excErr) {
    return {
      ok: false,
      error: "Pengajuan disetujui tapi gagal menandai jadwal — periksa Cek Jadwal Terapis dan tandai manual jika perlu.",
    };
  }

  revalidateLeave();
  return { ok: true };
}

export async function rejectLeaveRequest(requestId: string, decisionNote?: string): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error || !employee) return { ok: false, error: error ?? "Data karyawan tidak ditemukan." };

  const { error: updateErr } = await supabase
    .from("employee_leave_requests")
    .update({
      status: "REJECTED",
      decided_by: employee.id,
      decided_at: nowIso(),
      decision_note: decisionNote?.trim() || null,
    })
    .eq("id", requestId)
    .eq("status", "PENDING");
  if (updateErr) {
    if (isMissingTable(updateErr)) return { ok: false, error: MISSING_TABLE_MSG };
    return { ok: false, error: "Gagal menolak — coba lagi." };
  }

  revalidateLeave();
  return { ok: true };
}
