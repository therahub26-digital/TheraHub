// Uji fungsi murni reminder. Jalankan: npx tsx scripts/test-reminders.ts
import assert from "node:assert/strict";
import { canClaim, customerMessage, normalizePhone, reminderWindow, therapistMessage } from "../lib/reminders";
import { nowIso, plusMinutes } from "../lib/wallclock";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name); };

// R8/R9 — nomor
t("0812-3456-7890 -> 6281234567890", () => assert.equal(normalizePhone("0812-3456-7890"), "6281234567890"));
t("+62 812 3456 7890", () => assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890"));
t("6281234567890 tetap", () => assert.equal(normalizePhone("6281234567890"), "6281234567890"));
t("812... tanpa nol", () => assert.equal(normalizePhone("81234567890"), "6281234567890"));
t("12345 ditolak", () => assert.equal(normalizePhone("12345"), null));
t("telepon rumah 022 ditolak", () => assert.equal(normalizePhone("022-1234567"), null));
t("kosong/null ditolak", () => { assert.equal(normalizePhone(""), null); assert.equal(normalizePhone(null), null); });

// R1/R6/R7 — jendela (booking 14:00)
const start = "2026-10-06T14:00:00+00:00";
const inWin = (nowWall: string) => { const w = reminderWindow(nowWall); return start >= w.from && start <= w.to; };
t("13:46 dalam jendela", () => assert.equal(inWin("2026-10-06T13:46:00+00:00"), true));
t("13:45 dalam jendela (batas atas)", () => assert.equal(inWin("2026-10-06T13:45:00+00:00"), true));
t("13:52 dalam jendela (sisa 8 mnt)", () => assert.equal(inWin("2026-10-06T13:52:00+00:00"), true));
t("13:55 dalam jendela (batas bawah)", () => assert.equal(inWin("2026-10-06T13:55:00+00:00"), true));
t("13:57 di luar jendela (sisa 3 mnt)", () => assert.equal(inWin("2026-10-06T13:57:00+00:00"), false));
t("13:44 belum (sisa 16 mnt)", () => assert.equal(inWin("2026-10-06T13:44:00+00:00"), false));
// R13 — lewat tengah malam
t("booking 00:10 diingatkan pada 23:58 hari sebelumnya", () => {
  const w = reminderWindow("2026-10-06T23:58:00+00:00");
  const s = "2026-10-07T00:10:00+00:00";
  assert.equal(s >= w.from && s <= w.to, true);
});
t("nowIso() sebangun dengan format basis data", () => assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+00:00$/));
t("plusMinutes lintas hari", () => assert.equal(plusMinutes("2026-10-06T23:58:00+00:00", 15), "2026-10-07T00:13:00+00:00"));

// R2/R10 — klaim
const now = Date.now();
t("belum ada baris: boleh", () => assert.equal(canClaim(null, now), true));
t("SENT final", () => assert.equal(canClaim({ status: "SENT", attempts: 1, created_at: new Date(now).toISOString() }, now), false));
t("SKIPPED final", () => assert.equal(canClaim({ status: "SKIPPED", attempts: 0, created_at: new Date(now).toISOString() }, now), false));
t("FAILED percobaan 1: ulang", () => assert.equal(canClaim({ status: "FAILED", attempts: 1, created_at: new Date(now).toISOString() }, now), true));
t("FAILED percobaan 2: berhenti", () => assert.equal(canClaim({ status: "FAILED", attempts: 2, created_at: new Date(now).toISOString() }, now), false));
t("PENDING baru: jangan diganggu", () => assert.equal(canClaim({ status: "PENDING", attempts: 1, created_at: new Date(now - 30_000).toISOString() }, now), false));
t("PENDING macet >3 mnt: boleh", () => assert.equal(canClaim({ status: "PENDING", attempts: 1, created_at: new Date(now - 4 * 60_000).toISOString() }, now), true));

// Isi pesan
const ctx = { brand: "Amethyst", outletName: "Cikawao", outletPhone: "0812 3456 7890", customerName: "Budi", therapistName: "Sari", packageName: "Traditional Massage 90", durationMin: 90, scheduledStart: start };
t("pesan tamu memuat jam 14:00 dan terapis", () => { const m = customerMessage(ctx); assert.match(m, /pukul 14:00/); assert.match(m, /bersama Sari/); assert.match(m, /hubungi 0812 3456 7890/); });
t("pesan tamu tanpa kontak outlet: kalimat 'berhalangan' hilang", () => assert.doesNotMatch(customerMessage({ ...ctx, outletPhone: null }), /berhalangan/));
t("pesan tamu tidak menyisakan spasi ganda", () => assert.doesNotMatch(customerMessage(ctx), /  /));
t("pesan terapis memuat tamu, jam, durasi", () => { const m = therapistMessage(ctx); assert.match(m, /Budi pukul 14:00/); assert.match(m, /90 menit/); });

console.log(`\n${n} uji lulus`);
