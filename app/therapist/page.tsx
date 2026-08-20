import Link from "next/link";
import Icon from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, attendanceToday, bookingsOf, THERAPIST_NOTIFICATIONS, sessionsOf, TODAY, NOW_HHMM } from "@/lib/mock";
import { rp, fmtTime } from "@/lib/format";

export default function TherapistHomePage() {
  const me = ME_THERAPIST;
  const today = attendanceToday(me.outletId).find((a) => a.employeeId === me.id);
  const jobs = bookingsOf(me.outletId, TODAY).filter((b) => b.therapistId === me.id && b.status !== "CANCELLED");
  const upcoming = jobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const done = jobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));
  const activeSession = sessionsOf(me.outletId).find((s) => s.therapistId === me.id && (s.status === "ACTIVE" || s.status === "ENDING_SOON"));
  const unread = THERAPIST_NOTIFICATIONS.filter((n) => !n.read);
  const todayRevenue = jobs.filter((b) => b.status === "PAID").reduce((s, b) => s + b.price, 0);

  return (
    <MobileShell
      role="therapist"
      title={`Halo, ${me.name.split(" ")[0]}`}
      subtitle={`${TODAY} · ${NOW_HHMM}`}
      avatarName={me.name}
      avatarTone={me.avatarTone}
      headerRight={
        <Link href="/therapist/notifications" className="btn btn-quiet btn-icon btn-sm" style={{ position: "relative" }}>
          <Icon name="bell" size={17} />
          {unread.length > 0 && <span className="device-tab-dot" style={{ top: 2, right: 2 }} />}
        </Link>
      }
    >
      <div className="stack g4">
        <div
          className="m-card"
          style={{
            background: today?.status === "CHECKED_IN" ? "var(--accent-soft)" : "var(--bg-surface-2)",
            border: `1px solid ${today?.status === "CHECKED_IN" ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <div className="row g2" style={{ marginBottom: 6 }}>
            <Icon name="map-pin-check" size={16} style={{ color: today?.status === "CHECKED_IN" ? "var(--accent)" : "var(--text-3)" }} />
            <span className="small bold" style={{ color: "var(--text-1)" }}>
              {today?.status === "CHECKED_IN" ? "Sudah Check-in" : "Belum Check-in"}
            </span>
          </div>
          <div className="tiny dim" style={{ marginBottom: 10 }}>
            {today?.checkInAt ? `Check-in ${fmtTime(today.checkInAt)} · GPS ${today.locationStatus}` : "Absen sekarang untuk memulai shift hari ini."}
          </div>
          <Link href="/therapist/attendance" className="m-btn m-btn-primary">
            <Icon name="map-pin-check" size={15} /> {today?.status === "CHECKED_IN" ? "Lihat Absensi" : "Absen Sekarang"}
          </Link>
        </div>

        <div className="row g2">
          <div className="m-stat">
            <div className="m-stat-value">{done.length}</div>
            <div className="tiny dim">Tamu Selesai</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{rp(todayRevenue, { short: true })}</div>
            <div className="tiny dim">Revenue Hari Ini</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{me.rating}</div>
            <div className="tiny dim">Rating</div>
          </div>
        </div>

        {activeSession && (
          <Link href="/therapist/session" className="m-card" style={{ display: "block", border: "1px solid var(--accent)" }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="small bold" style={{ color: "var(--text-1)" }}>Sesi Berjalan</span>
              <Badge tone={activeSession.status === "ENDING_SOON" ? "warning" : "accent"} dot>
                {activeSession.status === "ENDING_SOON" ? `${activeSession.minutesRemaining}m lagi` : "Aktif"}
              </Badge>
            </div>
            <div className="tiny dim" style={{ marginBottom: 8 }}>{activeSession.customerName} · {activeSession.packageName}</div>
            <Progress value={activeSession.progressPct} tone={activeSession.status === "ENDING_SOON" ? "warn" : undefined} />
          </Link>
        )}

        <div>
          <div className="m-section">Job Hari Ini ({upcoming.length} menunggu)</div>
          <div className="stack g2">
            {upcoming.slice(0, 4).map((b) => (
              <div key={b.id} className="m-list-link">
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}>
                  <Icon name="hand-heart" size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                  <div className="tiny dim truncate">{b.packageName} · {b.roomName}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tiny bold" style={{ color: "var(--accent)" }}>{fmtTime(b.scheduledStart)}</div>
                </div>
              </div>
            ))}
            {upcoming.length === 0 && <div className="small dim">Tidak ada job tersisa hari ini.</div>}
          </div>
        </div>

        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="m-section" style={{ marginBottom: 0 }}>Notifikasi</div>
            <Link href="/therapist/notifications" className="tiny" style={{ color: "var(--accent)" }}>Lihat semua</Link>
          </div>
          <div className="stack g2">
            {THERAPIST_NOTIFICATIONS.slice(0, 3).map((n) => (
              <div key={n.id} className="m-row">
                <span
                  className="stat-icon"
                  style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: n.read ? "var(--bg-surface-3)" : "var(--accent-soft)" }}
                >
                  <Icon name="bell" size={13} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{n.title}</div>
                  <div className="tiny dim truncate">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
