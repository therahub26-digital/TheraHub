import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, StatusBadge } from "@/components/ui";
import {
  PRIMARY_OUTLET, bookingKpi, therapistsOf, attendanceToday, activeSessions,
  lowStock, roomsOf, bookingsToday, TODAY, NOW_HHMM,
} from "@/lib/mock";
import { rp, pct, fmtTime } from "@/lib/format";

const PRESENCE_LABEL: Record<string, string> = {
  AVAILABLE: "Tersedia", IN_SESSION: "Sedang Melayani", BREAK: "Istirahat", OFF: "Libur", LATE: "Terlambat", ABSENT: "Tidak Hadir",
};
const PRESENCE_TONE: Record<string, "success" | "accent" | "warning" | "neutral" | "danger"> = {
  AVAILABLE: "success", IN_SESSION: "accent", BREAK: "warning", OFF: "neutral", LATE: "warning", ABSENT: "danger",
};

export default function ManagerTodayPage() {
  const outlet = PRIMARY_OUTLET;
  const kpi = bookingKpi(outlet.id);
  const therapists = therapistsOf(outlet.id);
  const attendance = attendanceToday(outlet.id);
  const late = attendance.filter((a) => a.status === "LATE" || a.status === "SUSPICIOUS");
  const absent = attendance.filter((a) => a.status === "ABSENT");
  const sessions = activeSessions(outlet.id);
  const low = lowStock(outlet.id).slice(0, 5);
  const rooms = roomsOf(outlet.id);
  const upcoming = bookingsToday(outlet.id)
    .filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED"].includes(b.status) && b.scheduledStart >= NOW_HHMM)
    .slice(0, 6);

  const presenceCount = (p: string) => therapists.filter((t) => t.presence === p).length;

  return (
    <>
      <PageHead
        title="Today Overview"
        desc={`${outlet.name} · ${TODAY} · Pukul ${NOW_HHMM}`}
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
          <CardHead title="Status Terapis" sub={`Total ${therapists.length} terapis`} action={<Link href="/manager/therapists" className="btn btn-quiet btn-sm">Lihat semua</Link>} />
          <div className="card-body">
            <div className="grid grid-4" style={{ gap: 10, marginBottom: 14 }}>
              {["AVAILABLE", "IN_SESSION", "BREAK", "OFF"].map((p) => (
                <div key={p} className="stat" style={{ padding: "10px 12px" }}>
                  <div className="stat-value" style={{ fontSize: 19 }}>{presenceCount(p)}</div>
                  <div className="tiny dim">{PRESENCE_LABEL[p]}</div>
                </div>
              ))}
            </div>
            <div className="stack g2">
              {therapists.slice(0, 6).map((t) => (
                <div key={t.id} className="row between small" style={{ padding: "6px 0" }}>
                  <PersonCell name={t.name} sub={t.therapistGrade} toneKey={t.avatarTone} size={26} />
                  <Badge tone={PRESENCE_TONE[t.presence ?? "AVAILABLE"]}>{PRESENCE_LABEL[t.presence ?? "AVAILABLE"]}</Badge>
                </div>
              ))}
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
                  <div className="tiny dim truncate">{s.packageName} · {s.roomName} · {s.therapistName}</div>
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
              const occ = sessions.some((s) => s.roomName === r.name);
              const status = r.status === "MAINTENANCE" ? "Maintenance" : occ ? "Terpakai" : "Tersedia";
              const tone = r.status === "MAINTENANCE" ? "warning" : occ ? "accent" : "success";
              return (
                <div key={r.id} className="row between small">
                  <span className="muted row g2"><Icon name="door-open" size={13} /> {r.name}</span>
                  <Badge tone={tone as "warning" | "accent" | "success"} dot>{status}</Badge>
                </div>
              );
            })}
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
                    <td className="muted small">{b.roomName}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack g5">
          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="alert-triangle" size={15} style={{ color: late.length || absent.length ? "var(--warning)" : "var(--text-4)" }} />
              <h4>Alert Kehadiran</h4>
            </div>
            {late.length === 0 && absent.length === 0 ? (
              <div className="small dim">Semua terapis hadir tepat waktu.</div>
            ) : (
              <div className="stack g2">
                {[...late, ...absent].slice(0, 4).map((a) => (
                  <div key={a.id} className="row between small">
                    <span className="muted">{a.employeeName}</span>
                    <Badge tone={a.status === "ABSENT" ? "danger" : "warning"}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="package" size={15} style={{ color: "var(--warning)" }} />
              <h4>Stok Menipis</h4>
            </div>
            <div className="stack g2">
              {low.map((p) => (
                <div key={p.id} className="row between small">
                  <span className="muted truncate" style={{ maxWidth: 160 }}>{p.name}</span>
                  <span style={{ color: "var(--danger)" }}>{p.stocks[outlet.id]}/{p.minStock}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
