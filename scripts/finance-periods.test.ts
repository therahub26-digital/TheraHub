// Uji pembanding periode berjalan — `npx tsx scripts/finance-periods.test.ts`.
import assert from "node:assert/strict";
import { comparablePreviousEnd } from "@/lib/finance/periods";

const cases: [string, () => void][] = [
  ["P1 bulan berjalan 18 Okt → Sep dipotong ke 1–18", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2026-09-01", endExcl: "2026-10-01" }, { start: "2026-10-01", endExcl: "2026-11-01" }, "2026-10-18"), { endExcl: "2026-09-19", partial: true })],
  ["P2 bulan yang sudah lewat → Agustus penuh", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2026-08-01", endExcl: "2026-09-01" }, { start: "2026-09-01", endExcl: "2026-10-01" }, "2026-10-18"), { endExcl: "2026-09-01", partial: false })],
  ["P3 31 Maret vs Februari (28 hari) → Februari penuh, bukan lewat bulan", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2027-02-01", endExcl: "2027-03-01" }, { start: "2027-03-01", endExcl: "2027-04-01" }, "2027-03-31"), { endExcl: "2027-03-01", partial: false })],
  ["P4 hari ini (harian) → kemarin penuh", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2026-10-17", endExcl: "2026-10-18" }, { start: "2026-10-18", endExcl: "2026-10-19" }, "2026-10-18"), { endExcl: "2026-10-18", partial: false })],
  ["P5 minggu berjalan hari ke-3 → 3 hari minggu lalu", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2026-10-05", endExcl: "2026-10-12" }, { start: "2026-10-12", endExcl: "2026-10-19" }, "2026-10-14"), { endExcl: "2026-10-08", partial: true })],
  ["P6 hari pertama bulan → tanggal 1 bulan lalu saja", () =>
    assert.deepEqual(comparablePreviousEnd({ start: "2026-09-01", endExcl: "2026-10-01" }, { start: "2026-10-01", endExcl: "2026-11-01" }, "2026-10-01"), { endExcl: "2026-09-02", partial: true })],
];
let fail = 0;
for (const [name, run] of cases) {
  try { run(); console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "—", (e as Error).message); }
}
console.log(`\n${cases.length - fail}/${cases.length} lolos`);
if (fail) process.exit(1);
