import Link from "next/link";
import Icon from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, attendanceToday, bookingsOf, THERAPIST_NOTIFICATIONS, sessionsOf, TODAY, NOW_HHMM } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getSessionForTherapist } from "@/lib/data/sessions";
import { getNotificationsForTherapist } from "@/lib/data/notifications";
import { getTodayAttendanceForTherapist } from "@/lib/data/attendance";
import { getBookingsForOutlet, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { rp, fmtTime } from "@/lib/format";
import { getTenantTheme } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// Live-wired 2026-08-22 (was 100% mock before, unlike /therapist/session
// which was already migrated) — the user caught this directly: "sesi
// sudah aktif tapi di dashboard masih ada sesi berjalan, dan ini
// sepertinya masih mockup". Same dual-mode convention as every other
// page: a signed-in therapist sees their own real bookings/session/
// notifications/attendance; the demo "Ganti Role" viewer still sees
// ME_THERAPIST + mock fixtures, untouched below.
//
// "Rating": no real per-employee rating exists anywhere in
// lib/data/*.ts (only an optional mock-only field on the Employee type).
// Replaced with "Job Menunggu" (upcoming.length) for the real branch
// instead of showing a fabricated number.
//
// "Absensi" card: now real (lib/data/attendance.ts, added after this
// page's first migration pass) — links to /therapist/attendance, which
// owns the actual GPS check-in/check-out button; this card is just
// today's status at a glance, same as the demo card below it.
// ---------------------------------------------------------------------

export default async function TherapistHomePage() {
  // Item 7.27 (2026-08-31): theme, identitas, dan outlet tidak saling
  // bergantung — diambil paralel supaya halaman pertama yang dibuka
  // terapis tidak menunggu tiga rantai berurutan. Keluhan nyatanya:
  // portal lambat sekali saat sinyal jelek, dan tiap await berurutan
  // adalah satu round trip penuh ke Supabase.
  const [theme, signedIn, outlet, today, now] = await Promise.all([
    getTenantTheme(),
    getSignedInTherapist(),
    getCurrentOutlet(),
    getEffectiveToday(),
    getEffectiveNow(),
  ]);
  const me = signedIn ?? ME_THERAPIST;
  const avatarTone = signedIn ? "teal" : ME_THERAPIST.avatarTone;

  if (signedIn) {
    const [todaysBookings, activeSession, notifications, todayAttendance] = await Promise.all([
      getBookingsForOutlet(outlet.id),
      getSessionForTherapist(me.id),
      getNotificationsForTherapist(me.id, outlet.id),
      getTodayAttendanceForTherapist(me.id, me.name, today),
    ]);

    const jobs = todaysBookings.filter((b) => b.therapistId === me.id && b.date === today && b.status !== "CANCELLED");
    const upcoming = jobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
    const done = jobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));
    const unread = notifications.filter((n) => !n.read);
    const todayRevenue = jobs.filter((b) => b.status === "PAID").reduce((s, b) => s + b.price, 0);

    return (
      <MobileShell
        role="therapist" brandKey={theme.brandKey} bgKey={theme.bgKey}
        title={`Halo, ${me.name.split(" ")[0]}`}
        subtitle={`${today} · ${now}`}
        avatarName={me.name} avatarUrl={me.photoUrl}
        avatarTone={avatarTone}
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
              background: todayAttendance?.checkInAt ? "var(--accent-soft)" : "var(--bg-surface-2)",
              border: `1px solid ${todayAttendance?.checkInAt ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <div className="row g2" style={{ marginBottom: 6 }}>
              <Icon name="map-pin-check" size={16} style={{ color: todayAttendance?.checkInAt ? "var(--accent)" : "var(--text-3)" }} />
              <span className="small bold" style={{ color: "var(--text-1)" }}>
                {todayAttendance?.checkOutAt ? "Absensi Selesai" : todayAttendance?.checkInAt ? "Sudah Check-in" : "Belum Check-in"}
              </span>
            </div>
            <div className="tiny dim" style={{ marginBottom: 10 }}>
              {todayAttendance?.checkInAt ? `Check-in ${fmtTime(todayAttendance.checkInAt)} · ${todayAttendance.distanceFromGeofence}m dari outlet` : "Absen sekarang untuk memulai shift hari ini."}
            </div>
            <Link href="/therapist/attendance" className="m-btn m-btn-primary">
              <Icon name="map-pin-check" size={15} /> {todayAttendance?.checkInAt ? "Lihat Absensi" : "Absen Sekarang"}
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
              <div className="m-stat-value">{upcoming.length}</div>
              <div className="tiny dim">Job Menunggu</div>
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
              {upcoming.slice(0, 4).map((b) => {
                // "sudah waktunya" (user, 2026-08-23): a job whose scheduled
                // start has already arrived/passed but the therapist hasn't
                // started it yet gets a distinct warning treatment instead
                // of blending in with jobs that are still comfortably ahead.
                // Links to /therapist/session — that page already knows how
                // to surface "Job Berikutnya" + the Start Session button
                // once the guest is checked in, so this is just the fastest
                // way there rather than a dead informational row.
                const due = fmtTime(b.scheduledStart) <= now;
                return (
                  <Link
                    key={b.id}
                    href="/therapist/session"
                    className="m-list-link"
                    style={due ? { background: "var(--warning-soft)", border: "1px solid var(--warning)" } : undefined}
                  >
                    <span
                      className="stat-icon"
                      style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, ...(due ? { background: "var(--warning)", color: "#1a1200" } : {}) }}
                    >
                      <Icon name={due ? "bell-ring" : "hand-heart"} size={15} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                      <div className="tiny dim truncate">{b.packageName} · {b.roomName}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tiny bold" style={{ color: due ? "var(--warning)" : "var(--accent)" }}>
                        {due ? "Sudah waktunya" : fmtTime(b.scheduledStart)}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {upcoming.length === 0 && <div className="small dim">Tidak ada job tersisa hari ini.</div>}
            </div>
          </div>

          <div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="m-section" style={{ marginBottom: 0 }}>Notifikasi</div>
              <Link href="/therapist/notifications" className="tiny" style={{ color: "var(--accent)" }}>Lihat semua</Link>
            </div>
            <div className="stack g2">
              {notifications.slice(0, 3).map((n) => (
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
              {notifications.length === 0 && <div className="small dim">Tidak ada notifikasi.</div>}
            </div>
          </div>
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: unchanged mock presentation ----------
  // (signedIn is null here, so `me` above already equals ME_THERAPIST.)
  const todayAttendance = attendanceToday(ME_THERAPIST.outletId).find((a) => a.employeeId === me.id);
  const jobs = bookingsOf(ME_THERAPIST.outletId, TODAY).filter((b) => b.therapistId === me.id && b.status !== "CANCELLED");
  const upcoming = jobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const done = jobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));
  const activeSession = sessionsOf(ME_THERAPIST.outletId).find((s) => s.therapistId === me.id && (s.status === "ACTIVE" || s.status === "ENDING_SOON"));
  const unread = THERAPIST_NOTIFICATIONS.filter((n) => !n.read);
  const todayRevenue = jobs.filter((b) => b.status === "PAID").reduce((s, b) => s + b.price, 0);

  return (
    <MobileShell
      role="therapist" brandKey={theme.brandKey} bgKey={theme.bgKey}
      title={`Halo, ${me.name.split(" ")[0]}`}
      subtitle={`${TODAY} · ${NOW_HHMM}`}
      avatarName={me.name} avatarUrl={me.photoUrl}
      avatarTone={ME_THERAPIST.avatarTone}
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
            background: todayAttendance?.status === "CHECKED_IN" ? "var(--accent-soft)" : "var(--bg-surface-2)",
            border: `1px solid ${todayAttendance?.status === "CHECKED_IN" ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          <div className="row g2" style={{ marginBottom: 6 }}>
            <Icon name="map-pin-check" size={16} style={{ color: todayAttendance?.status === "CHECKED_IN" ? "var(--accent)" : "var(--text-3)" }} />
            <span className="small bold" style={{ color: "var(--text-1)" }}>
              {todayAttendance?.status === "CHECKED_IN" ? "Sudah Check-in" : "Belum Check-in"}
            </span>
          </div>
          <div className="tiny dim" style={{ marginBottom: 10 }}>
            {todayAttendance?.checkInAt ? `Check-in ${fmtTime(todayAttendance.checkInAt)} · GPS ${todayAttendance.locationStatus}` : "Absen sekarang untuk memulai shift hari ini."}
          </div>
          <Link href="/therapist/attendance" className="m-btn m-btn-primary">
            <Icon name="map-pin-check" size={15} /> {todayAttendance?.status === "CHECKED_IN" ? "Lihat Absensi" : "Absen Sekarang"}
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
            <div className="m-stat-value">{ME_THERAPIST.rating}</div>
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
            {upcoming.slice(0, 4).map((b) => {
              const due = fmtTime(b.scheduledStart) <= NOW_HHMM;
              return (
                <Link
                  key={b.id}
                  href="/therapist/session"
                  className="m-list-link"
                  style={due ? { background: "var(--warning-soft)", border: "1px solid var(--warning)" } : undefined}
                >
                  <span
                    className="stat-icon"
                    style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, ...(due ? { background: "var(--warning)", color: "#1a1200" } : {}) }}
                  >
                    <Icon name={due ? "bell-ring" : "hand-heart"} size={15} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                    <div className="tiny dim truncate">{b.packageName} · {b.roomName}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tiny bold" style={{ color: due ? "var(--warning)" : "var(--accent)" }}>
                      {due ? "Sudah waktunya" : fmtTime(b.scheduledStart)}
                    </div>
                  </div>
                </Link>
              );
            })}
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
