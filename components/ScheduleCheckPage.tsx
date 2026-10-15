import { PageHead, Card, CardHead, InfoNote, Badge, PersonCell } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getBookingsForOutlet, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { getAttendanceForOutletOnDate } from "@/lib/data/attendance";
import { computeAttendanceAlert, attendanceWindowPhase, ATTENDANCE_ALERT_LEAD_MIN } from "@/lib/attendanceAlert";
import { fmtTime } from "@/lib/format";
import { getScheduleExceptions, getUpcomingScheduleExceptions } from "@/lib/data/scheduleExceptions";
import { getLeaveRequestsForOutlet } from "@/lib/data/leaveRequests";
import { plusDays } from "@/lib/wallclock";
import { fmtDateLong } from "@/lib/format";
import ScheduleCheckBoard from "@/components/ScheduleCheckBoard";
import LeavePlanBoard from "@/components/LeavePlanBoard";
import LeaveRequestApprovalBoard from "@/components/LeaveRequestApprovalBoard";
import RosterPosterButton, { type RosterPosterData } from "@/components/RosterPosterButton";
import { getCurrentTenant, getTenantTheme } from "@/lib/data/tenant";
import { brandByKey, backgroundByKey } from "@/lib/brand";
import { ACTIVE_TENANT } from "@/lib/mock";

// ---------------------------------------------------------------------
// Shared page body for /manager/schedule-check and /kasir/schedule-check
// — "setiap hari tugas manager atau kasir, untuk cek list therapis yang
// off atau libur. untuk yang sudah booking otomatis ditawarkan untuk
// ganti therapis atau dibatalkan", user request 2026-08-22.
//
// One shared component instead of two separate pages because the
// underlying data and RLS write policy (`_is_outlet_staff`, see
// 0017_therapist_gallery_booking_window_schedule.sql) explicitly treat
// manager and kasir the same for this workflow — only the surrounding
// nav/shell differs, and that's already handled by each role's own
// layout.
//
// Data gathered here (today only — this is a daily operational check,
// not a scheduling calendar): every active therapist at this outlet,
// today's OFF/LEAVE exceptions, and today's active bookings so the
// client board can show, for each excepted therapist, exactly which of
// their bookings today need a decision.
// ---------------------------------------------------------------------

const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SESSION"];

export default async function ScheduleCheckPage() {
  const outlet = await getCurrentOutlet();
  const [today, now] = await Promise.all([getEffectiveToday(), getEffectiveNow()]);

  const [therapists, exceptions, bookingsToday, upcomingExceptions, leaveRequests, attendanceToday] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getScheduleExceptions(outlet.id, today),
    getBookingsForOutlet(outlet.id, today),
    getUpcomingScheduleExceptions(outlet.id, plusDays(today, 1)),
    getLeaveRequestsForOutlet(outlet.id),
    getAttendanceForOutletOnDate(outlet.id, today),
  ]);
  const [tenant, theme] = await Promise.all([getCurrentTenant(), getTenantTheme()]);
  const therapistBoardProps = therapists.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    avatarTone: t.avatarTone,
    photoUrl: t.photoUrl ?? null,
  }));

  // Poster "Your Relax Squad" (Adjie 2026-10-08, Opsi B): bertugas =
  // semua terapis aktif outlet ini dikurangi yang OFF/LEAVE hari ini —
  // bukan berdasarkan check-in, karena poster dibuat pagi sebelum semua
  // terapis datang.
  const offById = new Map(exceptions.map((e) => [e.employeeId, e.type]));
  const brand = brandByKey(theme.brandKey);
  const bg = backgroundByKey(theme.bgKey);
  const posterData: RosterPosterData = {
    date: today,
    dateLabel: fmtDateLong(today),
    brandName: tenant?.brandName ?? ACTIVE_TENANT.name,
    outletName: outlet.name,
    logoUrl: theme.logoUrl,
    heroPhotoUrl: theme.backgroundPhotoUrl ?? bg.image ?? null,
    accent: brand.accent,
    accent2: brand.accent2,
    base: bg.base,
    whatsapp: tenant?.whatsapp || outlet.phone || null,
    instagram: tenant?.instagram || null,
    onDuty: therapists
      .filter((t) => !offById.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, photoUrl: t.photoUrl ?? null, skill: t.skills?.[0] ?? null })),
    off: therapists
      .filter((t) => offById.has(t.id))
      .map((t) => ({ name: t.name, type: offById.get(t.id) as "OFF" | "LEAVE" })),
  };

  const activeBookingsToday = bookingsToday.filter((b) => ACTIVE_STATUSES.includes(b.status));

  // -------------------------------------------------------------------
  // Kartu "Absensi Menjelang Jam Masuk" (Adjie 2026-10-15) — sisi
  // manager/kasir dari alert absensi terapis. Dihitung saat dibaca
  // (§6.4), logika per orang persis lib/attendanceAlert.ts yang dipakai
  // PWA terapis, supaya kedua sisi tidak pernah berbeda pendapat.
  // Keterangan yang menekan status "belum absen": exception hari ini
  // (sudah ada di `exceptions`) atau pengajuan hari ini PENDING/APPROVED
  // (Cuti/Sakit, Libur, Ijin Masuk Siang).
  // -------------------------------------------------------------------
  const checkInByEmployee = new Map(attendanceToday.filter((a) => a.checkInAt).map((a) => [a.employeeId, a]));
  const todaysRequestByEmployee = new Map(
    leaveRequests
      .filter((r) => r.date === today && (r.status === "PENDING" || r.status === "APPROVED"))
      .map((r) => [r.employeeId, r])
  );
  const REQ_TYPE_LABEL = { LEAVE: "Cuti/Sakit", OFF: "Libur", LATE: "Ijin Masuk Siang" } as const;
  const rollCall = therapists.map((t) => {
    const att = checkInByEmployee.get(t.id);
    const exc = offById.get(t.id);
    const req = todaysRequestByEmployee.get(t.id);
    const alert = computeAttendanceAlert({
      now,
      workStart: outlet.workStartTime,
      workEnd: outlet.workEndTime,
      checkedIn: !!att,
      hasExcuse: !!exc || !!req,
    });
    return { t, att, exc, req, alert };
  });
  const missing = rollCall.filter((r) => r.alert.kind !== "none");
  // Jendela alert outlet ini sedang aktif? (probe tanpa check-in/keterangan
  // — persis definisi jendelanya sendiri, T−5 menit dan seterusnya.)
  // Fase hari kerja: sebelum jendela (T−5), terbuka, atau sudah lewat jam
  // pulang (temuan UAT F5 — dulu kartu tetap merah sampai tengah malam).
  const windowPhase = attendanceWindowPhase(now, outlet.workStartTime, outlet.workEndTime);
  const alertWindowOpen = windowPhase === "open";

  return (
    <>
      <PageHead
        title="Cek Jadwal Terapis"
        desc={`${outlet.name} · ${fmtDateLong(today)} — tandai terapis yang off/libur, lalu putuskan booking yang terdampak.`}
        actions={<RosterPosterButton data={posterData} />}
      />

      <InfoNote icon="info" tone="info" title="Rutinitas harian">
        Cek daftar ini setiap awal shift. Terapis yang ditandai OFF/LIBUR akan otomatis dicek terhadap booking hari ini —
        booking yang bentrok akan ditawarkan untuk diganti terapisnya atau dibatalkan.
      </InfoNote>

      <div style={{ marginTop: 20 }}>
        {/* Absensi menjelang jam masuk (2026-10-15) — pasangan manager
            dari alert T−5 menit di PWA terapis. Baca-saja: keputusan
            (ACC keterangan) tetap satu pintu di board Pengajuan Cuti di
            bawah, dan menandai OFF/LIBUR tetap lewat Roster. */}
        <Card style={{ marginBottom: 20 }}>
          <CardHead
            title="Absensi Menjelang Jam Masuk"
            sub={
              alertWindowOpen
                ? `Jam masuk ${outlet.workStartTime} · ${missing.length} terapis belum absen tanpa keterangan`
                : windowPhase === "after"
                  ? `Jam kerja ${outlet.workStartTime}–${outlet.workEndTime} · sudah selesai hari ini`
                  : `Jam masuk ${outlet.workStartTime} — alert aktif ${ATTENDANCE_ALERT_LEAD_MIN} menit sebelumnya`
            }
          />
          <div className="card-body">
            {windowPhase === "after" ? (
              <div className="small dim">
                Jam kerja hari ini sudah selesai (pulang {outlet.workEndTime}) — alert absensi tidak aktif lagi.
                Rekap kehadiran bulanan ada di menu Kinerja Terapis.
              </div>
            ) : !alertWindowOpen ? (
              <div className="small dim">
                Belum memasuki jendela alert. Daftar terapis yang belum absen tanpa keterangan muncul di sini mulai{" "}
                {ATTENDANCE_ALERT_LEAD_MIN} menit sebelum jam masuk ({outlet.workStartTime}).
              </div>
            ) : (
              <div className="stack g2">
                {missing.length === 0 && (
                  <div className="small dim">
                    Semua terapis sudah absen atau punya keterangan (cuti/libur/ijin) hari ini.
                  </div>
                )}
                {rollCall.map(({ t, att, exc, req, alert }) => (
                  <div key={t.id} className="row between g2" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl ?? undefined} size={30} />
                    {att?.checkInAt ? (
                      <Badge tone="success" dot>Absen {fmtTime(att.checkInAt)}</Badge>
                    ) : exc ? (
                      <Badge tone="neutral" dot>{exc === "OFF" ? "Libur" : "Cuti/Sakit"}</Badge>
                    ) : req ? (
                      <Badge tone={req.status === "PENDING" ? "warning" : "info"} dot>
                        {REQ_TYPE_LABEL[req.type]}{req.status === "PENDING" ? " · menunggu ACC" : " · tercatat"}
                      </Badge>
                    ) : (
                      <Badge tone="danger" dot>
                        {alert.kind === "late" ? `Belum absen · lewat ${alert.minutesLate} mnt` : "Belum absen"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Cuti/libur terapis digabung jadi satu kotak (2026-08-24, umpan
            balik pengguna) — sebelumnya dua Card terpisah untuk hal yang
            sama-sama "cuti terapis", cuma beda apakah untuk hari ini
            (butuh keputusan approve/reject) atau tanggal mendatang
            (sekadar penandaan). Datanya tidak berubah, cuma dirapikan
            jadi satu kartu dengan pembatas di antara dua bagian. */}
        <Card style={{ marginBottom: 20 }}>
          <CardHead
            title="Cuti & Libur Terapis"
            sub={`${leaveRequests.filter((r) => r.date === today && r.status !== "REJECTED").length} keterangan untuk hari ini · tercatat otomatis, tanpa persetujuan`}
          />
          <div className="card-body">
            <div className="small strong" style={{ color: "var(--text-1)", marginBottom: 4 }}>
              Keterangan dari Terapis (tercatat otomatis)
            </div>
            <LeaveRequestApprovalBoard
              therapists={therapistBoardProps}
              requests={leaveRequests.map((r) => ({ id: r.id, employeeId: r.employeeId, date: r.date, type: r.type, note: r.note, status: r.status, requestedAt: r.requestedAt }))}
            />

            <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 }}>
              <div className="small strong" style={{ color: "var(--text-1)" }}>Rencana Libur/Cuti ke Depan</div>
              <div className="tiny dim" style={{ marginBottom: 10 }}>
                Tandai OFF/LIBUR untuk tanggal mendatang — tidak perlu menunggu hari-H
              </div>
              <LeavePlanBoard
                outletId={outlet.id}
                minDate={plusDays(today, 1)}
                therapists={therapistBoardProps}
                rows={upcomingExceptions.map((e) => ({ id: e.id, employeeId: e.employeeId, date: e.date, type: e.type, note: e.note }))}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Roster Terapis Hari Ini" sub={`${therapists.length} terapis aktif di outlet ini`} />
          <div className="card-body">
            {therapists.length > 0 ? (
              <ScheduleCheckBoard
                outletId={outlet.id}
                date={today}
                therapists={therapists.map((t) => ({
                  id: t.id,
                  name: t.name,
                  code: t.code,
                  grade: t.therapistGrade ?? null,
                  photoUrl: t.photoUrl ?? null,
                  avatarTone: t.avatarTone,
                }))}
                exceptions={exceptions.map((e) => ({ employeeId: e.employeeId, type: e.type, note: e.note }))}
                upcoming={upcomingExceptions.map((e) => ({ employeeId: e.employeeId, date: e.date, type: e.type }))}
                bookings={activeBookingsToday.map((b) => ({
                  id: b.id,
                  code: b.code,
                  customerName: b.customerName,
                  therapistId: b.therapistId,
                  scheduledStart: b.scheduledStart,
                  scheduledEnd: b.scheduledEnd,
                  packageName: b.packageName,
                  status: b.status,
                }))}
              />
            ) : (
              <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>
                Tidak ada terapis aktif di outlet ini.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
