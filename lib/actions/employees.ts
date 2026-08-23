"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Editing an employee's fixed-pay fields.
//
// Every employee in the live database currently has base_salary = 0 and
// fixed_allowance = 0 — not because that is anyone's real pay, but
// because no form to set them was ever built (dev-seed writes real
// therapist names and real service pricing, but flags these two columns
// as an explicit placeholder — "real pay not disclosed yet").
//
// That is exactly why the payroll module's FIXED/ALLOWANCE components
// have looked broken for non-therapist staff: activeComponents() and
// runPayroll() were both built correctly against these columns, but
// there was never a way to put a real number IN them except editing the
// database by hand. This action is that missing write path.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export type UpdateEmployeeSalaryInput = {
  employeeId: string;
  baseSalary: number;
  fixedAllowance: number;
};

export async function updateEmployeeSalary(input: UpdateEmployeeSalaryInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!Number.isFinite(input.baseSalary) || input.baseSalary < 0) {
    return { ok: false, error: "Gaji pokok tidak boleh negatif." };
  }
  if (!Number.isFinite(input.fixedAllowance) || input.fixedAllowance < 0) {
    return { ok: false, error: "Tunjangan tidak boleh negatif." };
  }

  // RLS (employees_write, 0002) is the real gate — admin/owner tenant-wide
  // or the outlet's own manager. This check exists only so a kasir or
  // therapist gets a readable message instead of a bare Postgres error.
  const { error } = await supabase
    .from("employees")
    .update({ base_salary: input.baseSalary, fixed_allowance: input.fixedAllowance })
    .eq("id", input.employeeId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah data karyawan." };
  }

  // This number feeds straight into the payroll estimate table, so that
  // view has to reflect it immediately — otherwise a manager reviewing
  // payroll right after this edit would see the old (usually zero) figure
  // and reasonably conclude the edit didn't take.
  revalidatePath("/admin/users");
  revalidatePath("/manager/payroll");
  revalidatePath("/owner/payroll");

  return { ok: true };
}

// ---------------------------------------------------------------------
// Referral relationship + fee (real case: Zahra was recruited by Lusi,
// pays Lusi Rp5.000 per treatment). NULL/undefined means no referral
// relationship configured — "belum diatur ≠ nol" — never read as a fee
// of zero. See supabase/migrations/0008_referral_fee.sql and the
// referral-fee block in runPayroll() (lib/actions/payroll.ts).
//
// Passing referredByEmployeeId: null clears the relationship entirely
// (and the fee rule with it) — a manager undoing a mistaken entry, not
// setting a fee of zero.
// ---------------------------------------------------------------------

export type UpdateEmployeeReferralInput = {
  employeeId: string;
  referredByEmployeeId: string | null;
  referralFeeType: "fixed" | "percent" | null;
  referralFeeValue: number | null;
};

function validateReferralFee(type: "fixed" | "percent", value: number): string | null {
  if (!Number.isFinite(value)) return "Nilai fee referral harus berupa angka.";
  if (value < 0) return "Fee referral tidak boleh negatif.";
  if (type === "percent" && value > 100) {
    return "Fee referral persen tidak boleh lebih dari 100%. Kalau maksudnya rupiah, ganti satuannya ke Rupiah dulu.";
  }
  return null;
}

export async function updateEmployeeReferral(input: UpdateEmployeeReferralInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (input.employeeId === input.referredByEmployeeId) {
    return { ok: false, error: "Karyawan tidak bisa merekrut dirinya sendiri." };
  }

  // Clearing the relationship: wipe all three columns together, never
  // leave a fee rule dangling with no recruiter attached.
  if (input.referredByEmployeeId === null) {
    const { error } = await supabase
      .from("employees")
      .update({ referred_by_employee_id: null, referral_fee_type: null, referral_fee_value: null })
      .eq("id", input.employeeId);
    if (error) {
      return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah data karyawan." };
    }
    revalidatePath("/admin/users");
    return { ok: true };
  }

  if (!input.referralFeeType || input.referralFeeValue === null) {
    return { ok: false, error: "Isi tipe dan nilai fee referral (perekrut sudah dipilih)." };
  }

  const feeErr = validateReferralFee(input.referralFeeType, input.referralFeeValue);
  if (feeErr) return { ok: false, error: feeErr };

  const { error } = await supabase
    .from("employees")
    .update({
      referred_by_employee_id: input.referredByEmployeeId,
      referral_fee_type: input.referralFeeType,
      referral_fee_value: input.referralFeeValue,
    })
    .eq("id", input.employeeId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah data karyawan." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/manager/payroll");
  revalidatePath("/owner/payroll");

  return { ok: true };
}

// ---------------------------------------------------------------------
// Therapist photo album — "kalau di klik di kotak therapis maka akan
// muncul profil dan album foto therapis, isi maksimal 3 foto", user
// request 2026-08-22. See 0017_therapist_gallery_booking_window_
// schedule.sql's header for the `therapist-photos` Storage bucket + RLS
// (`_is_manager_here(outlet_id) or _is_admin_or_owner()`).
//
// Same split as setAlarmSoundUrl(): the actual file upload happens
// client-side straight to Storage using the manager's own session (see
// components/EmployeePhotoGallery.tsx) — this action only ever persists
// the resulting list of public URLs onto employees.gallery_urls.
// `employees_write` RLS is the real gate; the length check here is just
// a readable message instead of a raw constraint error (the DB column
// has no CHECK on array length, so this is the only enforcement of "max
// 3" for a manager going through the UI — a very determined caller with
// direct DB access could still write more, which is an acceptable gap
// given the UI never invites it).
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — user feedback: "tambah staf/therapis belum
// berfungsi dan edit profil nya tidak ada: foto profil, data pribadi,
// tanggal join, ... bisa di view di manager / admin outlet". The
// "Tambah Staff" button on /manager/therapists had no onClick at all,
// and neither table on that page had any edit action — this is the
// missing write path for both.
//
// Scoped to what the existing schema already supports: name, role,
// grade, phone, email, join date, contract type, therapist-only fields
// (grade/skills), and the single profile photo (employees.photo_url,
// distinct from gallery_urls which is the up-to-3-photo album). "Kopi
// KTP" is NOT included here — there is no column or Storage bucket for
// it yet, and a KTP scan is sensitive PII that needs its own
// non-public bucket + RLS, not a reuse of the public therapist-photos
// bucket. That is drafted as a separate migration for the user to
// review and approve before it touches production (see the migration
// draft handed to the user alongside this change) — this action
// intentionally does not touch it.
// ---------------------------------------------------------------------

function validateEmployeeCore(input: { name: string; jobRole: string; joinDate: string }): string | null {
  if (!input.name.trim()) return "Nama wajib diisi.";
  if (!input.jobRole) return "Pilih peran/jabatan.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joinDate)) return "Tanggal join tidak valid.";
  return null;
}

/**
 * Generates the next sequential code for a new employee, e.g. TRP-006 or
 * STF-014. Counts existing employees sharing the same prefix tenant-wide
 * (codes are a display convenience, not a security boundary — the `id`
 * column is what every foreign key actually uses) so an outlet-scoped
 * create still gets a code that doesn't collide with another outlet's.
 * insert() below still handles a race by falling back to a suffixed code
 * once, rather than failing the whole create over a rare double-click.
 */
async function nextEmployeeCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  isTherapist: boolean
): Promise<string> {
  const prefix = isTherapist ? "TRP" : "STF";
  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_therapist", isTherapist);
  const n = (count ?? 0) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

const AVATAR_TONES = ["teal", "sky", "gold", "violet", "rose", "amber"];

export type CreateEmployeeInput = {
  outletId: string;
  tenantId: string;
  name: string;
  jobRole: string;
  isTherapist: boolean;
  grade?: string;
  therapistGrade?: "Junior" | "Senior" | "Master" | null;
  phone?: string;
  email?: string;
  joinDate: string;
  contractType: "Tetap" | "Kontrak" | "Harian";
};

export type CreateEmployeeResult = { ok: true; employeeId: string } | { ok: false; error: string };

export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const coreErr = validateEmployeeCore(input);
  if (coreErr) return { ok: false, error: coreErr };

  const code = await nextEmployeeCode(supabase, input.tenantId, input.isTherapist);
  const avatarTone = AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)];

  const row = {
    tenant_id: input.tenantId,
    outlet_id: input.outletId,
    code,
    name: input.name.trim(),
    job_role: input.jobRole,
    grade: input.grade?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    join_date: input.joinDate,
    status: "ACTIVE",
    contract_type: input.contractType,
    base_salary: 0,
    fixed_allowance: 0,
    avatar_tone: avatarTone,
    is_therapist: input.isTherapist,
    skills: input.isTherapist ? [] : null,
    therapist_grade: input.isTherapist ? input.therapistGrade ?? null : null,
  };

  let { data, error } = await supabase.from("employees").insert(row).select("id").single();
  if (error && error.code === "23505") {
    // Unique-code collision (rare double-click race) — retry once with a
    // timestamp-suffixed code rather than failing the whole create.
    const retryCode = `${code}-${Date.now().toString().slice(-4)}`;
    ({ data, error } = await supabase.from("employees").insert({ ...row, code: retryCode }).select("id").single());
  }

  if (error || !data) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak tambah karyawan." };
  }

  revalidatePath("/manager/therapists");
  revalidatePath("/admin/users");
  return { ok: true, employeeId: data.id };
}

export type UpdateEmployeeProfileInput = {
  employeeId: string;
  name: string;
  jobRole: string;
  grade?: string;
  therapistGrade?: "Junior" | "Senior" | "Master" | null;
  phone?: string;
  email?: string;
  joinDate: string;
  contractType: "Tetap" | "Kontrak" | "Harian";
};

export async function updateEmployeeProfile(input: UpdateEmployeeProfileInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const coreErr = validateEmployeeCore(input);
  if (coreErr) return { ok: false, error: coreErr };

  const { error } = await supabase
    .from("employees")
    .update({
      name: input.name.trim(),
      job_role: input.jobRole,
      grade: input.grade?.trim() || null,
      therapist_grade: input.therapistGrade ?? null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      join_date: input.joinDate,
      contract_type: input.contractType,
    })
    .eq("id", input.employeeId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah data karyawan." };
  }

  revalidatePath("/manager/therapists");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Single profile-photo URL (employees.photo_url) — distinct from the up-to-3 gallery_urls album. */
export async function setEmployeePhotoUrl(employeeId: string, url: string | null): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase.from("employees").update({ photo_url: url }).eq("id", employeeId);
  if (error) {
    return { ok: false, error: "Gagal menyimpan foto — pastikan akun Anda punya hak ubah data karyawan." };
  }

  revalidatePath("/manager/therapists");
  revalidatePath("/customer/book");
  revalidatePath("/customer/outlets");
  return { ok: true };
}

export async function setEmployeeGalleryUrls(employeeId: string, urls: string[]): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (urls.length > 3) {
    return { ok: false, error: "Maksimal 3 foto per terapis." };
  }

  const { error } = await supabase.from("employees").update({ gallery_urls: urls }).eq("id", employeeId);
  if (error) {
    return { ok: false, error: "Gagal menyimpan foto — pastikan akun Anda punya hak ubah data karyawan." };
  }

  revalidatePath("/manager/therapists");
  revalidatePath("/customer/book");
  revalidatePath("/customer/outlets");

  return { ok: true };
}
