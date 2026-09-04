"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    revalidatePath("/manager/therapists");
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
  // Editor referral juga dipasang di /manager/therapists sejak 2026-08-22,
  // tapi path itu tidak pernah ikut di-revalidate. Akibatnya manager yang
  // menyimpan dari halaman itu melihat nilai lama, mengira simpanannya
  // gagal, lalu mengulang — padahal tulisannya sudah berhasil.
  revalidatePath("/manager/therapists");
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
  /**
   * Tingkat pijatan untuk landing publik (migrasi 0034). null = admin
   * mengosongkan ("Belum diatur"); undefined = field tidak dikirim sama
   * sekali (kolomnya tidak disentuh — penting supaya save dari form lama
   * atau untuk non-terapis tidak menulis kolom yang mungkin belum ada).
   */
  massageIntensity?: "STRONG" | "MEDIUM" | "MEDIUM_STRONG" | null;
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
      // Kolom baru (0034) hanya disentuh kalau field-nya benar-benar
      // dikirim — undefined berarti "biarkan apa adanya".
      ...(input.massageIntensity !== undefined ? { massage_intensity: input.massageIntensity } : {}),
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

// ---------------------------------------------------------------------
// "+ Tambah User" on /admin/users — Adjie (2026-08-25): "tombol tambah
// user ... belum berfungsi", clarified afterwards that this button
// specifically must create "Karyawan + akun login sekaligus" (an
// employee row AND a real login account together, not just one or the
// other).
//
// Not every job role has anywhere to log in to (Office Boy / Admin Umum
// / Supervisor have no dedicated portal), so `accessRole` is a separate,
// optional choice from `jobRole` rather than derived automatically for
// every row — leaving it "" creates the employee only (same effect as
// createEmployee() above), matching what Manager already does on
// /manager/therapists. When an accessRole IS chosen, email becomes
// required and this creates, in order: the employee row, the Supabase
// Auth user (service-role — this is the one step a normal RLS-scoped
// session can never do), then the app_users row that links all three
// together. Any failure after the employee row exists rolls back what
// was already created rather than leaving an orphaned half-user behind.
//
// The temporary password is generated here (never chosen by the caller,
// never logged) and handed back once in the result so the admin can
// relay it to the new user — there is no outgoing-email infra in this
// project yet, so this is the only channel for it today.
// ---------------------------------------------------------------------

export type AccessRole = "" | "admin" | "owner" | "manager" | "kasir" | "therapist";

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export type CreateUserWithLoginInput = {
  outletId: string;
  tenantId: string;
  name: string;
  jobRole: string;
  grade?: string;
  therapistGrade?: "Junior" | "Senior" | "Master" | null;
  phone?: string;
  email?: string;
  joinDate: string;
  contractType: "Tetap" | "Kontrak" | "Harian";
  /** "" = karyawan saja, tanpa akun login (sama seperti createEmployee()). */
  accessRole: AccessRole;
};

export type CreateUserWithLoginResult =
  | { ok: true; employeeId: string; loginCreated: false }
  | { ok: true; employeeId: string; loginCreated: true; email: string; tempPassword: string }
  | { ok: false; error: string };

export async function createUserWithLogin(input: CreateUserWithLoginInput): Promise<CreateUserWithLoginResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const coreErr = validateEmployeeCore(input);
  if (coreErr) return { ok: false, error: coreErr };

  const email = input.email?.trim() ?? "";

  if (input.accessRole) {
    // Membuat akun login adalah tindakan admin/owner (app_users_write_admin
    // di RLS 0002 sudah menegakkan ini juga — cek ini di sini semata supaya
    // manager yang mencoba lewat jalur ini dapat pesan yang jelas, bukan
    // error Postgres mentah setelah user Auth-nya sudah kadung dibuat).
    const { data: me } = await supabase.from("app_users").select("role, tenant_id").eq("auth_user_id", user.id).maybeSingle();
    if (!me?.tenant_id) return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
    if (me.role !== "admin" && me.role !== "owner" && me.role !== "super-admin") {
      return { ok: false, error: "Hanya Admin/Owner yang bisa membuat akun login." };
    }
    if (!email) return { ok: false, error: "Email wajib diisi untuk membuat akun login." };

    const { data: existing } = await supabase.from("app_users").select("id").eq("email", email).maybeSingle();
    if (existing) return { ok: false, error: `Email ${email} sudah dipakai user lain.` };
  }

  const isTherapist = input.jobRole === "Terapis";
  const code = await nextEmployeeCode(supabase, input.tenantId, isTherapist);
  const avatarTone = AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)];

  const row = {
    tenant_id: input.tenantId,
    outlet_id: input.outletId,
    code,
    name: input.name.trim(),
    job_role: input.jobRole,
    grade: input.grade?.trim() || null,
    phone: input.phone?.trim() || null,
    email: email || null,
    join_date: input.joinDate,
    status: "ACTIVE",
    contract_type: input.contractType,
    base_salary: 0,
    fixed_allowance: 0,
    avatar_tone: avatarTone,
    is_therapist: isTherapist,
    skills: isTherapist ? [] : null,
    therapist_grade: isTherapist ? input.therapistGrade ?? null : null,
  };

  let { data: emp, error: empErr } = await supabase.from("employees").insert(row).select("id").single();
  if (empErr && empErr.code === "23505") {
    const retryCode = `${code}-${Date.now().toString().slice(-4)}`;
    ({ data: emp, error: empErr } = await supabase.from("employees").insert({ ...row, code: retryCode }).select("id").single());
  }
  if (empErr || !emp) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak tambah karyawan." };
  }

  if (!input.accessRole) {
    revalidatePath("/admin/users");
    revalidatePath("/manager/therapists");
    return { ok: true, employeeId: emp.id, loginCreated: false };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr || !authUser?.user) {
    // Karyawan sudah kadung tersimpan — batalkan supaya tidak ada baris
    // karyawan yatim tanpa akun login yang gagal dibuat di sampingnya.
    await supabase.from("employees").delete().eq("id", emp.id);
    return { ok: false, error: `Gagal membuat akun login: ${authErr?.message ?? "tidak diketahui"}.` };
  }

  const { error: appUserErr } = await supabase.from("app_users").insert({
    auth_user_id: authUser.user.id,
    tenant_id: input.tenantId,
    outlet_id: input.outletId,
    role: input.accessRole,
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null,
    employee_id: emp.id,
  });
  if (appUserErr) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("employees").delete().eq("id", emp.id);
    return { ok: false, error: "Gagal menyimpan akun login — karyawan dibatalkan, silakan coba lagi." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/manager/therapists");
  return { ok: true, employeeId: emp.id, loginCreated: true, email, tempPassword };
}
