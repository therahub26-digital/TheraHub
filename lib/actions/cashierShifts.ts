"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, todayIsoDate } from "@/lib/wallclock";
import {
  cashVariance,
  expectedCash,
  nextShiftToOpen,
  shiftOpenAt,
  summarizeShiftSales,
  varianceNeedsNote,
} from "@/lib/cashier-shift-math";
import { getPaidTransactionsBetween } from "@/lib/data/cashierShifts";

// ---------------------------------------------------------------------
// Sisi tulis Tutup Kasir — baru 18 Okt 2026 (butuh migrasi 0042).
// Angka penjualan & ekspektasi kas SELALU dihitung ulang di server saat
// tutup shift; angka di layar kasir hanya pratinjau.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, me: null, error: "Sesi tidak ditemukan — silakan login ulang." };
  const { data: me } = await supabase
    .from("app_users")
    .select("id, name, email, outlet_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { supabase, me: null, error: "Akun ini belum terhubung ke data pengguna — hubungi admin." };
  return { supabase, me, error: null };
}

function writeError(err: { code?: string; message?: string } | null, what: string): string {
  if (err?.code === "42501") return `Role kamu belum diizinkan ${what} di outlet ini.`;
  if (err?.code === "23505") return "Shift ini sudah dibuka/ditutup oleh perangkat lain — muat ulang halaman.";
  if (err?.code === "42P01" || err?.code === "PGRST205") return "Modul shift belum aktif (migrasi 0042 belum diterapkan).";
  return `Gagal ${what} — coba lagi.`;
}

export async function openCashierShift(input: { outletId: string; openingFloat: number }): Promise<ActionResult> {
  const { supabase, me, error } = await requireUser();
  if (error || !me) return { ok: false, error: error ?? "Sesi tidak valid." };

  if (!Number.isFinite(input.openingFloat) || input.openingFloat < 0) {
    return { ok: false, error: "Modal awal tidak boleh kosong atau negatif." };
  }
  if (input.openingFloat > 100_000_000) {
    return { ok: false, error: "Modal awal terlalu besar — periksa lagi angkanya." };
  }

  const today = todayIsoDate();
  const [{ data: outlet }, { data: rows, error: readErr }] = await Promise.all([
    supabase.from("outlets").select("cashier_shifts_per_day").eq("id", input.outletId).maybeSingle(),
    supabase
      .from("cashier_shifts")
      .select("business_date, shift_no, status, closed_at")
      .eq("outlet_id", input.outletId)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .limit(10),
  ]);
  if (readErr) return { ok: false, error: writeError(readErr, "membaca shift") };

  const shifts = (rows ?? []).map((r) => ({
    businessDate: String(r.business_date),
    shiftNo: Number(r.shift_no),
    status: r.status as "OPEN" | "CLOSED",
  }));
  const next = nextShiftToOpen(outlet?.cashier_shifts_per_day === 2 ? 2 : 1, today, shifts);
  if (!next.ok) return { ok: false, error: next.reason };

  const lastClosedAt = (rows ?? []).find((r) => r.closed_at)?.closed_at ?? null;
  const { error: insErr } = await supabase.from("cashier_shifts").insert({
    outlet_id: input.outletId,
    business_date: today,
    shift_no: next.shiftNo,
    status: "OPEN",
    opened_at: shiftOpenAt(nowIso(), lastClosedAt ? String(lastClosedAt) : null),
    opened_by: me.id,
    opened_by_name: me.name ?? me.email ?? "Kasir",
    opening_float: Math.round(input.openingFloat),
  });
  if (insErr) return { ok: false, error: writeError(insErr, "membuka shift") };

  revalidatePath("/kasir/closing");
  return { ok: true };
}

export async function closeCashierShift(input: {
  shiftId: string;
  countedCash: number;
  varianceNote: string;
}): Promise<ActionResult & { variance?: number }> {
  const { supabase, me, error } = await requireUser();
  if (error || !me) return { ok: false, error: error ?? "Sesi tidak valid." };

  if (!Number.isFinite(input.countedCash) || input.countedCash < 0) {
    return { ok: false, error: "Isi kas hasil hitung fisik (boleh 0, tidak boleh negatif)." };
  }

  const { data: shift, error: readErr } = await supabase
    .from("cashier_shifts")
    .select("id, outlet_id, status, opened_at, opening_float")
    .eq("id", input.shiftId)
    .maybeSingle();
  if (readErr || !shift) return { ok: false, error: "Shift tidak ditemukan." };
  if (shift.status !== "OPEN") return { ok: false, error: "Shift ini sudah ditutup — muat ulang halaman." };

  const closedAt = nowIso();
  const txs = await getPaidTransactionsBetween(supabase, shift.outlet_id, String(shift.opened_at), closedAt);
  const summary = summarizeShiftSales(txs);
  const expected = expectedCash(Number(shift.opening_float), summary.cashSales);
  const counted = Math.round(input.countedCash);
  const variance = cashVariance(counted, expected);
  const note = input.varianceNote.trim();

  if (varianceNeedsNote(variance) && !note) {
    return {
      ok: false,
      variance,
      error: `Ada selisih ${variance > 0 ? "lebih" : "kurang"} Rp${Math.abs(variance).toLocaleString("id-ID")} — alasan selisih wajib diisi.`,
    };
  }

  // Klaim atomik: hanya berhasil kalau shift masih OPEN (cegah tutup ganda).
  const { data: updated, error: updErr } = await supabase
    .from("cashier_shifts")
    .update({
      status: "CLOSED",
      closed_at: closedAt,
      closed_by: me.id,
      closed_by_name: me.name ?? me.email ?? "Kasir",
      transaction_count: summary.transactionCount,
      total_sales: summary.totalSales,
      cash_sales: summary.cashSales,
      non_cash: summary.nonCash,
      expected_cash: expected,
      counted_cash: counted,
      variance,
      variance_note: note || null,
    })
    .eq("id", shift.id)
    .eq("status", "OPEN")
    .select("id");
  if (updErr) return { ok: false, error: writeError(updErr, "menutup shift") };
  if (!updated || updated.length === 0) return { ok: false, error: "Shift ini sudah ditutup perangkat lain — muat ulang halaman." };

  revalidatePath("/kasir/closing");
  revalidatePath("/manager/settings");
  return { ok: true, variance };
}

export async function setCashierShiftsPerDay(outletId: string, shiftsPerDay: number): Promise<ActionResult> {
  const { supabase, me, error } = await requireUser();
  if (error || !me) return { ok: false, error: error ?? "Sesi tidak valid." };
  if (shiftsPerDay !== 1 && shiftsPerDay !== 2) return { ok: false, error: "Pilih 1 atau 2 shift per hari." };

  const { data, error: updErr } = await supabase
    .from("outlets")
    .update({ cashier_shifts_per_day: shiftsPerDay })
    .eq("id", outletId)
    .select("id");
  if (updErr) return { ok: false, error: writeError(updErr, "mengubah pengaturan shift") };
  if (!data || data.length === 0) return { ok: false, error: "Role kamu belum diizinkan mengubah pengaturan outlet ini." };

  revalidatePath("/manager/settings");
  revalidatePath("/kasir/closing");
  return { ok: true };
}
