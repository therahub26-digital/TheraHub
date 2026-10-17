// Uji fungsi murni Tutup Kasir — `npx tsx scripts/cashier-shift.test.ts`.
import assert from "node:assert/strict";
import {
  cashVariance,
  expectedCash,
  nextShiftToOpen,
  shiftOpenAt,
  summarizeShiftSales,
  varianceNeedsNote,
} from "@/lib/cashier-shift-math";

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

test("S1", "Penjualan dipisah tunai vs non-tunai per metode", () => {
  const s = summarizeShiftSales([
    { total: 235620, paymentMethod: "Cash" },
    { total: 100000, paymentMethod: "QRIS" },
    { total: 50000, paymentMethod: "QRIS" },
    { total: 300000, paymentMethod: "Debit Card" },
  ]);
  assert.equal(s.transactionCount, 4);
  assert.equal(s.totalSales, 685620);
  assert.equal(s.cashSales, 235620);
  assert.deepEqual(s.nonCash, { "Debit Card": 300000, QRIS: 150000 });
  assert.deepEqual(Object.keys(s.nonCash), ["Debit Card", "QRIS"]);
});

test("S2", "Shift tanpa transaksi bernilai nol", () => {
  const s = summarizeShiftSales([]);
  assert.equal(s.transactionCount, 0);
  assert.equal(s.cashSales, 0);
  assert.deepEqual(s.nonCash, {});
});

test("S3", "Ekspektasi kas = modal + tunai; selisih bertanda", () => {
  const exp = expectedCash(500000, 235620);
  assert.equal(exp, 735620);
  assert.equal(cashVariance(735000, exp), -620);
  assert.equal(cashVariance(740000, exp), 4380);
  assert.equal(cashVariance(735620, exp), 0);
});

test("S4", "Setiap selisih ≠ 0 wajib alasan (termasuk Rp1 dan kas lebih)", () => {
  assert.equal(varianceNeedsNote(0), false);
  assert.equal(varianceNeedsNote(-1), true);
  assert.equal(varianceNeedsNote(1), true);
  assert.equal(varianceNeedsNote(-25000), true);
});

test("S5", "Outlet 1 shift: buka shift 1, lalu tidak bisa buka lagi setelah tutup", () => {
  assert.deepEqual(nextShiftToOpen(1, "2026-10-18", []), { ok: true, shiftNo: 1 });
  const r = nextShiftToOpen(1, "2026-10-18", [{ businessDate: "2026-10-18", shiftNo: 1, status: "CLOSED" }]);
  assert.equal(r.ok, false);
});

test("S6", "Outlet 2 shift: setelah shift 1 tutup, berikutnya shift 2", () => {
  const r = nextShiftToOpen(2, "2026-10-18", [{ businessDate: "2026-10-18", shiftNo: 1, status: "CLOSED" }]);
  assert.deepEqual(r, { ok: true, shiftNo: 2 });
  const full = nextShiftToOpen(2, "2026-10-18", [
    { businessDate: "2026-10-18", shiftNo: 1, status: "CLOSED" },
    { businessDate: "2026-10-18", shiftNo: 2, status: "CLOSED" },
  ]);
  assert.equal(full.ok, false);
});

test("S7", "Shift kemarin yang lupa ditutup memblokir shift hari ini", () => {
  const r = nextShiftToOpen(1, "2026-10-18", [{ businessDate: "2026-10-17", shiftNo: 1, status: "OPEN" }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /2026-10-17/);
});

test("S8", "Shift baru tidak dibuka di menit yang sama dengan tutup shift sebelumnya", () => {
  assert.equal(shiftOpenAt("2026-10-18T15:00:00+00:00", "2026-10-18T15:00:00+00:00"), "2026-10-18T15:01:00+00:00");
  assert.equal(shiftOpenAt("2026-10-18T15:05:00+00:00", "2026-10-18T15:00:00+00:00"), "2026-10-18T15:05:00+00:00");
  assert.equal(shiftOpenAt("2026-10-18T09:00:00+00:00", null), "2026-10-18T09:00:00+00:00");
});

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.id} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
if (failed) process.exit(1);
