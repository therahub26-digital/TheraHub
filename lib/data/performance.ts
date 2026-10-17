import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getAttendanceForOutletInRange } from "@/lib/data/attendance";
import { getScheduleExceptionsInRange } from "@/lib/data/scheduleExceptions";
import { getLeaveRequestsForOutlet } from "@/lib/data/leaveRequests";
import { getCustomerReviewsForOutletInRange, getManagementReviewsForOutlet } from "@/lib/data/reviews";
import { calculatePerformanceScore } from "@/lib/data/monthly-report-math";

// ---------------------------------------------------------------------
// Rekap kinerja terapis per bulan — halaman "Kinerja Terapis" untuk
// manager (/manager/performance) dan owner (/owner/therapists).
// Permintaan Adjie 2026-10-15: jumlah tamu per bulan, tingkat kehadiran
// dan terlambat, ijin dalam sebulan, penilaian customer — plus
// penilaian manajemen bintang 1–5 + keterangan.
//
// Semua angka dihitung saat dibaca (§6.4) dari tabel yang sudah ada;
// tidak ada kolom rekap tersimpan yang bisa basi. Caller client biasa
// (bukan service-role): RLS yang menentukan siapa melihat apa — manager
// & owner memang punya baca tenant/outlet-wide di semua tabel yang
// disentuh di sini.
//
// "Tingkat kehadiran" dihitung JUJUR terhadap hari yang sudah berlalu:
//   hari diharapkan = hari kalender bulan itu yang sudah lewat (sampai
//   hari ini untuk bulan berjalan) MINUS hari ber-exception (cuti/libur
//   yang tercatat). Tanpa roster shift per orang (memang belum ada —
//   lihat catatan lib/actions/attendance.ts), hari kalender adalah
//   proksi terbaik yang tersedia; keterbatasan ini dinyatakan di layar,
//   bukan disembunyikan.
// ---------------------------------------------------------------------

export type TherapistPerformanceRow = {
  id: string;
  name: string;
  code: string;
  avatarTone: string;
  photoUrl: string | null;
  /** Booking PAID bulan itu. */
  guests: number;
  presentDays: number;
  lateCount: number;
  lateMinutesTotal: number;
  /** Hari yang sudah berlalu bulan itu minus hari cuti/libur tercatat. 0 untuk bulan depan. */
  expectedDays: number;
  /** presentDays / expectedDays, null bila expectedDays 0 ATAU outlet belum punya data absensi bulan itu. */
  attendancePct: number | null;
  /**
   * TEMUAN UAT 2026-10-15 (F6): false bila SELURUH outlet tidak punya satu
   * pun baris absensi di bulan itu — artinya absensi GPS belum dipakai,
   * bukan semua terapis bolos. Ditampilkan "Belum ada data absensi",
   * bukan "0/15 hari (0%)" (prinsip §6.3: belum ada data ≠ nol).
   */
  attendanceTracked: boolean;
  /** Shared weighted score: customers 40%, customer rating 25%, attendance 25%, punctuality 10%. */
  performanceScore?: number | null;
  /** Keterangan tercatat bulan itu (status bukan REJECTED), per jenis. */
  leaveSick: number;
  leaveOff: number;
  leaveLate: number;
  customerAvg: number | null;
  customerCount: number;
  management: { rating: number; note: string | null } | null;
};

/** "2026-10" -> { start: "2026-10-01", endExcl: "2026-11-01", days: 31 }. */
export function monthWindow(period: string): { start: string; endExcl: string; days: number } {
  const [y, m] = period.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const p = (n: number) => String(n).padStart(2, "0");
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari ke-0 bulan berikut = hari terakhir bulan ini
  return { start: `${period}-01`, endExcl: `${nextY}-${p(nextM)}-01`, days };
}

export async function getTherapistPerformance(outletId: string, period: string, today: string): Promise<TherapistPerformanceRow[]> {
  const { start, endExcl, days } = monthWindow(period);
  const supabase = await createClient();

  const [therapists, attendance, exceptions, allLeaveRequests, customerReviews, managementReviews, paidBookings] =
    await Promise.all([
      getTherapistsForOutlet(outletId),
      getAttendanceForOutletInRange(outletId, start, endExcl),
      getScheduleExceptionsInRange(outletId, start, endExcl),
      getLeaveRequestsForOutlet(outletId),
      getCustomerReviewsForOutletInRange(outletId, start, endExcl),
      getManagementReviewsForOutlet(outletId, period),
      // Lean & anti-truncation (§6.6): hanya kolom yang dihitung, lewat
      // fetchAllRows — satu bulan outlet ramai bisa lewat 1000 baris.
      fetchAllRows<{ therapist_id: string | null }>(async (from, to) => {
        const { data, error } = await supabase
          .from("bookings")
          .select("therapist_id")
          .eq("outlet_id", outletId)
          .eq("status", "PAID")
          .gte("date", start)
          .lt("date", endExcl)
          .range(from, to);
        return { data: data as { therapist_id: string | null }[] | null, error };
      }).then((r) => r.rows),
    ]);

  // Hari yang sudah berlalu dari bulan ini (lihat header).
  const currentPeriod = today.slice(0, 7);
  const elapsedDays = period > currentPeriod ? 0 : period < currentPeriod ? days : Number(today.slice(8, 10));

  const guestsByTherapist = new Map<string, number>();
  for (const b of paidBookings) {
    if (b.therapist_id) guestsByTherapist.set(b.therapist_id, (guestsByTherapist.get(b.therapist_id) ?? 0) + 1);
  }

  const managementByTherapist = new Map(managementReviews.map((r) => [r.employeeId, r]));
  const attendanceTracked = attendance.some((a) => a.checkInAt);

  const rows = therapists.map((t) => {
    const att = attendance.filter((a) => a.employeeId === t.id && a.checkInAt);
    // Satu baris per hari per orang (desain attendance_events), tapi
    // dihitung lewat Set supaya data ganjil tidak menggandakan hadir.
    const presentDays = new Set(att.map((a) => a.date)).size;
    const lateRows = att.filter((a) => a.lateMinutes > 0);
    const excusedDays = new Set(
      exceptions.filter((e) => e.employeeId === t.id && e.date <= today).map((e) => e.date)
    ).size;
    const expectedDays = Math.max(0, elapsedDays - excusedDays);

    const myLeave = allLeaveRequests.filter(
      (r) => r.employeeId === t.id && r.status !== "REJECTED" && r.date >= start && r.date < endExcl
    );

    const myReviews = customerReviews.filter((r) => r.employeeId === t.id);
    const customerAvg = myReviews.length > 0 ? myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length : null;

    const mgmt = managementByTherapist.get(t.id);

    return {
      id: t.id,
      name: t.name,
      code: t.code,
      avatarTone: t.avatarTone,
      photoUrl: t.photoUrl ?? null,
      guests: guestsByTherapist.get(t.id) ?? 0,
      presentDays,
      lateCount: lateRows.length,
      lateMinutesTotal: lateRows.reduce((s, a) => s + a.lateMinutes, 0),
      expectedDays,
      attendancePct: attendanceTracked && expectedDays > 0 ? (presentDays / expectedDays) * 100 : null,
      attendanceTracked,
      performanceScore: null,
      leaveSick: myLeave.filter((r) => r.type === "LEAVE").length,
      leaveOff: myLeave.filter((r) => r.type === "OFF").length,
      leaveLate: myLeave.filter((r) => r.type === "LATE").length,
      customerAvg,
      customerCount: myReviews.length,
      management: mgmt ? { rating: mgmt.rating, note: mgmt.note } : null,
    };
  });
  const maxGuests = Math.max(0, ...rows.map((row) => row.guests));
  return rows.map((row) => ({
    ...row,
    performanceScore: calculatePerformanceScore({
      customerCount: row.guests,
      maximumCustomerCount: maxGuests,
      customerRating: row.customerAvg,
      attendancePct: row.attendancePct,
      lateCount: row.lateCount,
      expectedDays: row.expectedDays,
    }),
  }));
}
