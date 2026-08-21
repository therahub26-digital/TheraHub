import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, StatusBadge } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getBookingKpi, getBookingsForOutlet, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { getActiveSessionsForOutlet } from "@/lib/data/sessions";
import { getRoomsForOutlet, getAvailableRoomsForOutlet } from "@/lib/data/rooms";
import { rp, pct, fmtTime } from "@/lib/format";

// ---------------------------------------------------------------------
// Today Overview — was still reading lib/mock wholesale (bookingKpi,
// therapistsOf, attendanceToday, activeSessions, lowStock, roomsOf,
// bookingsToday), the last big manager page left on fake data. This is
// what the user's screenshot flagged: Melati Puspita (a retired therapist)
// and invented guest names in "Status Terapis" / "Sesi Aktif".
//
// SCOPE OF THIS MIGRATION — same honesty rule as /manager/therapists
// (see that page's header): every card below is either backed by a real
// table, or it says plainly that the underlying module doesn't exist yet.
// Two cards fall in the second bucket and are NOT faked:
//   - "Alert Kehadiran" needed an attendance/shift system (clock-in,
//     scheduled-vs-actual). employees.presence is a real column but
//     nothing anywhere writes to it — every real row is NULL — so reading
//     it would silently launder "we don't know" into "everyone's here."
//   - "Stok Menipis" needed a product/inventory module. There is no
//     lib/data/inventory.ts, no products table read path — nothing to
//     query.
// "Status Terapis" keeps its card but drops BREAK/OFF/LATE/ABSENT: those
// need attendance too. What IS real and shown: whether a therapist has a
// session running right now (derived from getActiveSessionsForOutlet,
// the same source /manager/sessions uses).
// ---------------------------------------------------------------------

export default async function ManagerTodayPage() {
  const outlet = await getCurrentOutlet();
  const [today, nowHHMM] = await Promise.all([getEffectiveToday(), getEffectiveNow()]);

  const [kpi, therapists, sessions, rooms, availableRooms, todaysBookings] = await Promise.all([
    getBookingKpi(outlet.id, today),
    getTherapistsForOutlet(outlet.id),
    getActiveSessionsForOutlet(outlet.id),
    getRoomsForOutlet(outlet.id),
    getAvailableRoomsForOutlet(outlet.id),
    getBookingsForOutlet(outlet.id, today),
  ]);

  // getTherapistsForOutlet already filters to status === "ACTIVE" (see
  // lib/data/employees.ts) — no need to filter again here.
  const busyTherapistIds = new Set(sessions.map((s) => s.therapistId).filter(Boolean));
  const activeTherapists = therapists;
  const busyCount = activeTherapists.filter((t) => busyTherapistIds.has(t.id)).length;
  const availableCount = activeTherapists.length - busyCount;

  const availableRoomIds = new Set(availableRooms.map((r) => r.id));

  const upcoming = todaysBookings
    .filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED"].includes(b.status) && b.scheduledStart >= nowHHMM)
    .slice(0, 6);

  return (
    <>
      <PageHead
        title="Today Overview"
        desc={`${outlet.name} · ${today} · Pukul ${nowHHMM}`}
        actions={
          <>
            <Link href="/manager/bookings" className="btn btn-ghost btn-sm"><Icon name="calendar-plus" size={14} /> Booking Baru</Link>
            <Link href="/manager/pos" className="btn btn-primary btn-sm"><Icon name="shopping-cart" size={14} /> Walk-in POS</Link>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Pendapatan Hari Ini" value={rp(kpi.revenue, { short: true })} icon="circle-dollar" toneKey="gold" deltaLabel={`${kpi.paid} transaksi paid`} />
        <StatCard label="Booking Hari Ini" value={kpi.total} icon="calendar-days" toneKey="teal" deltaLabel={`${kpi.sessions} sesi berjalan/selesai`} />
        <StatCard label="Tamu Dilayani" value={kpi.guests} icon="users" toneKey="sky" deltaLabel={`Avg ticket ${rp(kpi.avgTicket, { short: true })}`} />
        <StatCard label="No-show" value={kpi.noShow} icon="user-check" toneKey="danger" deltaLabel={`${pct(kpi.noShowRate)} dari booking`} />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card>
          <CardHead title="Status Terapis" sub={`Total ${activeTherapists.length} terapis aktif`} action={<Link href="/manager/therapists" className="btn btn-quiet btn-sm">Lihat semua</Link>} />
          <div className="card-body">
            <div className="grid grid-2" style={{ gap: 10, marginBottom: 14 }}>
              <div className="stat" style={{ padding: "10px 12px" }}>
                <div className="stat-value" style={{ fontSize: 19 }}>{busyCount}</div>
                <div className="tiny dim">Sedang Melayani</div>
              </div>
              <div className="stat" style={{ padding: "10px 12px" }}>
                <div className="stat-value" style={{ fontSize: 19 }}>{availableCount}</div>
                <div className="tiny dim">Tersedia</div>
              </div>
            </div>
            <div className="stack g2">
              {activeTherapists.slice(0, 6).map((t) => {
                const busy = busyTherapistIds.has(t.id);
                return (
                  <div key={t.id} className="row between small" style={{ padding: "6px 0" }}>
                    <PersonCell name={t.name} sub={t.therapistGrade} toneKey={t.avatarTone} size={26} />
                    <Badge tone={busy ? "accent" : "success"}>{busy ? "Sedang Melayani" : "Tersedia"}</Badge>
                  </div>
                );
              })}
              {activeTherapists.length === 0 && <div className="small dim">Tidak ada terapis aktif di outlet ini.</div>}
            </div>
            <div className="tiny dim" style={{ marginTop: 10 }}>
              Kehadiran/cuti/istirahat belum ditampilkan — butuh modul absensi yang belum live.
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Sesi Aktif" sub={`${sessions.length} sedang berjalan`} action={<Link href="/manager/sessions" className="btn btn-quiet btn-sm">Detail</Link>} />
          <div className="card-body stack g3">
            {sessions.length === 0 && <div className="small dim">Tidak ada sesi aktif saat ini.</div>}
            {sessions.map((s) => (
              <div key={s.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small strong truncate" style={{ color: "var(--text-1)" }}>{s.customerName}</div>
                  <div className="tiny dim truncate">{s.packageName} · {s.roomName || "room?"} · {s.therapistName}</div>
                </div>
                <Badge tone={s.status === "ENDING_SOON" ? "warning" : "accent"}>
                  {s.status === "ENDING_SOON" ? `${s.minutesRemaining}m lagi` : "Aktif"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Status Ruangan" sub={`${rooms.length} room`} action={<Link href="/manager/rooms" className="btn btn-quiet btn-sm">Kelola</Link>} />
          <div className="card-body stack g2">
            {rooms.map((r) => {
              const maintenance = r.status !== "ACTIVE";
              const occ = !maintenance && !availableRoomIds.has(r.id);
              const status = maintenance ? "Maintenance" : occ ? "Terpakai" : "Tersedia";
              const tone = maintenance ? "warning" : occ ? "accent" : "success";
              return (
                <div key={r.id} className="row between small">
                  <span className="muted row g2"><Icon name="door-open" size={13} /> {r.name}</span>
                  <Badge tone={tone as "warning" | "accent" | "success"} dot>{status}</Badge>
                </div>
              );
            })}
            {rooms.length === 0 && <div className="small dim">Belum ada room terdaftar di outlet ini.</div>}
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Booking Berikutnya" sub="Menunggu kedatangan tamu" action={<Link href="/manager/bookings" className="btn btn-quiet btn-sm">Kalender penuh</Link>} />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Status</th></tr></thead>
              <tbody>
                {upcoming.map((b) => (
                  <tr key={b.id}>
                    <td className="mono small">{fmtTime(b.scheduledStart)}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{b.customerName}</td>
                    <td className="muted small">{b.packageName}</td>
                    <td className="muted small">{b.therapistName}</td>
                    <td className="muted small">{b.roomName || "Belum ditentukan"}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
                {upcoming.length === 0 && (
                  <tr>
                    <td colSpan={6} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                      Tidak ada booking yang masih menunggu hari ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack g5">
          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="alert-triangle" size={15} style={{ color: "var(--text-4)" }} />
              <h4>Alert Kehadiran</h4>
            </div>
            <div className="small dim">Modul absensi/shift belum dibangun — belum ada data kehadiran real-time untuk ditampilkan di sini.</div>
          </Card>

          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="package" size={15} style={{ color: "var(--text-4)" }} />
              <h4>Stok Menipis</h4>
            </div>
            <div className="small dim">Modul inventori belum dibangun — belum ada data stok untuk ditampilkan di sini.</div>
          </Card>
        </div>
      </div>
    </>
  );
}
