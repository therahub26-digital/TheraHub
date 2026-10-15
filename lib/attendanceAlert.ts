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
  /**
   * Jam pulang outlet "HH:mm" (outlets.work_end_time, default 22:00).
   * TEMUAN UAT 2026-10-15 (F5): tanpa batas ini alert tidak pernah
   * tutup — pukul 21:54 semua terapis masih merah "lewat 714 mnt", dan
   * setelah jam pulang angkanya terus bertambah. Mulai jam pulang alert
   * berhenti (hari kerja sudah usai; tidak ada yang bisa diperbaiki
   * lagi dengan absen). Opsional supaya pemanggil lama tetap jalan.
   * Shift lintas tengah malam (pulang ≤ masuk, mis. 14:00–02:00):
   * jendela berlaku dari T−5 sampai 23:59 hari itu; bagian dini hari
   * sesudah tengah malam milik tanggal berikutnya dan tidak dialarmkan.
   */
  workEnd?: string;
  /** Sudah check-in hari ini? */
  checkedIn: boolean;
  /** Ada keterangan sah hari ini? (lihat doc di atas) */
  hasExcuse: boolean;
}): AttendanceAlertState {
  if (input.checkedIn || input.hasExcuse) return { kind: "none" };
  const nowMin = hhmmToMin(input.now);
  const startMin = hhmmToMin(input.workStart);
  if (nowMin < 0 || startMin < 0) return { kind: "none" };
  const endMin = input.workEnd ? hhmmToMin(input.workEnd) : -1;
  if (endMin > startMin && nowMin >= endMin) return { kind: "none" };
  if (nowMin < startMin - ATTENDANCE_ALERT_LEAD_MIN) return { kind: "none" };
  if (nowMin < startMin) return { kind: "due", workStart: input.workStart };
  return { kind: "late", workStart: input.workStart, minutesLate: nowMin - startMin };
}

/**
 * Fase hari kerja outlet saat ini — untuk kalimat kartu manager
 * ("belum memasuki jendela alert" vs "jam kerja sudah selesai").
 */
export function attendanceWindowPhase(now: string, workStart: string, workEnd?: string): "before" | "open" | "after" {
  const nowMin = hhmmToMin(now);
  const startMin = hhmmToMin(workStart);
  const endMin = workEnd ? hhmmToMin(workEnd) : -1;
  if (nowMin < 0 || startMin < 0) return "before";
  if (endMin > startMin && nowMin >= endMin) return "after";
  if (nowMin < startMin - ATTENDANCE_ALERT_LEAD_MIN) return "before";
  return "open";
}
