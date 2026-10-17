// Uji fungsi murni Laporan Bulanan — `npx tsx scripts/monthly-report.test.ts`.
import assert from "node:assert/strict";
import {
  assessConsumableUsage,
  buildWeeklyCashflow,
  buildWeeklyUsage,
  calculatePerformanceScore,
  calculateOperatingProfit,
  calculateRoomUtilization,
  calculateSalaryAllowanceCost,
  getCommissionTotalForPeriod,
  percentagePointChange,
  percentageChange,
  summarizeRevenueItems,
  withOptionalProfit,
} from "@/lib/data/monthly-report-math";

type Result = { id: string; name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function test(id: string, name: string, run: () => void) {
  try {
    run();
    results.push({ id, name, ok: true });
  } catch (error) {
    results.push({ id, name, ok: false, detail: (error as Error).message });
  }
}

test("M1", "Skor memakai customer, rating, absensi, dan ketepatan waktu berbobot", () => {
  assert.equal(calculatePerformanceScore({
    customerCount: 10,
    maximumCustomerCount: 20,
    customerRating: 4,
    attendancePct: 90,
    lateCount: 1,
    expectedDays: 10,
  }), 72);
});

test("M2", "Jumlah customer berkontribusi paling besar pada skor", () => {
  const base = {
    maximumCustomerCount: 20,
    customerRating: 4,
    attendancePct: 90,
    lateCount: 0,
    expectedDays: 10,
  };
  const lowerVolume = calculatePerformanceScore({ ...base, customerCount: 5 });
  const higherVolume = calculatePerformanceScore({ ...base, customerCount: 15 });
  assert.ok(lowerVolume !== null && higherVolume !== null && higherVolume - lowerVolume >= 20);
});

test("M3", "Skor mengabaikan dimensi yang belum memiliki data", () => {
  assert.equal(calculatePerformanceScore({
    customerCount: 0,
    maximumCustomerCount: 0,
    customerRating: null,
    attendancePct: null,
    lateCount: 0,
    expectedDays: 0,
  }), null);
});

test("M4", "Perubahan vs pembanding menghitung persen dan baseline nol tidak terdefinisi", () => {
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(75, 100), -25);
  assert.equal(percentageChange(50, 0), null);
});

test("M5", "Utilisasi room memakai kapasitas jam operasional × hari × jumlah room", () => {
  assert.equal(calculateRoomUtilization(600, 10, 20, 2), 2.5);
  assert.equal(calculateRoomUtilization(600, null, 20, 2), null);
  assert.equal(calculateRoomUtilization(600, 10, 20, 0), null);
});

test("M6", "Profit benar-benar tidak ada saat includeProfit false", () => {
  const withoutProfit = withOptionalProfit({ summary: { revenue: 100 } }, false, () => 25);
  assert.equal("profit" in withoutProfit, false);

  const withProfit = withOptionalProfit({ summary: { revenue: 100 } }, true, () => 25);
  assert.equal("profit" in withProfit ? withProfit.profit : undefined, 25);
});

test("M7", "Biaya gaji dan tunjangan tidak menghitung komisi, bonus, atau take-home", () => {
  const salaryAndAllowance = calculateSalaryAllowanceCost(5_000_000, 500_000, 250_000);
  const commission = 1_250_000;
  assert.equal(salaryAndAllowance, 5_250_000);
  assert.equal(calculateOperatingProfit(20_000_000, commission, salaryAndAllowance, 2_000_000, 500_000), 11_000_000);
});

test("M8", "Komisi Oktober tidak memuat entri September dan payroll tersimpan menjadi sumber utama", () => {
  const entries = [
    { outletId: "dago", date: "2026-09-29", amount: 8_470_000, status: "PENDING" },
    { outletId: "dago", date: "2026-10-05", amount: 2_000_000, status: "PENDING" },
    { outletId: "dago", date: "2026-10-12", amount: 2_070_000, status: "PAID" },
  ];
  assert.equal(getCommissionTotalForPeriod("dago", "2026-10", [], entries), 4_070_000);
  assert.equal(
    getCommissionTotalForPeriod("dago", "2026-10", [{ outletId: "dago", period: "2026-10", variable: 4_070_000 }], entries),
    4_070_000
  );
});

test("M9", "Perubahan rasio dihitung sebagai poin persentase, bukan persen relatif", () => {
  assert.equal(percentagePointChange(78.7, 15.5), 63.2);
});

test("M10", "Pendapatan dipecah per jenis; makanan & minuman jadi satu pos F&B", () => {
  const { byCategory } = summarizeRevenueItems([
    { transactionId: "t1", itemType: "SERVICE", name: "Massage 90'", quantity: 1, amount: 180_000 },
    { transactionId: "t1", itemType: "BEVERAGE", name: "Kopi Hitam", quantity: 2, amount: 24_000 },
    { transactionId: "t2", itemType: "SERVICE", name: "Massage 90'", quantity: 1, amount: 180_000 },
    { transactionId: "t2", itemType: "FOOD", name: "Kurma 5 Butir", quantity: 1, amount: 12_000 },
    { transactionId: "t2", itemType: "ADD_ON", name: "Hot Stone", quantity: 1, amount: 50_000 },
  ], 2, new Map());
  const amountOf = (key: string) => byCategory.find((row) => row.key === key)?.amount;
  assert.equal(amountOf("SERVICE"), 360_000);
  assert.equal(amountOf("FNB"), 36_000);
  assert.equal(amountOf("ADD_ON"), 50_000);
  assert.equal(amountOf("PRODUCT"), 0);
});

test("M11", "F&B: tingkat pembelian per transaksi dan laba kotor memakai harga pokok; tanpa harga pokok = kosong, bukan nol", () => {
  const { fnb } = summarizeRevenueItems([
    { transactionId: "t1", itemType: "BEVERAGE", name: "Kopi Hitam", quantity: 2, amount: 24_000 },
    { transactionId: "t3", itemType: "BEVERAGE", name: "Jamu Racik", quantity: 1, amount: 15_000 },
  ], 4, new Map([["Kopi Hitam", 3_000]]));
  assert.equal(fnb.attachPct, 50);
  assert.equal(fnb.averagePerTransaction, 9_750);
  assert.equal(fnb.items.find((row) => row.name === "Kopi Hitam")?.grossProfit, 18_000);
  assert.equal(fnb.items.find((row) => row.name === "Jamu Racik")?.grossProfit, null);
});

test("M12", "Estimasi laba mengurangi HPP produk terjual", () => {
  assert.equal(calculateOperatingProfit(20_000_000, 1_250_000, 5_250_000, 2_000_000, 500_000, 300_000), 10_700_000);
});

test("M13", "Arus mingguan: tgl 1–7, 8–14, …, 29–30; kontribusi kumulatif = pendapatan − biaya variabel", () => {
  const weeks = buildWeeklyCashflow("2026-09-01", 30, [
    { date: "2026-09-02", amount: 1_000_000 },
    { date: "2026-09-09", amount: 2_000_000 },
    { date: "2026-09-30", amount: 500_000 },
  ], [
    { date: "2026-09-03", kind: "commission", amount: 300_000 },
    { date: "2026-09-10", kind: "expenses", amount: 2_500_000 },
    { date: "2026-09-30", kind: "materials", amount: 100_000 },
  ]);
  assert.deepEqual(weeks.map((row) => row.label), ["1–7", "8–14", "15–21", "22–28", "29–30"]);
  assert.equal(weeks[0].contribution, 700_000);
  assert.equal(weeks[1].contribution, -500_000);
  assert.equal(weeks[1].cumulativeContribution, 200_000);
  assert.equal(weeks[4].cumulativeContribution, 600_000);
});

test("M14", "Pemakaian bahan: 1 botol ≈ 20 tamu, 150 tamu → perkiraan 7,5 botol; ±20% wajar", () => {
  assert.equal(assessConsumableUsage(8, 150, 20).status, "WAJAR");
  assert.equal(assessConsumableUsage(8, 150, 20).expectedUnits, 7.5);
  assert.equal(assessConsumableUsage(10, 150, 20).status, "BOROS");
  assert.equal(assessConsumableUsage(5, 150, 20).status, "HEMAT");
  assert.equal(assessConsumableUsage(3, 150, null).status, "TANPA_TAKARAN");
});

test("M15", "Tamu vs biaya bahan per minggu dan biaya per tamu", () => {
  const rows = buildWeeklyUsage("2026-09-01", 30, ["2026-09-02", "2026-09-03", "2026-09-10"], [
    { date: "2026-09-02", amount: 35_000 },
    { date: "2026-09-29", amount: 18_000 },
  ]);
  assert.equal(rows[0].visits, 2);
  assert.equal(rows[0].costPerVisit, 17_500);
  assert.equal(rows[1].materialCost, 0);
  assert.equal(rows[4].costPerVisit, null);
});

test("M16", "Kasir mencatat F&B sebagai PRODUCT: digolongkan F&B lewat kategori katalog", () => {
  const { byCategory, fnb } = summarizeRevenueItems([
    { transactionId: "t1", itemType: "PRODUCT", name: "Kopi Hitam", quantity: 1, amount: 12_000 },
    { transactionId: "t1", itemType: "PRODUCT", name: "Lulur Rempah 250g", quantity: 1, amount: 85_000 },
  ], 1, new Map([["Kopi Hitam", 3_000]]), new Map([["Kopi Hitam", "Food & Beverage"], ["Lulur Rempah 250g", "Retail Product"]]));
  assert.equal(byCategory.find((row) => row.key === "FNB")?.amount, 12_000);
  assert.equal(byCategory.find((row) => row.key === "PRODUCT")?.amount, 85_000);
  assert.equal(fnb.items[0].grossProfit, 9_000);
});

for (const result of results) {
  console.log(`${result.ok ? "L" : "G"}  ${result.id} ${result.name}${result.ok ? "" : `\n    → ${result.detail}`}`);
}
const failures = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failures}/${results.length} lulus`);
process.exit(failures ? 1 : 0);
