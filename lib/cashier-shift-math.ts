// Fungsi murni Tutup Kasir (shift kasir) — tanpa Supabase, supaya bisa diuji
// dengan `npx tsx scripts/cashier-shift.test.ts` dan dipakai server maupun
// komponen klien.

export type ShiftTx = { total: number; paymentMethod: string };

export type ShiftSalesSummary = {
  transactionCount: number;
  totalSales: number;
  cashSales: number;
  /** Semua metode selain Cash, diurutkan dari nominal terbesar. */
  nonCash: Record<string, number>;
};

export type ShiftRef = { businessDate: string; shiftNo: number; status: "OPEN" | "CLOSED" };

const round = (n: number) => Math.round(n * 100) / 100;

export function summarizeShiftSales(txs: ShiftTx[]): ShiftSalesSummary {
  let cash = 0;
  let total = 0;
  const nonCash: Record<string, number> = {};
  for (const tx of txs) {
    const amount = Number(tx.total) || 0;
    total += amount;
    if (tx.paymentMethod === "Cash") cash += amount;
    else nonCash[tx.paymentMethod] = (nonCash[tx.paymentMethod] ?? 0) + amount;
  }
  const sorted = Object.fromEntries(
    Object.entries(nonCash)
      .map(([k, v]) => [k, round(v)] as const)
      .sort((a, b) => b[1] - a[1])
  );
  return { transactionCount: txs.length, totalSales: round(total), cashSales: round(cash), nonCash: sorted };
}

/** Kas yang seharusnya ada di laci = modal awal + penjualan tunai. */
export function expectedCash(openingFloat: number, cashSales: number): number {
  return round(openingFloat + cashSales);
}

/** Positif = kas lebih, negatif = kas kurang. */
export function cashVariance(counted: number, expected: number): number {
  return round(counted - expected);
}

/** Keputusan 18 Okt 2026: SETIAP selisih ≠ 0 wajib beralasan. */
export function varianceNeedsNote(variance: number): boolean {
  return Math.abs(variance) >= 0.005;
}

/**
 * Shift berikutnya yang boleh dibuka hari ini, atau alasan kenapa tidak.
 * - Masih ada shift terbuka (hari apa pun) → tutup dulu.
 * - Semua jatah shift hari ini sudah dipakai → tidak bisa buka lagi.
 */
export function nextShiftToOpen(
  shiftsPerDay: number,
  today: string,
  shifts: ShiftRef[]
): { ok: true; shiftNo: number } | { ok: false; reason: string } {
  const open = shifts.find((s) => s.status === "OPEN");
  if (open) {
    return {
      ok: false,
      reason:
        open.businessDate === today
          ? `Shift ${open.shiftNo} hari ini masih terbuka — tutup dulu sebelum membuka shift baru.`
          : `Shift ${open.shiftNo} tanggal ${open.businessDate} belum ditutup — tutup dulu sebelum membuka shift hari ini.`,
    };
  }
  const max = shiftsPerDay === 2 ? 2 : 1;
  const usedToday = shifts.filter((s) => s.businessDate === today).map((s) => s.shiftNo);
  for (let n = 1; n <= max; n++) {
    if (!usedToday.includes(n)) return { ok: true, shiftNo: n };
  }
  return {
    ok: false,
    reason: max === 1 ? "Shift hari ini sudah ditutup." : "Kedua shift hari ini sudah ditutup.",
  };
}

/**
 * Waktu buka shift baru. Transaksi menyimpan paid_at per menit, jadi shift
 * baru yang dibuka di menit yang sama dengan tutup shift sebelumnya akan
 * ikut menghitung transaksi menit itu dua kali. Digeser 1 menit setelah
 * tutup shift terakhir bila perlu.
 */
export function shiftOpenAt(nowIso: string, lastClosedAt: string | null): string {
  if (!lastClosedAt) return nowIso;
  const now = Date.parse(nowIso);
  const minNext = Date.parse(lastClosedAt) + 60_000;
  if (now >= minNext) return nowIso;
  return new Date(minNext).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
