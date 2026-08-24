import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge, PersonCell } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getAvailableRoomsForOutlet } from "@/lib/data/rooms";
import { BookingRowActions } from "@/components/SessionActions";
import { getBookingsToday, getBookingKpi, getEffectiveToday, getEffectiveNow, isLiveBookingsData } from "@/lib/data/bookings";
import { rp, fmtTime } from "@/lib/format";
import { buildFollowUpList } from "@/lib/bookingRules";
import BookingFollowUpBanner from "@/components/BookingFollowUp";

export default async function KasirTodayPage() {
  const outlet = await getCurrentOutlet();
  const [rawBookings, kpi, today, NOW_HHMM, live, availableRooms] = await Promise.all([
    getBookingsToday(outlet.id),
    getBookingKpi(outlet.id),
    getEffectiveToday(),
    getEffectiveNow(),
    isLiveBookingsData(),
    getAvailableRoomsForOutlet(outlet.id),
  ]);
  // UPDATE 2026-08-23 (user, reviewing the real kasir tab view): "selesai
  // dan batal dipisahkan juga, batal paling bawah" — CANCELLED bookings
  // used to be dropped from `bookings` entirely right here, so a kasir
  // could never actually see them on this page (not even lumped into the
  // old combined "Selesai / Batal" box, which in practice only ever held
  // NO_SHOW rows). Splitting Selesai from Batal into their own boxes only
  // makes sense if Batal can actually show every kind of "didn't happen"
  // booking, so the CANCELLED filter is removed here — CANCELLED now
  // flows through like every other status and lands in the Batal box
  // below instead of being silently hidden.
  const bookings = rawBookings;
  const roomOptions = availableRooms.map((r) => ({ id: r.id, name: r.name }));

  // Rule 2, kasir side (user, 2026-08-23): the guest gets an email at
  // H-1 (not built yet — no mail provider is wired up, see the roadmap),
  // but "prakteknya kasir akan mendapatkan notifikasi juga dan
  // menghubungi budi secara manual via wa". This is that list: bookings
  // starting within the hour that nobody has confirmed yet.
  //
  // Live mode only. In the demo "Ganti Role" view the booking rows carry
  // the frozen mock date while these helpers read the real wall clock,
  // so the two would be comparing different calendars and the banner
  // would be nonsense.
  const followUps = live ? buildFollowUpList(bookings) : [];

  // User request 2026-08-23 ("jadwal booking hari ini di kelompokan mulai
  // dari menunggu kedatangan, diurut dari jam yg lebih awal; kemudian yg
  // sudah checkin; kemudian in session; dan yg sudah selesai atau batal"):
  // group the table into 4 ordered stages, sorted by scheduled time within
  // each stage. DRAFT is treated as "menunggu kedatangan" too since it
  // hasn't checked in yet; CANCELLED never reaches here (filtered above)
  // but is included for completeness/future-proofing if that filter changes.
  // UPDATE 2026-08-23 (user: "tampilan daftar jadwal booking hari ini di
  // kasir dibagi 3 kelompok/kotak — yang sudah booking belum checkin,
  // sudah check in dan sedang sesi, dan sudah selesai atau batal"):
  // the single combined table (grouped-by-sort from babak 16) is now
  // three separate cards, one per stage. Stage 0/1 from babak 16
  // (menunggu kedatangan / sudah check-in) turned out to look like ONE
  // continuous list to a cashier scanning fast — a stage boundary you
  // have to notice from row color alone is easy to miss during a busy
  // shift. Splitting into boxes with their own heading makes the
  // boundary impossible to miss. IN_SESSION now shares a box with
  // check-in (both are "the guest is here, something is in progress"),
  // matching the user's own grouping ("sudah check in dan sedang sesi").
  const waitingArrival = bookings
    .filter((b) => ["DRAFT", "BOOKED", "CONFIRMED"].includes(b.status))
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0));
  const inProgress = bookings
    .filter((b) => ["ARRIVED", "CHECKED_IN", "IN_SESSION"].includes(b.status))
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0));
  // UPDATE 2026-08-23 — user: "selesai dan batal dipisahkan juga, batal
  // paling bawah". The old single "Selesai / Batal" box sorted COMPLETED/
  // PAID and CANCELLED/NO_SHOW together purely by scheduled time, so a
  // no-show from 10:00 could sit above a real completed+paid session from
  // 18:00 — a kasir scanning the day's outcomes had to read every status
  // chip individually to tell which bookings actually happened. Split
  // into two boxes: "Selesai" (COMPLETED/PAID — the booking happened) and
  // "Batal" (CANCELLED/NO_SHOW/RESCHEDULED — it didn't, for whatever
  // reason), each still sorted by scheduled time within itself, with
  // Batal rendered last so the outcomes a kasir actually cares about
  // (what got paid) aren't pushed below a pile of no-shows.
  const done = bookings
    .filter((b) => ["COMPLETED", "PAID"].includes(b.status))
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0));
  const cancelled = bookings
    .filter((b) => ["CANCELLED", "NO_SHOW", "RESCHEDULED"].includes(b.status))
    .sort((a, b) => (a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0));

  function BookingBox({ title, sub, rows }: { title: string; sub: string; rows: typeof bookings }) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <CardHead title={title} sub={sub} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Sumber</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="mono small nowrap">{fmtTime(b.scheduledStart)}</td>
                  <td><PersonCell name={b.customerName} sub={b.customerPhone} toneKey="teal" size={26} /></td>
                  <td className="muted small">{b.packageName}</td>
                  <td className="muted small">{b.therapistName}</td>
                  <td className="muted small">{b.roomName}</td>
                  <td><Badge tone="neutral">{b.source}</Badge></td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="nowrap">
                    {["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status) && (
                      <BookingRowActions bookingId={b.id} status={b.status} rooms={roomOptions} />
                    )}
                    {["IN_SESSION", "COMPLETED"].includes(b.status) && (
                      <button className="btn btn-ghost btn-sm" disabled><Icon name="eye" size={12} /> Detail</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Tidak ada booking di kelompok ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHead
        title="Today / Booking"
        desc={`${outlet.name} · ${today} · Pukul ${NOW_HHMM} · Jadwal booking hari ini dan status kedatangan tamu.`}
        actions={<Link href="/kasir/booking-baru" className="btn btn-primary btn-sm"><Icon name="calendar-plus" size={14} /> Booking Walk-in</Link>}
      />

      <BookingFollowUpBanner items={followUps} />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Booking Hari Ini" value={kpi.total} icon="calendar-days" toneKey="teal" deltaLabel={`${kpi.sessions} sesi berjalan/selesai`} />
        {/*
          FIX 2026-08-24 — these two counters used to be computed from their
          own status lists, separate from the tables below, and the lists
          did not agree:
            * "Menunggu Kedatangan" counted BOOKED/CONFIRMED, while the box
              of the SAME NAME renders waitingArrival, which also includes
              DRAFT. A kasir comparing the number against the rows it is
              labelling could see 3 vs 4 and have no way to tell which was
              right.
            * "Sudah Tiba" counted ARRIVED/CHECKED_IN only, excluding
              IN_SESSION — but a guest whose session is running has very
              obviously arrived, so the number under-reported how many
              people were physically in the outlet.
          Both now count the exact arrays their matching tables render, so
          the number and the rows can never disagree again.
        */}
        <StatCard label="Menunggu Kedatangan" value={waitingArrival.length} icon="hourglass" toneKey="sky" deltaLabel="Belum check-in" />
        <StatCard label="Sudah Tiba" value={inProgress.length} icon="user-check" toneKey="gold" deltaLabel="Check-in / sesi berjalan" />
        <StatCard label="Revenue Hari Ini" value={rp(kpi.revenue, { short: true })} icon="circle-dollar" toneKey="violet" deltaLabel={`${kpi.paid} transaksi paid`} />
      </div>

      <BookingBox title="Menunggu Kedatangan" sub={`${waitingArrival.length} booking · belum check-in, diurutkan berdasarkan jam`} rows={waitingArrival} />
      <BookingBox title="Check-in & Sesi Berjalan" sub={`${inProgress.length} booking · tamu sudah di outlet`} rows={inProgress} />
      <BookingBox title="Selesai" sub={`${done.length} booking · sudah dibayar / tuntas hari ini`} rows={done} />
      <BookingBox title="Batal" sub={`${cancelled.length} booking · dibatalkan, tidak datang, atau dijadwal ulang`} rows={cancelled} />
    </>
  );
}
