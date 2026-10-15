// ---------------------------------------------------------------------
// Agregasi laporan keuangan — fungsi murni (diuji tanpa DB).
//
// Definisi angka SAMA dengan /manager/reports supaya dua halaman tidak
// pernah berselisih untuk periode yang sama:
//   Pendapatan  = transaksi status PAID (VOID/REFUNDED/PARTIALLY_PAID
//                 tidak dihitung), menurut tanggal bayar (WIB).
//   Komisi      = commission_entries selain REVERSED, menurut tanggalnya.
//   Pengeluaran = expenses selain REJECTED & DRAFT, menurut tanggalnya.
//   Sisa kas    = pendapatan − komisi − pengeluaran. BUKAN laba-rugi:
//                 harga modal produk & payroll tidak ikut (alasan di
//                 header app/manager/reports/page.tsx).
// ---------------------------------------------------------------------

export type FinTx = { outletId: string; date: string; total: number; method: string };
export type FinCommission = { outletId: string; date: string; amount: number; status: string };
export type FinExpense = { outletId: string; date: string; amount: number; status: string };

export type FinanceRows = { tx: FinTx[]; commissions: FinCommission[]; expenses: FinExpense[] };

export type FinanceTotals = {
  revenue: number;
  txCount: number;
  avgTicket: number;
  commission: number;
  expense: number;
  net: number;
};

export function countsAsCommission(status: string): boolean {
  return status !== "REVERSED";
}
export function countsAsExpense(status: string): boolean {
  return status !== "REJECTED" && status !== "DRAFT";
}

function inRange(date: string, start: string, endExcl: string): boolean {
  return date >= start && date < endExcl;
}

/** Total untuk rentang [start, endExcl), opsional dibatasi satu outlet. */
export function totalsFor(rows: FinanceRows, start: string, endExcl: string, outletId?: string): FinanceTotals {
  const okOutlet = (id: string) => !outletId || id === outletId;
  let revenue = 0;
  let txCount = 0;
  for (const t of rows.tx) {
    if (okOutlet(t.outletId) && inRange(t.date, start, endExcl)) {
      revenue += t.total;
      txCount += 1;
    }
  }
  let commission = 0;
  for (const c of rows.commissions) {
    if (okOutlet(c.outletId) && inRange(c.date, start, endExcl) && countsAsCommission(c.status)) commission += c.amount;
  }
  let expense = 0;
  for (const e of rows.expenses) {
    if (okOutlet(e.outletId) && inRange(e.date, start, endExcl) && countsAsExpense(e.status)) expense += e.amount;
  }
  return {
    revenue,
    txCount,
    avgTicket: txCount > 0 ? revenue / txCount : 0,
    commission,
    expense,
    net: revenue - commission - expense,
  };
}

/** Pendapatan per metode bayar dalam rentang, terbesar dulu. */
export function revenueByMethod(rows: FinanceRows, start: string, endExcl: string, outletId?: string): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of rows.tx) {
    if ((!outletId || t.outletId === outletId) && inRange(t.date, start, endExcl)) {
      map.set(t.method, (map.get(t.method) ?? 0) + t.total);
    }
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Perubahan relatif dalam persen; null bila pembanding nol (tidak bisa dihitung, bukan "∞%"). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function hasAnyData(t: FinanceTotals): boolean {
  return t.txCount > 0 || t.commission !== 0 || t.expense !== 0;
}
