import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge, PersonCell } from "@/components/ui";
import { getOutlets } from "@/lib/data/outlets";
import { getBookingsToday, getBookingKpi, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { rp, fmtTime } from "@/lib/format";

export default async function KasirTodayPage() {
  // No per-kasir outlet-session scoping yet (see Fase 9 in the roadmap) —
  // same convention as the other migrated pages: default to the first
  // real outlet (Cikawao) when live.
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  const [rawBookings, kpi, today, NOW_HHMM] = await Promise.all([
    getBookingsToday(outlet.id),
    getBookingKpi(outlet.id),
    getEffectiveToday(),
    getEffectiveNow(),
  ]);
  const bookings = rawBookings.filter((b) => b.status !== "CANCELLED");
  const waiting = bookings.filter((b) => ["BOOKED", "CONFIRMED"].includes(b.status));
  const arrived = bookings.filter((b) => ["ARRIVED", "CHECKED_IN"].includes(b.status));

  return (
    <>
      <PageHead
        title="Today / Booking"
        desc={`${outlet.name} · ${today} · Pukul ${NOW_HHMM} · Jadwal booking hari ini dan status kedatangan tamu.`}
        actions={<Link href="/kasir/booking-baru" className="btn btn-primary btn-sm"><Icon name="calendar-plus" size={14} /> Booking Walk-in</Link>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Booking Hari Ini" value={kpi.total} icon="calendar-days" toneKey="teal" deltaLabel={`${kpi.sessions} sesi berjalan/selesai`} />
        <StatCard label="Menunggu Kedatangan" value={waiting.length} icon="hourglass" toneKey="sky" deltaLabel="Belum check-in" />
        <StatCard label="Sudah Tiba" value={arrived.length} icon="user-check" toneKey="gold" deltaLabel="Arrived / checked-in" />
        <StatCard label="Revenue Hari Ini" value={rp(kpi.revenue, { short: true })} icon="circle-dollar" toneKey="violet" deltaLabel={`${kpi.paid} transaksi paid`} />
      </div>

      <Card>
        <CardHead title="Jadwal Booking Hari Ini" sub={`${bookings.length} booking · diurutkan berdasarkan jam`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Sumber</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="mono small nowrap">{fmtTime(b.scheduledStart)}</td>
                  <td><PersonCell name={b.customerName} sub={b.customerPhone} toneKey="teal" size={26} /></td>
                  <td className="muted small">{b.packageName}</td>
                  <td className="muted small">{b.therapistName}</td>
                  <td className="muted small">{b.roomName}</td>
                  <td><Badge tone="neutral">{b.source}</Badge></td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="nowrap">
                    {["BOOKED", "CONFIRMED"].includes(b.status) && (
                      <button className="btn btn-primary btn-sm"><Icon name="user-check" size={12} /> Check-in</button>
                    )}
                    {["ARRIVED", "CHECKED_IN", "IN_SESSION", "COMPLETED"].includes(b.status) && (
                      <button className="btn btn-ghost btn-sm"><Icon name="eye" size={12} /> Detail</button>
                    )}
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Tidak ada booking hari ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
