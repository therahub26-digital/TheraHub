// UAT logika murni 2026-10-15 — dijalankan dengan `npx tsx _uat/logic.test.ts`.
// Tanpa database; menguji fungsi yang menentukan perilaku alert absensi,
// jendela bulan rekap kinerja, dan urutan tabel kinerja.
import assert from "node:assert/strict";
import { computeAttendanceAlert, ATTENDANCE_ALERT_LEAD_MIN } from "@/lib/attendanceAlert";
import { monthWindow } from "@/lib/data/performance";
import { sortPerformanceRows } from "@/components/TherapistPerformanceTable";
import type { TherapistPerformanceRow } from "@/lib/data/performance";

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

// ---------------------------------------------------------------- alert
const base = { workStart: "10:00", checkedIn: false, hasExcuse: false };
t("AL1", "Lead time = 5 menit", () => assert.equal(ATTENDANCE_ALERT_LEAD_MIN, 5));
t("AL2", "09:54 (T−6) → tidak ada alert", () => assert.equal(computeAttendanceAlert({ ...base, now: "09:54" }).kind, "none"));
t("AL3", "09:55 (tepat T−5) → due", () => assert.deepEqual(computeAttendanceAlert({ ...base, now: "09:55" }), { kind: "due", workStart: "10:00" }));
t("AL4", "09:59 → due", () => assert.equal(computeAttendanceAlert({ ...base, now: "09:59" }).kind, "due"));
t("AL5", "10:00 tepat → late 0 menit", () => assert.deepEqual(computeAttendanceAlert({ ...base, now: "10:00" }), { kind: "late", workStart: "10:00", minutesLate: 0 }));
t("AL6", "10:37 → late 37 menit", () => {
  const r = computeAttendanceAlert({ ...base, now: "10:37" });
  assert.equal(r.kind, "late");
  assert.equal(r.kind === "late" && r.minutesLate, 37);
});
t("AL7", "Sudah check-in → none walau telat", () => assert.equal(computeAttendanceAlert({ ...base, now: "11:00", checkedIn: true }).kind, "none"));
t("AL8", "Ada keterangan → none walau telat", () => assert.equal(computeAttendanceAlert({ ...base, now: "11:00", hasExcuse: true }).kind, "none"));
t("AL9", "Jam masuk custom 14:30, now 14:25 → due", () => assert.equal(computeAttendanceAlert({ ...base, workStart: "14:30", now: "14:25" }).kind, "due"));
t("AL10", "Jam masuk 00:03, now 23:59 hari yang sama → late (jam masuk hari itu sudah lewat; jendela T−5 tidak menyeberang ke hari sebelumnya)", () =>
  assert.equal(computeAttendanceAlert({ ...base, workStart: "00:03", now: "23:59" }).kind, "late")
);
t("AL11", "Format jam rusak → none, tidak crash", () => {
  assert.equal(computeAttendanceAlert({ ...base, workStart: "jam10", now: "10:30" }).kind, "none");
  assert.equal(computeAttendanceAlert({ ...base, workStart: "10:00", now: "" }).kind, "none");
});
t("AL12", "Jam satu digit '9:00' tetap diparse", () => assert.equal(computeAttendanceAlert({ ...base, workStart: "9:00", now: "08:56" }).kind, "due"));

// ---------------------------------------------------------- monthWindow
t("MW1", "Oktober 2026 → 31 hari, batas 2026-11-01", () => assert.deepEqual(monthWindow("2026-10"), { start: "2026-10-01", endExcl: "2026-11-01", days: 31 }));
t("MW2", "Desember → lompat tahun", () => assert.deepEqual(monthWindow("2026-12"), { start: "2026-12-01", endExcl: "2027-01-01", days: 31 }));
t("MW3", "Februari 2028 kabisat → 29 hari", () => assert.equal(monthWindow("2028-02").days, 29));
t("MW4", "Februari 2027 → 28 hari", () => assert.equal(monthWindow("2027-02").days, 28));
t("MW5", "September → 30 hari", () => assert.equal(monthWindow("2026-09").days, 30));

// ------------------------------------------------------------- sorting
function row(p: Partial<TherapistPerformanceRow> & { name: string }): TherapistPerformanceRow {
  return {
    id: p.name, code: "X", avatarTone: "teal", photoUrl: null,
    guests: 0, presentDays: 0, lateCount: 0, lateMinutesTotal: 0, expectedDays: 0, attendancePct: null,
    leaveSick: 0, leaveOff: 0, leaveLate: 0, customerAvg: null, customerCount: 0, management: null,
    ...p,
  };
}
const rows = [
  row({ name: "Citra", guests: 12, attendancePct: 80, customerAvg: 4.5, management: { rating: 3, note: null }, lateCount: 2, lateMinutesTotal: 30, leaveSick: 1 }),
  row({ name: "Laras", guests: 20, attendancePct: 100, customerAvg: null, management: null }),
  row({ name: "Nadia", guests: 12, attendancePct: 60, customerAvg: 4.9, management: { rating: 5, note: "Top" }, lateCount: 1, lateMinutesTotal: 90, leaveOff: 2, leaveLate: 1 }),
  row({ name: "Ratih", guests: 3, attendancePct: null, customerAvg: 3.0, management: null }),
];
const names = (r: TherapistPerformanceRow[]) => r.map((x) => x.name).join(",");
t("SO1", "Default tamu ↓; seri 12 dipecah nama", () => assert.equal(names(sortPerformanceRows(rows, "guests", false)), "Laras,Citra,Nadia,Ratih"));
t("SO2", "Tamu ↑", () => assert.equal(names(sortPerformanceRows(rows, "guests", true)), "Ratih,Citra,Nadia,Laras"));
t("SO3", "Kehadiran ↓, null (Ratih) di bawah", () => assert.equal(names(sortPerformanceRows(rows, "attendance", false)), "Laras,Citra,Nadia,Ratih"));
t("SO4", "Kehadiran ↑, null TETAP di bawah", () => assert.equal(names(sortPerformanceRows(rows, "attendance", true)), "Nadia,Citra,Laras,Ratih"));
t("SO5", "Penilaian customer ↓, yang belum dinilai di bawah", () => assert.equal(names(sortPerformanceRows(rows, "customer", false)), "Nadia,Citra,Ratih,Laras"));
t("SO6", "Penilaian manajemen ↓, null di bawah urut nama", () => assert.equal(names(sortPerformanceRows(rows, "management", false)), "Nadia,Citra,Laras,Ratih"));
t("SO7", "Terlambat ↓ menurut total menit", () => assert.equal(names(sortPerformanceRows(rows, "late", false)), "Nadia,Citra,Laras,Ratih"));
t("SO8", "Ijin ↓ (jumlah semua jenis)", () => assert.equal(names(sortPerformanceRows(rows, "leave", false)), "Nadia,Citra,Laras,Ratih"));
t("SO9", "Nama ↑", () => assert.equal(names(sortPerformanceRows(rows, "name", true)), "Citra,Laras,Nadia,Ratih"));
t("SO10", "Tidak memutasi array asli", () => {
  const before = names(rows);
  sortPerformanceRows(rows, "guests", true);
  assert.equal(names(rows), before);
});

// ------------------------------------------------------------- laporan
for (const r of results) console.log(`${r.ok ? "L" : "G"}  ${r.id.padEnd(5)} ${r.name}${r.ok ? "" : `\n      → ${r.detail}`}`);
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} lolos`);
process.exit(fail ? 1 : 0);
