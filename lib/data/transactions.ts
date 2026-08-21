import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TRANSACTIONS as MOCK_TRANSACTIONS } from "@/lib/mock/commerce";
import type { Transaction, TransactionItem } from "@/lib/types";

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

async function fetchLiveTransactions(): Promise<Transaction[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo/"Ganti Role" viewer -> mock, same as bookings/sessions.

  const { data: rows, error } = await supabase.from("transactions").select("*").order("paid_at", { ascending: false });
  if (error) return null;
  if (!rows || rows.length === 0) return [];

  const txRows = rows as TransactionRow[];
  const bookingIds = [...new Set(txRows.map((t) => t.booking_id).filter((v): v is string => !!v))];
  const customerIds = [...new Set(txRows.map((t) => t.customer_id).filter((v): v is string => !!v))];
  const cashierIds = [...new Set(txRows.map((t) => t.cashier_id).filter((v): v is string => !!v))];
  const txIds = txRows.map((t) => t.id);

  const [{ data: bookingRows }, { data: customerRows }, { data: cashierRows }, { data: itemRows }] = await Promise.all([
    bookingIds.length ? supabase.from("bookings").select("id, code").in("id", bookingIds) : Promise.resolve({ data: [] }),
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : Promise.resolve({ data: [] }),
    cashierIds.length ? supabase.from("employees").select("id, name").in("id", cashierIds) : Promise.resolve({ data: [] }),
    txIds.length ? supabase.from("transaction_items").select("*").in("transaction_id", txIds) : Promise.resolve({ data: [] }),
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

const loadTransactionsData = cache(async () => {
  const live = await fetchLiveTransactions();
  // `!== null`, not truthy — same landmine as bookings.ts/sessions.ts.
  if (live !== null) return { transactions: live, live: true };
  return { transactions: MOCK_TRANSACTIONS, live: false };
});

export async function isLiveTransactionsData(): Promise<boolean> {
  return (await loadTransactionsData()).live;
}

export async function getTransactionsForOutlet(outletId: string, date?: string): Promise<Transaction[]> {
  const { transactions } = await loadTransactionsData();
  return transactions.filter((t) => t.outletId === outletId && (!date || t.paidAt.slice(0, 10) === date));
}
