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

/** Therapist submits a leave/sick-day request for a future (or today's) date. */
export async function requestLeave(date: string, note?: string): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error || !employee) return { ok: false, error: error ?? "Data karyawan tidak ditemukan." };

  const today = todayIsoDate();
  if (date < today) return { ok: false, error: "Tidak bisa mengajukan cuti untuk tanggal yang sudah lewat." };

  // One PENDING request per date per therapist — a second ask before the
  // first is decided would leave the manager/kasir approving duplicates
  // for the same day.
  const { data: existing } = await supabase
    .from("employee_leave_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("date", date)
    .eq("status", "PENDING")
    .maybeSingle();
  if (existing) return { ok: false, error: "Sudah ada pengajuan cuti yang menunggu keputusan untuk tanggal ini." };

  const { error: insertErr } = await supabase.from("employee_leave_requests").insert({
    employee_id: employee.id,
    outlet_id: employee.outlet_id,
    date,
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
 * Manager or kasir approves a PENDING request: marks it APPROVED, then
 * writes the actual LEAVE exception to employee_schedule_exceptions —
 * the table every booking-conflict check already reads from. The
 * request row itself never drives scheduling; approving it is what
 * does, exactly once, here.
 */
export async function approveLeaveRequest(requestId: string, decisionNote?: string): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error || !employee) return { ok: false, error: error ?? "Data karyawan tidak ditemukan." };

  const { data: reqRow, error: readErr } = await supabase
    .from("employee_leave_requests")
    .select("id, employee_id, outlet_id, date, note, status")
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

  const { error: excErr } = await supabase.from("employee_schedule_exceptions").upsert(
    {
      employee_id: reqRow.employee_id,
      outlet_id: reqRow.outlet_id,
      date: reqRow.date,
      type: "LEAVE",
      note: reqRow.note || "Cuti disetujui",
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
