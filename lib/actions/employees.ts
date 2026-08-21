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
