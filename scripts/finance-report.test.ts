// Uji logika murni Laporan Keuangan (2026-10-15) — `npx tsx scripts/finance-report.test.ts`.
// Tanpa database: pemotongan periode harian/mingguan/bulanan dan agregasi angka.
import assert from "node:assert/strict";
import {
  bucketStart, shiftBucket, makeBucket, trendBuckets, parseFinanceParams, isIsoDate,
} from "@/lib/finance/periods";
import { totalsFor, revenueByMethod, deltaPct, type FinanceRows } from "@/lib/finance/aggregate";

type Result = { id: string; name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function t(id: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ id, name, ok: true });
  } catch (e) {
    results.push({ id, name, ok: false, detail: (e as Error).message });
  }
}

// ---------------------------------------------------------------- periode
t("P1", "Minggu = Senin: Kamis 15 Okt 2026 → Senin 12 Okt", () => assert.equal(bucketStart("week", "2026-10-15"), "2026-10-12"));
t("P2", "Minggu: hari Minggu 18 Okt ikut minggu Senin 12 Okt", () => assert.equal(bucketStart("week", "2026-10-18"), "2026-10-12"));
t("P3", "Minggu: Senin 19 Okt memulai minggu baru", () => assert.equal(bucketStart("week", "2026-10-19"), "2026-10-19"));
t("P4", "Bulan: 15 Okt → 1 Okt, akhir eksklusif 1 Nov", () => {
  const b = makeBucket("month", "2026-10-15");
  assert.equal(b.start, "2026-10-01");
  assert.equal(b.endExcl, "2026-11-01");
  assert.equal(b.long, "Oktober 2026");
});
t("P5", "Bulan Desember lompat tahun", () => assert.equal(shiftBucket("month", "2026-12-01", 1), "2027-01-01"));
t("P6", "Bulan mundur dari Januari", () => assert.equal(shiftBucket("month", "2027-01-01", -1), "2026-12-01"));
t("P7", "Hari: akhir bulan → 1 bulan berikut", () => assert.equal(makeBucket("day", "2026-10-31").endExcl, "2026-11-01"));
t("P8", "Label minggu lintas bulan", () => assert.equal(makeBucket("week", "2026-11-01").long, "26 Okt – 1 Nov 2026"));
t("P9", "Label minggu lintas tahun", () => assert.equal(makeBucket("week", "2027-01-01").long, "28 Des 2026 – 3 Jan 2027"));
t("P10", "Tren harian = 14 hari berakhir di tanggal terpilih", () => {
  const b = trendBuckets("day", "2026-10-15");
  assert.equal(b.length, 14);
  assert.equal(b[0].start, "2026-10-02");
  assert.equal(b[13].start, "2026-10-15");
});
t("P11", "Tren mingguan 12 minggu, berurutan tanpa celah", () => {
  const b = trendBuckets("week", "2026-10-15");
  assert.equal(b.length, 12);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].start, b[i - 1].endExcl);
});
t("P12", "Tren bulanan 12 bulan: Nov 2025 – Okt 2026", () => {
  const b = trendBuckets("month", "2026-10-15");
  assert.equal(b[0].start, "2025-11-01");
  assert.equal(b[11].start, "2026-10-01");
});
t("P13", "Februari kabisat 2028: 29 hari", () => assert.equal(makeBucket("month", "2028-02-10").endExcl, "2028-03-01"));
t("P14", "Parameter URL rusak → Harian, hari ini", () =>
  assert.deepEqual(parseFinanceParams({ g: "tahunan", d: "kemarin" }, "2026-10-15"), { gran: "day", date: "2026-10-15" }));
t("P15", "Tanggal masa depan dijepit ke hari ini", () =>
  assert.deepEqual(parseFinanceParams({ g: "week", d: "2027-01-01" }, "2026-10-15"), { gran: "week", date: "2026-10-15" }));
t("P16", "Tanggal mustahil 2026-02-30 ditolak", () => assert.equal(isIsoDate("2026-02-30"), false));
t("P17", "Fallback granularitas bisa diatur (owner = Bulanan)", () =>
  assert.equal(parseFinanceParams({}, "2026-10-15", "month").gran, "month"));

// ---------------------------------------------------------------- agregasi
const A = "outlet-a";
const B = "outlet-b";
const rows: FinanceRows = {
  tx: [
    { outletId: A, date: "2026-10-14", total: 300_000, method: "Cash" },
    { outletId: A, date: "2026-10-15", total: 200_000, method: "QRIS" },
    { outletId: B, date: "2026-10-15", total: 500_000, method: "Cash" },
    { outletId: B, date: "2026-10-16", total: 999_000, method: "Cash" }, // di luar rentang 15 Okt
  ],
  commissions: [
    { outletId: A, date: "2026-10-15", amount: 60_000, status: "APPROVED" },
    { outletId: B, date: "2026-10-15", amount: 150_000, status: "PENDING" },
    { outletId: B, date: "2026-10-15", amount: 40_000, status: "REVERSED" }, // tidak dihitung
  ],
  expenses: [
    { outletId: A, date: "2026-10-15", amount: 25_000, status: "APPROVED" },
    { outletId: A, date: "2026-10-15", amount: 70_000, status: "DRAFT" }, // tidak dihitung
    { outletId: B, date: "2026-10-15", amount: 10_000, status: "REJECTED" }, // tidak dihitung
    { outletId: B, date: "2026-10-15", amount: 15_000, status: "SUBMITTED" },
  ],
};
t("A1", "Konsolidasi 15 Okt: pendapatan 700rb, 2 transaksi", () => {
  const r = totalsFor(rows, "2026-10-15", "2026-10-16");
  assert.equal(r.revenue, 700_000);
  assert.equal(r.txCount, 2);
  assert.equal(r.avgTicket, 350_000);
});
t("A2", "Komisi REVERSED & pengeluaran DRAFT/REJECTED tidak dihitung", () => {
  const r = totalsFor(rows, "2026-10-15", "2026-10-16");
  assert.equal(r.commission, 210_000);
  assert.equal(r.expense, 40_000);
  assert.equal(r.net, 700_000 - 210_000 - 40_000);
});
t("A3", "Per cabang: jumlah cabang = konsolidasi", () => {
  const a = totalsFor(rows, "2026-10-15", "2026-10-16", A);
  const b = totalsFor(rows, "2026-10-15", "2026-10-16", B);
  const all = totalsFor(rows, "2026-10-15", "2026-10-16");
  assert.equal(a.revenue + b.revenue, all.revenue);
  assert.equal(a.net + b.net, all.net);
  assert.equal(a.net, 200_000 - 60_000 - 25_000);
});
t("A4", "Batas akhir eksklusif: transaksi 16 Okt tidak masuk 15 Okt", () =>
  assert.equal(totalsFor(rows, "2026-10-15", "2026-10-16", B).revenue, 500_000));
t("A5", "Mingguan 12–18 Okt memuat 14, 15, 16 Okt", () => assert.equal(totalsFor(rows, "2026-10-12", "2026-10-19").revenue, 1_999_000));
t("A6", "Metode bayar terurut terbesar", () =>
  assert.deepEqual(revenueByMethod(rows, "2026-10-15", "2026-10-16"), [
    { name: "Cash", value: 500_000 },
    { name: "QRIS", value: 200_000 },
  ]));
t("A7", "Rentang kosong → nol semua, rata-rata struk 0 (bukan NaN)", () => {
  const r = totalsFor(rows, "2026-09-01", "2026-10-01");
  assert.deepEqual(r, { revenue: 0, txCount: 0, avgTicket: 0, commission: 0, expense: 0, net: 0 });
});
t("A8", "Delta: pembanding nol → null (bukan ∞%)", () => {
  assert.equal(deltaPct(100, 0), null);
  assert.equal(deltaPct(150, 100), 50);
  assert.equal(deltaPct(-50, -100), 50);
});

for (const r of results) console.log(`${r.ok ? "L" : "G"}  ${r.id.padEnd(5)} ${r.name}${r.ok ? "" : `\n      → ${r.detail}`}`);
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} lolos`);
process.exit(fail ? 1 : 0);
