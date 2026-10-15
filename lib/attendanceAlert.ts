// ---------------------------------------------------------------------
// Alert absensi menjelang jam masuk — logika murni, satu tempat.
//
// Permintaan Adjie (2026-10-15): "buatkan alert untuk karyawan dan
// therapis yang tidak ada keterangan cuti/sakit, tapi belum absen
// 5 menit sebelum waktunya. cukup di aplikasi android."
//
// Mengikuti §6.4 (no-cron): status ini MURNI fungsi waktu + data yang
// sudah ada (absensi hari ini, exception jadwal, pengajuan keterangan)
// — dihitung ulang setiap kali halaman dibuka, tidak pernah ditulis ke
// database. Tidak ada push eksternal (keputusan 2026-08-21: alert
// terapis in-app saja); "aplikasi android" di sini = PWA terapis yang
// terpasang di layar utama.
//
// Modul ini sengaja TANPA import server-only (pelajaran §6.7 /
// OutletSettingsEditor): dipakai Server Component (halaman terapis,
// ScheduleCheckPage manager/kasir) dan bisa saja suatu saat dipakai
// Client Component — murni string/angka.
// ---------------------------------------------------------------------

/** Berapa menit sebelum jam masuk alert mulai menyala. */
export const ATTENDANCE_ALERT_LEAD_MIN = 5;

export type AttendanceAlertState =
  | { kind: "none" }
  /** Jendela T−5 menit sampai tepat jam masuk: "sebentar lagi jam masuk, belum absen". */
  | { kind: "due"; workStart: string }
  /** Sudah lewat jam masuk dan tetap belum absen tanpa keterangan. */
  | { kind: "late"; workStart: string; minutesLate: number };

/** "HH:mm" -> menit sejak 00:00. NaN-safe: format tak dikenal dianggap tidak valid (-1). */
function hhmmToMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Hitung status alert untuk SATU orang pada SATU hari.
 *
 * `hasExcuse` harus sudah mencakup semua bentuk keterangan yang sah:
 * exception jadwal hari ini (OFF/LEAVE yang sudah berlaku), ATAU
 * pengajuan keterangan hari ini berstatus PENDING/APPROVED (Cuti/Sakit,
 * Libur, maupun Ijin Masuk Siang). PENDING ikut menekan alert dengan
 * sengaja: orang yang sudah mengirim keterangan dan sedang menunggu ACC
 * manager tidak perlu terus diteriaki — kalau managernya me-REJECT,
 * alert menyala lagi dengan sendirinya pada pembukaan halaman berikutnya.
 */
export function computeAttendanceAlert(input: {
  /** Jam sekarang "HH:mm" (frame wallclock aplikasi — getEffectiveNow()). */
  now: string;
  /** Jam masuk outlet "HH:mm" (outlets.work_start_time, default 10:00). */
  workStart: string;
  /** Sudah check-in hari ini? */
  checkedIn: boolean;
  /** Ada keterangan sah hari ini? (lihat doc di atas) */
  hasExcuse: boolean;
}): AttendanceAlertState {
  if (input.checkedIn || input.hasExcuse) return { kind: "none" };
  const nowMin = hhmmToMin(input.now);
  const startMin = hhmmToMin(input.workStart);
  if (nowMin < 0 || startMin < 0) return { kind: "none" };
  if (nowMin < startMin - ATTENDANCE_ALERT_LEAD_MIN) return { kind: "none" };
  if (nowMin < startMin) return { kind: "due", workStart: input.workStart };
  return { kind: "late", workStart: input.workStart, minutesLate: nowMin - startMin };
}
