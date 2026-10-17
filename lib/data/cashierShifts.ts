import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import { nowIso, todayIsoDate, wallClockIso, plusDays } from "@/lib/wallclock";
import {
  expectedCash,
  nextShiftToOpen,
  summarizeShiftSales,
  type ShiftSalesSummary,
} from "@/lib/cashier-shift-math";

// ---------------------------------------------------------------------
// Sisi baca Tutup Kasir (shift kasir) — baru 18 Okt 2026, menggantikan
// data contoh di /kasir/closing. Butuh migrasi 0042_cashier_shifts.sql.
// Kalau migrasinya belum diterapkan, `migrationMissing` = true dan halaman
// menampilkan petunjuk, bukan error.
// ---------------------------------------------------------------------

export type CashierShift = {
  id: string;
  businessDate: string;
  shiftNo: number;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openedByName: string;
  openingFloat: number;
  closedAt: string | null;
  closedByName: string | null;
  transactionCount: number | null;
  totalSales: number | null;
  cashSales: number | null;
  nonCash: Record<string, number> | null;
  expectedCash: number | null;
  countedCash: number | null;
  variance: number | null;
  varianceNote: string | null;
};

export type CashierShiftState = {
  live: boolean;
  migrationMissing: boolean;
  outletId: string;
  shiftsPerDay: 1 | 2;
  today: string;
  openShift: CashierShift | null;
  /** Ringkasan penjualan berjalan untuk shift yang sedang terbuka. */
  openSummary: (ShiftSalesSummary & { expectedCash: number }) | null;
  canOpen: { ok: true; shiftNo: number } | { ok: false; reason: string };
  history: CashierShift[];
  /** Transaksi lunas hari ini yang dibayar saat tidak ada shift terbuka. */
  outsideShiftToday: { count: number; total: number };
};

type Row = {
  id: string;
  business_date: string;
  shift_no: number;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  opened_by_name: string;
  opening_float: number | string;
  closed_at: string | null;
  closed_by_name: string | null;
  transaction_count: number | null;
  total_sales: number | string | null;
  cash_sales: number | string | null;
  non_cash: Record<string, number> | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  variance: number | string | null;
  variance_note: string | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

function mapRow(r: Row): CashierShift {
  return {
    id: r.id,
    businessDate: r.business_date,
    shiftNo: r.shift_no,
    status: r.status,
    openedAt: r.opened_at,
    openedByName: r.opened_by_name,
    openingFloat: Number(r.opening_float),
    closedAt: r.closed_at,
    closedByName: r.closed_by_name,
    transactionCount: r.transaction_count,
    totalSales: num(r.total_sales),
    cashSales: num(r.cash_sales),
    nonCash: r.non_cash,
    expectedCash: num(r.expected_cash),
    countedCash: num(r.counted_cash),
    variance: num(r.variance),
    varianceNote: r.variance_note,
  };
}

/** Transaksi lunas outlet dalam rentang [from, to] (wall-clock). */
export async function getPaidTransactionsBetween(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outletId: string,
  fromIso: string,
  toIso: string
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("total, payment_method, paid_at")
    .eq("outlet_id", outletId)
    .eq("status", "PAID")
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso);
  if (error) throw error;
  return (data ?? []).map((t) => ({
    total: Number(t.total),
    paymentMethod: String(t.payment_method),
    paidAt: String(t.paid_at),
  }));
}

export async function getCashierShiftState(outletId: string): Promise<CashierShiftState> {
  const today = todayIsoDate();
  const empty: CashierShiftState = {
    live: false,
    migrationMissing: false,
    outletId,
    shiftsPerDay: 1,
    today,
    openShift: null,
    openSummary: null,
    canOpen: { ok: false, reason: "Mode demo — login sebagai kasir untuk membuka shift." },
    history: [],
    outsideShiftToday: { count: 0, total: 0 },
  };

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) return empty;

  const supabase = await createClient();

  const { data: outletRow, error: outletErr } = await supabase
    .from("outlets")
    .select("cashier_shifts_per_day")
    .eq("id", outletId)
    .maybeSingle();
  const { data: rows, error: shiftErr } = await supabase
    .from("cashier_shifts")
    .select(
      "id, business_date, shift_no, status, opened_at, opened_by_name, opening_float, closed_at, closed_by_name, transaction_count, total_sales, cash_sales, non_cash, expected_cash, counted_cash, variance, variance_note"
    )
    .eq("outlet_id", outletId)
    .order("business_date", { ascending: false })
    .order("shift_no", { ascending: false })
    .limit(30);

  // 42703 = kolom belum ada, 42P01 / PGRST205 = tabel belum ada → migrasi 0042 belum diterapkan.
  const missingCodes = ["42703", "42P01", "PGRST205", "PGRST204"];
  if ((outletErr && missingCodes.includes(outletErr.code ?? "")) || (shiftErr && missingCodes.includes(shiftErr.code ?? ""))) {
    return { ...empty, live: true, migrationMissing: true, canOpen: { ok: false, reason: "Migrasi 0042 belum diterapkan." } };
  }
  if (outletErr) throw outletErr;
  if (shiftErr) throw shiftErr;

  const shiftsPerDay: 1 | 2 = outletRow?.cashier_shifts_per_day === 2 ? 2 : 1;
  const history = ((rows ?? []) as Row[]).map(mapRow);
  const openShift = history.find((s) => s.status === "OPEN") ?? null;
  const now = nowIso();

  let openSummary: CashierShiftState["openSummary"] = null;
  if (openShift) {
    const txs = await getPaidTransactionsBetween(supabase, outletId, openShift.openedAt, now);
    const summary = summarizeShiftSales(txs);
    openSummary = { ...summary, expectedCash: expectedCash(openShift.openingFloat, summary.cashSales) };
  }

  // Transaksi hari ini yang tidak jatuh di rentang shift mana pun.
  const dayStart = wallClockIso(today, "00:00");
  const dayEnd = wallClockIso(plusDays(today, 1), "00:00");
  const todayTx = await getPaidTransactionsBetween(supabase, outletId, dayStart, dayEnd);
  const ranges = history
    .filter((s) => s.businessDate === today || s.status === "OPEN")
    .map((s) => [Date.parse(s.openedAt), s.closedAt ? Date.parse(s.closedAt) : Date.parse(now)] as const);
  const outside = todayTx.filter((t) => {
    const at = Date.parse(t.paidAt);
    return !ranges.some(([a, b]) => at >= a && at <= b);
  });

  return {
    live: true,
    migrationMissing: false,
    outletId,
    shiftsPerDay,
    today,
    openShift,
    openSummary,
    canOpen: nextShiftToOpen(shiftsPerDay, today, history),
    history: history.filter((s) => s.status === "CLOSED"),
    outsideShiftToday: {
      count: outside.length,
      total: outside.reduce((a, t) => a + t.total, 0),
    },
  };
}
