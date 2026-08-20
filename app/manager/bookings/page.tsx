import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, StatusBadge, Badge } from "@/components/ui";
import { getOutlets } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { toMin, fmtTime, fmtDateLong, fmtDayShort, addDays } from "@/lib/format";
import type { Booking } from "@/lib/types";

const OPEN = toMin("09:00");
const CLOSE = toMin("22:00");
const SPAN = CLOSE - OPEN;
const HOURS = Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) => OPEN + i * 60);

const STATUS_BG: Record<string, string> = {
  BOOKED: "rgba(56,189,248,0.16)", CONFIRMED: "rgba(56,189,248,0.2)", ARRIVED: "rgba(167,139,250,0.2)",
  CHECKED_IN: "rgba(167,139,250,0.24)", IN_SESSION: "rgba(16,185,129,0.24)", COMPLETED: "rgba(34,197,94,0.18)",
  PAID: "rgba(34,197,94,0.18)", CANCELLED: "rgba(100,116,139,0.16)", NO_SHOW: "rgba(239,68,68,0.2)",
  RESCHEDULED: "rgba(245,158,11,0.2)",
};
const STATUS_BORDER: Record<string, string> = {
  BOOKED: "#38bdf8", CONFIRMED: "#38bdf8", ARRIVED: "#a78bfa", CHECKED_IN: "#a78bfa",
  IN_SESSION: "#10b981", COMPLETED: "#22c55e", PAID: "#22c55e", CANCELLED: "#64748b",
  NO_SHOW: "#ef4444", RESCHEDULED: "#f59e0b",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const sp = await searchParams;
  // No per-manager outlet-session scoping yet (see Fase 9 in the roadmap) —
  // same convention as the other migrated pages: default to the first
  // real outlet (Cikawao) when live.
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  const today = await getEffectiveToday();
  const date = sp.date ?? today;
  const view = sp.view ?? "calendar";
  const [rawBookings, rawTherapists] = await Promise.all([
    getBookingsForOutlet(outlet.id, date),
    getTherapistsForOutlet(outlet.id),
  ]);
  const bookings = rawBookings.filter((b) => b.status !== "CANCELLED");
  const therapists = rawTherapists.slice(0, 8);
  // Week-day chips: 7 days centered on "today" (was DAY_RANGE.slice(3, 10)
  // — a fixed 15-day mock range built around the frozen demo date, which
  // would show the wrong days once real bookings/dates are live).
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 3));

  return (
    <>
      <PageHead
        title="Bookings"
        desc="Kalender operasional harian — cegah double booking terapis dan room."
        actions={<Link href="/manager/bookings/new" className="btn btn-primary btn-sm"><Icon name="calendar-plus" size={14} /> Booking Baru</Link>}
      />

      <div className="between wrap g3" style={{ marginBottom: 16 }}>
        <div className="row g2">
          <Link href={`/manager/bookings?date=${addDays(date, -1)}&view=${view}`} className="btn btn-ghost btn-icon btn-sm"><Icon name="chevron-left" size={15} /></Link>
          <div className="row g2" style={{ padding: "0 8px" }}>
            <Icon name="calendar" size={15} style={{ color: "var(--accent)" }} />
            <span className="small bold" style={{ color: "var(--text-1)" }}>{fmtDateLong(date)}</span>
          </div>
          <Link href={`/manager/bookings?date=${addDays(date, 1)}&view=${view}`} className="btn btn-ghost btn-icon btn-sm"><Icon name="chevron-right" size={15} /></Link>
          <Link href={`/manager/bookings?date=${today}&view=${view}`} className="btn btn-ghost btn-sm">Hari ini</Link>
        </div>
        <div className="seg">
          <Link href={`/manager/bookings?date=${date}&view=calendar`}><button className={view === "calendar" ? "on" : ""}>Kalender</button></Link>
          <Link href={`/manager/bookings?date=${date}&view=list`}><button className={view === "list" ? "on" : ""}>Daftar</button></Link>
        </div>
      </div>

      <div className="row g2 wrap" style={{ marginBottom: 16 }}>
        {weekDays.map((d) => (
          <Link
            key={d}
            href={`/manager/bookings?date=${d}&view=${view}`}
            className={`chip ${d === date ? "on" : ""}`}
            style={{ flexDirection: "column", height: 48, gap: 1, minWidth: 46, padding: "5px 8px" }}
          >
            <span className="tiny dim">{fmtDayShort(d)}</span>
            <span className="small bold" style={{ color: d === date ? "var(--accent)" : "var(--text-2)" }}>{d.slice(8)}</span>
          </Link>
        ))}
      </div>

      {view === "calendar" ? (
        <Card>
          <div className="table-wrap">
            <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${therapists.length}, minmax(148px, 1fr))`, minWidth: 148 * therapists.length + 64 }}>
              <div style={{ borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
              {therapists.map((t) => (
                <div key={t.id} className="small strong" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", color: "var(--text-1)" }}>
                  {t.name}
                  <div className="tiny dim">{t.therapistGrade}</div>
                </div>
              ))}

              <div style={{ position: "relative", height: SPAN * 1.15, borderRight: "1px solid var(--border)" }}>
                {HOURS.map((h) => (
                  <div key={h} className="tiny dim" style={{ position: "absolute", top: `${((h - OPEN) / SPAN) * 100}%`, right: 8, transform: "translateY(-50%)" }}>
                    {fmtTime(`${Math.floor(h / 60)}:${h % 60}`)}
                  </div>
                ))}
              </div>

              {therapists.map((t) => {
                const items = bookings.filter((b) => b.therapistId === t.id);
                return (
                  <div key={t.id} style={{ position: "relative", height: SPAN * 1.15, borderRight: "1px solid var(--border)" }}>
                    {HOURS.map((h) => (
                      <div key={h} style={{ position: "absolute", top: `${((h - OPEN) / SPAN) * 100}%`, left: 0, right: 0, borderTop: "1px solid var(--border)" }} />
                    ))}
                    {items.map((b) => <BookingBlock key={b.id} b={b} />)}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Sumber</th><th>Status</th></tr></thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="mono small nowrap">{fmtTime(b.scheduledStart)}–{fmtTime(b.scheduledEnd)}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{b.customerName}</td>
                    <td className="muted small">{b.packageName}</td>
                    <td className="muted small">{b.therapistName}</td>
                    <td className="muted small">{b.roomName}</td>
                    <td><Badge tone="neutral">{b.source}</Badge></td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function BookingBlock({ b }: { b: Booking }) {
  const start = toMin(b.scheduledStart);
  const end = toMin(b.scheduledEnd);
  const top = ((start - OPEN) / SPAN) * 100;
  const height = ((end - start) / SPAN) * 100;
  return (
    <div
      title={`${b.customerName} · ${b.packageName} · ${fmtTime(b.scheduledStart)}-${fmtTime(b.scheduledEnd)}`}
      style={{
        position: "absolute",
        top: `${top}%`,
        height: `${Math.max(height, 3)}%`,
        left: 4,
        right: 4,
        background: STATUS_BG[b.status] ?? "rgba(255,255,255,0.08)",
        borderLeft: `2.5px solid ${STATUS_BORDER[b.status] ?? "#64748b"}`,
        borderRadius: 6,
        padding: "3px 6px",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
      <div className="tiny dim truncate">{b.packageName}</div>
    </div>
  );
}
