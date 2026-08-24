"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Write side for /manager/expenses — new 2026-08-23, paired with
// lib/data/expenses.ts. Requires migration 0020_inventory_expenses.sql
// (petty_cash / petty_cash_movements + expenses.approved_by/approved_at
// — the `expenses` table itself already existed since baseline 0001).
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

// expenses.submitted_by references app_users(id); expenses.approved_by
// (added by 0020) references employees(id) — two different ids for the
// same signed-in person. Same helper/reasoning as lib/actions/inventory.ts.
async function resolveIdentity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string
): Promise<{ appUserId: string | null; employeeId: string | null }> {
  const { data } = await supabase.from("app_users").select("id, employee_id").eq("auth_user_id", authUserId).maybeSingle();
  return { appUserId: data?.id ?? null, employeeId: data?.employee_id ?? null };
}

/**
 * Daftar metode pembayaran yang sah. Diekspor (2026-08-24) supaya tidak
 * lagi "hanya dipakai sebagai tipe": nilainya berguna sebagai sumber
 * kebenaran runtime untuk validasi input dan untuk mengisi dropdown di
 * form, sedangkan PaymentMethod di bawah tetap diturunkan dari sini
 * sehingga keduanya tidak mungkin berbeda.
 */
export const PAYMENT_METHODS = ["Cash", "QRIS", "Debit Card", "Credit Card", "Transfer", "E-Wallet", "Split", "Midtrans"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CreateExpenseInput = {
  outletId: string;
  date: string;
  category: string;
  vendor: string;
  amount: number;
  tax: number;
  paymentMethod: PaymentMethod;
  description: string;
};

export async function createExpense(input: CreateExpenseInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!input.vendor.trim()) return { ok: false, error: "Vendor wajib diisi." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Jumlah harus lebih dari 0." };
  if (!Number.isFinite(input.tax) || input.tax < 0) return { ok: false, error: "Pajak tidak boleh negatif." };

  const { appUserId } = await resolveIdentity(supabase, user.id);
  const { error } = await supabase.from("expenses").insert({
    outlet_id: input.outletId,
    date: input.date,
    category: input.category,
    vendor: input.vendor.trim(),
    amount: input.amount,
    tax: input.tax,
    payment_method: input.paymentMethod,
    description: input.description.trim(),
    status: "SUBMITTED",
    submitted_by: appUserId,
  });
  if (error) return { ok: false, error: "Gagal menyimpan pengeluaran." };

  revalidatePath("/manager/expenses");
  return { ok: true };
}

async function setExpenseStatus(
  id: string,
  status: "APPROVED" | "REJECTED" | "PAID",
  markApprover: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const patch: Record<string, unknown> = { status };
  if (markApprover) {
    const { employeeId } = await resolveIdentity(supabase, user.id);
    patch.approved_by = employeeId;
    patch.approved_at = nowIso();
  }

  const { error } = await supabase.from("expenses").update(patch).eq("id", id);
  if (error) return { ok: false, error: "Gagal mengubah status — pastikan akun Anda punya hak approval." };

  revalidatePath("/manager/expenses");
  return { ok: true };
}

export async function approveExpense(id: string): Promise<ActionResult> {
  return setExpenseStatus(id, "APPROVED", true);
}

export async function rejectExpense(id: string): Promise<ActionResult> {
  return setExpenseStatus(id, "REJECTED", true);
}

export async function markExpensePaid(id: string): Promise<ActionResult> {
  return setExpenseStatus(id, "PAID", false);
}

// ============================================================== PETTY CASH

async function ensurePettyCashRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outletId: string
): Promise<void> {
  const { data } = await supabase.from("petty_cash").select("outlet_id").eq("outlet_id", outletId).maybeSingle();
  if (!data) {
    await supabase.from("petty_cash").insert({ outlet_id: outletId, balance: 0, limit_amount: 0 });
  }
}

export type PettyCashMoveInput = { outletId: string; amount: number; note: string };

async function movePettyCash(
  input: PettyCashMoveInput,
  type: "TOP_UP" | "DISBURSEMENT",
  sign: 1 | -1
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Jumlah harus lebih dari 0." };

  const { employeeId } = await resolveIdentity(supabase, user.id);
  await ensurePettyCashRow(supabase, input.outletId);

  const { data: current } = await supabase.from("petty_cash").select("balance").eq("outlet_id", input.outletId).single();
  const newBalance = Number(current?.balance ?? 0) + sign * input.amount;
  if (newBalance < 0) return { ok: false, error: "Saldo kas kecil tidak cukup untuk pengeluaran ini." };

  const at = nowIso();
  const patch: Record<string, unknown> = { balance: newBalance, updated_at: at };
  if (type === "TOP_UP") patch.last_top_up_at = at;

  const { error: updateError } = await supabase.from("petty_cash").update(patch).eq("outlet_id", input.outletId);
  if (updateError) return { ok: false, error: "Gagal memperbarui saldo kas kecil." };

  await supabase.from("petty_cash_movements").insert({
    outlet_id: input.outletId,
    type,
    amount: sign * input.amount,
    note: input.note.trim() || null,
    at,
    by_employee_id: employeeId,
  });

  revalidatePath("/manager/expenses");
  return { ok: true };
}

export async function topUpPettyCash(input: PettyCashMoveInput): Promise<ActionResult> {
  return movePettyCash(input, "TOP_UP", 1);
}

export async function disbursePettyCash(input: PettyCashMoveInput): Promise<ActionResult> {
  return movePettyCash(input, "DISBURSEMENT", -1);
}

export async function setPettyCashCustodian(outletId: string, employeeId: string, limitAmount: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };
  if (!Number.isFinite(limitAmount) || limitAmount < 0) return { ok: false, error: "Limit tidak boleh negatif." };

  await ensurePettyCashRow(supabase, outletId);
  const { error } = await supabase
    .from("petty_cash")
    .update({ custodian_employee_id: employeeId, limit_amount: limitAmount, updated_at: nowIso() })
    .eq("outlet_id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan pengaturan kas kecil." };

  revalidatePath("/manager/expenses");
  return { ok: true };
}
