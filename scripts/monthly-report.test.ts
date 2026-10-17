// Uji fungsi murni Laporan Bulanan — `npx tsx scripts/monthly-report.test.ts`.
import assert from "node:assert/strict";
import {
  calculatePerformanceScore,
  calculateRoomUtilization,
  percentageChange,
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

for (const result of results) {
  console.log(`${result.ok ? "L" : "G"}  ${result.id} ${result.name}${result.ok ? "" : `\n    → ${result.detail}`}`);
}
const failures = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failures}/${results.length} lulus`);
process.exit(failures ? 1 : 0);
