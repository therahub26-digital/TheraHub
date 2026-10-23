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
 * Daftar metode pembayaran yang sah -- sumber kebenaran tunggal untuk
 * PaymentMethod di bawah dan untuk validasi runtime di createExpense().
 *
 * TIDAK di-export (revisi 2026-08-24 malam): file ini "use server", dan
 * Next.js mewajibkan SEMUA export dari file "use server" berupa async
 * function -- meng-export const array ini bikin build produksi gagal
 * ("A \"use server\" file can only export async functions", ketahuan
 * saat deploy pertama ke Vercel). Tidak ada kode lain yang mengimpor
 * PAYMENT_METHODS dari sini (komponen lain punya array lokalnya sendiri),
 * jadi tidak perlu diekspor -- yang perlu diekspor cuma tipe turunannya,
 * dan itu aman karena type-only export dihapus saat kompilasi.
 */
// HARUS sama persis dengan enum Postgres `expense_method` (Cash, Bank
// Transfer, Petty Cash, Card). Daftar lama menyalin enum metode bayar
// KASIR (QRIS, Transfer, E-Wallet, …) sehingga setiap pilihan selain
// "Cash" ditolak database ("invalid input value for enum expense_method")
// — ditemukan 18 Okt 2026 saat mengisi data contoh pengeluaran.
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Petty Cash", "Card"] as const;
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
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { ok: false, error: "Metode pembayaran tidak dikenali." };

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

  revalidateExpensePages();
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

  revalidateExpensePages();
  return { ok: true };
}

function revalidateExpensePages() {
  revalidatePath("/manager/expenses");
  revalidatePath("/owner/expenses");
}

export async function approveExpense(id: string): Promise<ActionResult> {
  return setExpenseStatus(id, "APPROVED", true);
}

export async function rejectExpense(id: string): Promise<ActionResult> {
  return setExpenseStatus(id, "REJECTED", true);
}

/**
 * Pengeluaran yang sudah DISETUJUI ditandai DIBAYAR (2026-10-23). Bila
 * metode bayarnya "Petty Cash", saldo kas kecil outlet langsung dipotong
 * sebesar jumlah + pajak dan mutasinya ditautkan ke expense ini
 * (petty_cash_movements.expense_id) supaya tidak tercatat dua kali.
 * Saldo kurang → status TIDAK berubah.
 */
export async function markExpensePaid(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, outlet_id, vendor, category, amount, tax, payment_method, status")
    .eq("id", id)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Pengeluaran tidak ditemukan." };
  if (expense.status !== "APPROVED") return { ok: false, error: "Hanya pengeluaran yang sudah disetujui yang bisa ditandai dibayar." };

  // Ubah status dulu dengan penjaga status, supaya klik ganda tidak
  // memotong kas kecil dua kali.
  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ status: "PAID" })
    .eq("id", id)
    .eq("status", "APPROVED")
    .select("id");
  if (error) return { ok: false, error: "Gagal mengubah status — pastikan akun Anda punya hak approval." };
  if (!updated?.length) return { ok: false, error: "Status pengeluaran sudah berubah. Muat ulang halaman." };

  if (expense.payment_method === "Petty Cash") {
    const total = Number(expense.amount) + Number(expense.tax ?? 0);
    const moved = await movePettyCash(
      { outletId: expense.outlet_id, amount: total, note: `${expense.category} · ${expense.vendor}` },
      "DISBURSEMENT",
      -1,
      expense.id,
    );
    if (!moved.ok) {
      // Kembalikan status; pengeluaran belum benar-benar dibayar.
      await supabase.from("expenses").update({ status: "APPROVED" }).eq("id", id).eq("status", "PAID");
      return moved;
    }
  }

  revalidateExpensePages();
  return { ok: true };
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
  sign: 1 | -1,
  expenseId: string | null = null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Jumlah harus lebih dari 0." };

  const { employeeId } = await resolveIdentity(supabase, user.id);
  await ensurePettyCashRow(supabase, input.outletId);

  const { data: current } = await supabase.from("petty_cash").select("balance, limit_amount").eq("outlet_id", input.outletId).single();
  const newBalance = Number(current?.balance ?? 0) + sign * input.amount;
  if (newBalance < 0) return { ok: false, error: "Saldo kas kecil tidak cukup untuk pengeluaran ini." };
  // Limit = plafon saldo kas kecil (0 = belum diatur, tidak dibatasi).
  const limit = Number(current?.limit_amount ?? 0);
  if (type === "TOP_UP" && limit > 0 && newBalance > limit) {
    return { ok: false, error: `Top-up melebihi limit kas kecil. Maksimal top-up saat ini Rp${Math.max(0, limit - Number(current?.balance ?? 0)).toLocaleString("id-ID")}.` };
  }

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
    expense_id: expenseId,
  });

  revalidateExpensePages();
  return { ok: true };
}

export async function topUpPettyCash(input: PettyCashMoveInput): Promise<ActionResult> {
  return movePettyCash(input, "TOP_UP", 1);
}

/** Uang keluar dari kas kecil untuk belanja kecil tanpa entri pengeluaran terpisah (wajib catatan). */
export async function disbursePettyCash(input: PettyCashMoveInput): Promise<ActionResult> {
  if (!input.note.trim()) return { ok: false, error: "Tulis untuk apa uangnya dipakai." };
  return movePettyCash(input, "DISBURSEMENT", -1);
}

export async function setPettyCashCustodian(outletId: string, employeeId: string | null, limitAmount: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };
  if (!Number.isFinite(limitAmount) || limitAmount < 0) return { ok: false, error: "Limit tidak boleh negatif." };

  await ensurePettyCashRow(supabase, outletId);
  const { error } = await supabase
    .from("petty_cash")
    .update({ custodian_employee_id: employeeId || null, limit_amount: limitAmount, updated_at: nowIso() })
    .eq("outlet_id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan pengaturan kas kecil." };

  revalidateExpensePages();
  return { ok: true };
}
