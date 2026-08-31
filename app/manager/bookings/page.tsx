import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, StatusBadge, Badge } from "@/components/ui";
import { BookingRowActions } from "@/components/SessionActions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTherapistsForOutlet } from "@/lib/data/employees";
import { getAvailableRoomsForOutlet } from "@/lib/data/rooms";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { toMin, fmtTime, fmtDateLong, fmtDayShort, addDays } from "@/lib/format";
import type { Booking } from "@/lib/types";

const OPEN = toMin("09:00");
const CLOSE = toMin("22:00");
const SPAN = CLOSE - OPEN;
const HOURS = Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) => OPEN + i * 60);

// Calendar column width by roster size. A fixed 148px column (the old
// value) is comfortable up to ~6 therapists but forces horizontal scroll
// beyond that on a typical manager desktop viewport (~1200-1400px content
// width) — exactly the "kolom diperkecil" complaint. Stepping the width
// down as the roster grows keeps ~8-10 therapists fitting on screen while
// staying wide enough to read a truncated name + grade; below ~72px names
// stop being legible at all, so `.table-wrap` scroll remains the fallback
// for outlets with an unusually large roster.
function colWidth(therapistCount: number): number {
  if (therapistCount <= 6) return 148;
  if (therapistCount <= 8) return 118;
  if (therapistCount <= 10) return 96;
  return 78;
}

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
  const outlet = await getCurrentOutlet();
  const today = await getEffectiveToday();
  const date = sp.date ?? today;
  // Default view is "list", not "calendar" — user feedback (2026-08-22):
  // the daily grid rarely fits a manager's actual workflow (scan today's
  // bookings, click into check-in), the list view already serves that
  // better. "Kalender" tab is still one click away for the day-shape view.
  const view = sp.view ?? "list";
  const [rawBookings, rawTherapists, availableRooms] = await Promise.all([
    getBookingsForOutlet(outlet.id, date),
    getTherapistsForOutlet(outlet.id),
    getAvailableRoomsForOutlet(outlet.id),
  ]);
  const roomOptions = availableRooms.map((r) => ({ id: r.id, name: r.name }));
  const bookings = rawBookings.filter((b) => b.status !== "CANCELLED");
  // Was `.slice(0, 8)` — a leftover cap from when mock data always had ≤8
  // therapists per outlet. Real outlets now have 10-11, so the cap was
  // silently dropping real therapists (e.g. Zahra) out of the calendar
  // grid entirely — not a scroll issue, the column never existed. The
  // grid's column count and `.table-wrap`'s horizontal scroll already
  // handle an arbitrary therapist count, so just show everyone.
  const therapists = rawTherapists;
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
            {/*
              Column width scales down as the roster grows instead of staying
              fixed at 148px — a fixed width is why 10-11 real therapists
              always needed horizontal scroll (Melati Puspita and Zahra were
              retired from the roster, but Cikawao/Mekarwangi still run
              8-10 active therapists each). Below the "fits most desktop
              viewports without scrolling" bands, `.table-wrap` still falls
              back to scroll rather than crushing columns unreadably thin.
            */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `56px repeat(${therapists.length}, minmax(${colWidth(therapists.length)}px, 1fr))`,
                minWidth: colWidth(therapists.length) * therapists.length + 56,
              }}
            >
              <div style={{ borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
              {therapists.map((t) => (
                <div key={t.id} className="small strong truncate" style={{ padding: "8px 8px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", color: "var(--text-1)" }} title={`${t.name} · ${t.therapistGrade}`}>
                  <div className="truncate">{t.name}</div>
                  <div className="tiny dim truncate">{t.therapistGrade}</div>
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
              <thead><tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Sumber</th><th>Status</th><th>Aksi</th></tr></thead>
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
                    <td><BookingRowActions bookingId={b.id} status={b.status} rooms={roomOptions} /></td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                      Belum ada booking pada tanggal ini. Tekan &quot;Booking Baru&quot; untuk menambah.
                    </td>
                  </tr>
                )}
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
    // Was a plain <div> with cursor:pointer and no handler — looked
    // clickable, did nothing. Now a real link into the list view for this
    // booking's own date, where BookingRowActions (Check-in / Mulai Sesi)
    // actually lives — the calendar grid itself has no room to fit those
    // controls, so "click a block -> go check it in" has to mean "go to
    // the list", not an action inline on the block.
    <Link
      href={`/manager/bookings?date=${b.date}&view=list`}
      title={`${b.customerName} · ${b.packageName} · ${fmtTime(b.scheduledStart)}-${fmtTime(b.scheduledEnd)} — klik untuk lihat di Daftar`}
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
        display: "block",
      }}
    >
      <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
      <div className="tiny dim truncate">{b.packageName}</div>
    </Link>
  );
}
