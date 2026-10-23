import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TRANSACTIONS as MOCK_TRANSACTIONS } from "@/lib/mock/commerce";
import type { Transaction, TransactionItem } from "@/lib/types";
import { getAuthUser } from "@/lib/supabase/authUser";
import { fetchAllRows, selectInChunks } from "@/lib/supabase/paginate";

// ---------------------------------------------------------------------
// Dual-mode read layer for "transactions" — the POS/billing module,
// fifth in the Fase 5 order (outlets -> employees -> booking -> sesi ->
// TRANSAKSI -> komisi -> payroll). Same fallback rule as bookings.ts and
// sessions.ts, for the same reason: a real outlet with zero transactions
// today is the normal state first thing in the morning, not evidence
// that no one is logged in. Showing mock revenue numbers to a manager
// checking today's takings would be actively harmful, not just wrong.
// ---------------------------------------------------------------------

type TransactionRow = {
  id: string;
  receipt_no: string;
  outlet_id: string;
  booking_id: string | null;
  customer_id: string | null;
  cashier_id: string | null;
  subtotal: number | string;
  discount: number | string;
  discount_reason: string | null;
  tax: number | string;
  service_charge: number | string;
  total: number | string;
  payment_method: Transaction["paymentMethod"] | null;
  status: Transaction["status"];
  paid_at: string | null;
  printed_count: number;
};

type TransactionItemRow = {
  id: string;
  transaction_id: string;
  item_type: TransactionItem["itemType"];
  name: string;
  qty: number;
  unit_price: number | string;
  therapist_id: string | null;
};

// Audit performa 2026-10-23: dulu seluruh riwayat transaksi tenant (+ item
// setiap transaksi) dimuat untuk menampilkan struk hari ini. Sekarang filter
// outlet & rentang paid_at dijalankan di database.
async function fetchLiveTransactions(outletId: string, fromDate: string | null, toDateExcl: string | null): Promise<Transaction[]> {
  const supabase = await createClient();

  // Anti-truncation (2026-10-21) — sama seperti bookings.ts. Urutan
  // terbaru-dulu dipertahankan; id sebagai pemecah seri supaya halaman stabil.
  const { rows, error } = await fetchAllRows<TransactionRow>((from, to) => {
    let query = supabase.from("transactions").select("*").eq("outlet_id", outletId);
    if (fromDate) query = query.gte("paid_at", `${fromDate}T00:00:00+00:00`);
    if (toDateExcl) query = query.lt("paid_at", `${toDateExcl}T00:00:00+00:00`);
    return Promise.resolve(query.order("paid_at", { ascending: false }).order("id").range(from, to));
  });
  if (error || !rows || rows.length === 0) return [];

  const txRows = rows;
  const bookingIds = [...new Set(txRows.map((t) => t.booking_id).filter((v): v is string => !!v))];
  const customerIds = [...new Set(txRows.map((t) => t.customer_id).filter((v): v is string => !!v))];
  const cashierIds = [...new Set(txRows.map((t) => t.cashier_id).filter((v): v is string => !!v))];
  const txIds = txRows.map((t) => t.id);

  const [{ data: bookingRows }, { data: customerRows }, { data: cashierRows }, { data: itemRows }] = await Promise.all([
    selectInChunks<{ id: string; code: string }>(bookingIds, (c, f, t) => supabase.from("bookings").select("id, code").in("id", c).order("id").range(f, t)),
    selectInChunks<{ id: string; name: string }>(customerIds, (c, f, t) => supabase.from("customers").select("id, name").in("id", c).order("id").range(f, t)),
    cashierIds.length ? supabase.from("employees").select("id, name").in("id", cashierIds) : Promise.resolve({ data: [] }),
    selectInChunks<TransactionItemRow>(txIds, (c, f, t) => supabase.from("transaction_items").select("*").in("transaction_id", c).order("id").range(f, t)),
  ]);

  const bookingCode = new Map((bookingRows ?? []).map((b) => [b.id, b.code]));
  const customerName = new Map((customerRows ?? []).map((c) => [c.id, c.name]));
  const cashierName = new Map((cashierRows ?? []).map((e) => [e.id, e.name]));
  const employeeNameById = new Map((cashierRows ?? []).map((e) => [e.id, e.name])); // reused below for item.therapistName
  const itemsByTx = new Map<string, TransactionItem[]>();
  for (const row of (itemRows ?? []) as TransactionItemRow[]) {
    const list = itemsByTx.get(row.transaction_id) ?? [];
    list.push({
      id: row.id,
      itemType: row.item_type,
      name: row.name,
      qty: row.qty,
      unitPrice: Number(row.unit_price),
      therapistName: row.therapist_id ? employeeNameById.get(row.therapist_id) : undefined,
    });
    itemsByTx.set(row.transaction_id, list);
  }

  return txRows.map((row) => ({
    id: row.id,
    receiptNo: row.receipt_no,
    outletId: row.outlet_id,
    bookingCode: row.booking_id ? bookingCode.get(row.booking_id) ?? null : null,
    customerName: (row.customer_id && customerName.get(row.customer_id)) ?? "(tamu tidak ditemukan)",
    cashierName: (row.cashier_id && cashierName.get(row.cashier_id)) ?? "",
    items: itemsByTx.get(row.id) ?? [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    discountReason: row.discount_reason ?? undefined,
    tax: Number(row.tax),
    serviceCharge: Number(row.service_charge),
    total: Number(row.total),
    paymentMethod: (row.payment_method ?? "Cash") as Transaction["paymentMethod"],
    status: row.status,
    paidAt: row.paid_at ?? "",
    printedCount: row.printed_count,
  }));
}

const isLiveSession = cache(async (): Promise<boolean> => {
  const {
    data: { user },
  } = await getAuthUser();
  return user !== null;
});

const loadTransactions = cache(async (outletId: string, fromDate: string | null, toDateExcl: string | null): Promise<Transaction[]> => {
  if (!(await isLiveSession())) {
    return MOCK_TRANSACTIONS.filter(
      (t) => t.outletId === outletId && (!fromDate || t.paidAt.slice(0, 10) >= fromDate) && (!toDateExcl || t.paidAt.slice(0, 10) < toDateExcl),
    );
  }
  return fetchLiveTransactions(outletId, fromDate, toDateExcl);
});

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function isLiveTransactionsData(): Promise<boolean> {
  return isLiveSession();
}

/** Transaksi satu outlet; dengan `date` hanya yang dibayar hari itu. */
export async function getTransactionsForOutlet(outletId: string, date?: string): Promise<Transaction[]> {
  return date ? loadTransactions(outletId, date, nextDay(date)) : loadTransactions(outletId, null, null);
}

/** Transaksi yang dibayar dalam rentang [fromDate, toDateExcl). */
export async function getTransactionsForOutletInRange(outletId: string, fromDate: string, toDateExcl: string): Promise<Transaction[]> {
  return loadTransactions(outletId, fromDate, toDateExcl);
}
