import { PageHead, Card, CardHead, InfoNote } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { getScheduleExceptions } from "@/lib/data/scheduleExceptions";
import { fmtDateLong } from "@/lib/format";
import ScheduleCheckBoard from "@/components/ScheduleCheckBoard";

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
  const today = await getEffectiveToday();

  const [therapists, exceptions, bookingsToday] = await Promise.all([
    getTherapistsForOutlet(outlet.id),
    getScheduleExceptions(outlet.id, today),
    getBookingsForOutlet(outlet.id, today),
  ]);

  const activeBookingsToday = bookingsToday.filter((b) => ACTIVE_STATUSES.includes(b.status));

  return (
    <>
      <PageHead
        title="Cek Jadwal Terapis"
        desc={`${outlet.name} · ${fmtDateLong(today)} — tandai terapis yang off/libur, lalu putuskan booking yang terdampak.`}
      />

      <InfoNote icon="info" tone="info" title="Rutinitas harian">
        Cek daftar ini setiap awal shift. Terapis yang ditandai OFF/LIBUR akan otomatis dicek terhadap booking hari ini —
        booking yang bentrok akan ditawarkan untuk diganti terapisnya atau dibatalkan.
      </InfoNote>

      <div style={{ marginTop: 20 }}>
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
