import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, DAY_RANGE, bookingsOf, TODAY, outletOf } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { fmtDayShort, fmtDateLong, fmtTime, addDays } from "@/lib/format";
import type { Booking } from "@/lib/types";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — was 100% mock (ME_THERAPIST/bookingsOf/TODAY),
// unlike /therapist (Beranda, migrated 2026-08-22) and /therapist/session
// (migrated earlier still). User caught this from their own device: the
// avatar here showed "MP" while logged in as Amelia ("AM" everywhere
// else in the app) — ME_THERAPIST is a fixed mock fixture (a retired
// stray demo therapist referenced elsewhere in this codebase's comments
// as "Melati Puspita"), so EVERY real therapist who opened this page saw
// the same wrong name and the same fake job list, no matter who was
// actually signed in.
//
// Same dual-mode convention as every other page: a signed-in therapist
// sees their own real week of bookings; the demo "Ganti Role" viewer
// still sees the original mock fixture, untouched below. There is no
// stored "shift" concept anywhere in the schema (no shift/roster table),
// so "Shift Hari Ini" for the real branch is derived from the day's
// actual jobs (earliest start – latest end) rather than invented.
//
// UPDATE 2026-08-23 (2) — user asked to merge this page with
// /therapist/jobs into a single nav item ("jadwal dan job sebaiknya
// dijadikan satu saja menu saja"): the week day-strip + shift stats from
// this page now sit above the Aktif/Menunggu/Selesai job breakdown that
// used to live on its own page. /therapist/jobs itself now just
// redirects here — see that file. Nav updated in lib/nav.ts to a single
// "Jadwal & Job" entry; Sesi Aktif moved into the main tab bar in its
// place, and Absensi GPS (already reachable from the Beranda dashboard
// card) moved into the "Lainnya" overflow menu.
// ---------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  BOOKED: "Menunggu Tamu", CONFIRMED: "Menunggu Tamu", ARRIVED: "Mulai Sesi", CHECKED_IN: "Mulai Sesi",
  IN_SESSION: "Sedang Berjalan", COMPLETED: "Selesai", PAID: "Selesai",
};

function buildJobsByDay(bookings: Booking[], therapistId: string, week: string[]) {
  return week.map((date) => ({
    date,
    jobs: bookings
      .filter((b) => b.therapistId === therapistId && b.date === date && b.status !== "CANCELLED")
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
  }));
}

export default async function ShiftPage() {
  const signedIn = await getSignedInTherapist();

  if (signedIn) {
    const outlet = await getCurrentOutlet();
    const today = await getEffectiveToday();
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 3));
    const allBookings = await getBookingsForOutlet(outlet.id);
    const jobsByDay = buildJobsByDay(allBookings, signedIn.id, week);
    const todayJobs = jobsByDay.find((d) => d.date === today)?.jobs ?? [];
    const totalMinutes = todayJobs.reduce((s, b) => s + b.durationMin, 0);
    const shiftLabel =
      todayJobs.length > 0
        ? `${fmtTime(todayJobs[0].scheduledStart)}–${fmtTime(todayJobs[todayJobs.length - 1].scheduledEnd)}`
        : "Libur";

    const activeJobs = todayJobs.filter((b) => b.status !== "NO_SHOW");
    const pending = activeJobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
    const active = activeJobs.filter((b) => b.status === "IN_SESSION");
    const done = activeJobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));

    return (
      <MobileShell role="therapist" title="Jadwal & Job" subtitle={outlet.name} avatarName={signedIn.name} avatarTone="teal">
        <div className="stack g4">
          <div className="row g2" style={{ overflowX: "auto", paddingBottom: 4 }}>
            {jobsByDay.map((d) => (
              <div
                key={d.date}
                className="stack g1"
                style={{
                  minWidth: 52,
                  textAlign: "center",
                  padding: "10px 6px",
                  borderRadius: "var(--r-md)",
                  background: d.date === today ? "var(--accent-soft)" : "var(--bg-surface-2)",
                  border: `1px solid ${d.date === today ? "var(--accent)" : "var(--border)"}`,
                  flexShrink: 0,
                }}
              >
                <span className="tiny dim">{fmtDayShort(d.date)}</span>
                <span className="small bold" style={{ color: d.date === today ? "var(--accent)" : "var(--text-1)" }}>{d.date.slice(8)}</span>
                <span className="tiny" style={{ color: d.jobs.length ? "var(--text-3)" : "var(--text-4)" }}>{d.jobs.length ? `${d.jobs.length} job` : "Libur"}</span>
              </div>
            ))}
          </div>

          <div className="row g2">
            <div className="m-stat">
              <div className="m-stat-value">{shiftLabel}</div>
              <div className="tiny dim">Shift Hari Ini</div>
            </div>
            <div className="m-stat">
              <div className="m-stat-value">{todayJobs.length}</div>
              <div className="tiny dim">Job Hari Ini</div>
            </div>
            <div className="m-stat">
              <div className="m-stat-value">{Math.round(totalMinutes / 60 * 10) / 10}j</div>
              <div className="tiny dim">Estimasi Durasi</div>
            </div>
          </div>

          <div className="m-section">{fmtDateLong(today)}</div>

          {active.length > 0 && (
            <div>
              <div className="m-section">Sedang Berjalan</div>
              <div className="stack g2">
                {active.map((b) => (
                  <div key={b.id} className="m-card m-card-tight" style={{ border: "1px solid var(--accent)" }}>
                    <div className="row between" style={{ marginBottom: 6 }}>
                      <span className="small bold" style={{ color: "var(--text-1)" }}>{b.customerName}</span>
                      <Badge tone="accent" dot>Aktif</Badge>
                    </div>
                    <div className="tiny dim">{b.packageName} · {b.roomName || "Room belum ditentukan"} · mulai {fmtTime(b.scheduledStart)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="m-section">Menunggu ({pending.length})</div>
            <div className="stack g2">
              {pending.map((b) => (
                <div key={b.id} className="m-card m-card-tight">
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                      <div className="tiny dim truncate">{b.packageName} · {b.roomName || "Room belum ditentukan"}</div>
                    </div>
                    <div className="tiny bold" style={{ color: "var(--accent)", flexShrink: 0 }}>{fmtTime(b.scheduledStart)}</div>
                  </div>
                  {b.notes && (
                    <div className="tiny" style={{ color: "var(--warning)", marginBottom: 8 }}>
                      <Icon name="info" size={11} /> {b.notes}
                    </div>
                  )}
                  <button className={`m-btn ${["ARRIVED", "CHECKED_IN"].includes(b.status) ? "m-btn-primary" : "m-btn-ghost"}`}>
                    <Icon name={["ARRIVED", "CHECKED_IN"].includes(b.status) ? "play" : "clock"} size={14} />
                    {ACTION_LABEL[b.status]}
                  </button>
                </div>
              ))}
              {pending.length === 0 && <div className="small dim">Tidak ada job yang menunggu.</div>}
            </div>
          </div>

          <div>
            <div className="m-section">Selesai ({done.length})</div>
            <div className="stack g2">
              {done.map((b) => (
                <div key={b.id} className="m-row">
                  <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "var(--success-soft)" }}>
                    <Icon name="check" size={13} style={{ color: "var(--success)" }} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                    <div className="tiny dim truncate">{b.packageName}</div>
                  </div>
                  <span className="tiny dim">{fmtTime(b.scheduledStart)}</span>
                </div>
              ))}
              {done.length === 0 && todayJobs.length === 0 && (
                <div className="m-card m-card-tight" style={{ textAlign: "center" }}>
                  <Icon name="sun" size={20} style={{ color: "var(--text-4)", marginBottom: 6 }} />
                  <div className="small dim">Anda libur hari ini.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: unchanged mock presentation ----------
  const me = ME_THERAPIST;
  const outlet = outletOf(me.outletId);
  const week = DAY_RANGE.slice(4, 11);
  const jobsByDay = week.map((d) => ({
    date: d,
    jobs: bookingsOf(me.outletId, d).filter((b) => b.therapistId === me.id && b.status !== "CANCELLED"),
  }));
  const todayJobs = jobsByDay.find((d) => d.date === TODAY)?.jobs ?? [];
  const totalMinutes = todayJobs.reduce((s, b) => s + b.durationMin, 0);
  const activeJobs = todayJobs.filter((b) => b.status !== "NO_SHOW");
  const pending = activeJobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const active = activeJobs.filter((b) => b.status === "IN_SESSION");
  const done = activeJobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));

  return (
    <MobileShell role="therapist" title="Jadwal & Job" subtitle={outlet.name} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="row g2" style={{ overflowX: "auto", paddingBottom: 4 }}>
          {jobsByDay.map((d) => (
            <div
              key={d.date}
              className="stack g1"
              style={{
                minWidth: 52,
                textAlign: "center",
                padding: "10px 6px",
                borderRadius: "var(--r-md)",
                background: d.date === TODAY ? "var(--accent-soft)" : "var(--bg-surface-2)",
                border: `1px solid ${d.date === TODAY ? "var(--accent)" : "var(--border)"}`,
                flexShrink: 0,
              }}
            >
              <span className="tiny dim">{fmtDayShort(d.date)}</span>
              <span className="small bold" style={{ color: d.date === TODAY ? "var(--accent)" : "var(--text-1)" }}>{d.date.slice(8)}</span>
              <span className="tiny" style={{ color: d.jobs.length ? "var(--text-3)" : "var(--text-4)" }}>{d.jobs.length ? `${d.jobs.length} job` : "Libur"}</span>
            </div>
          ))}
        </div>

        <div className="row g2">
          <div className="m-stat">
            <div className="m-stat-value">{me.shiftToday === "OFF" ? "Libur" : me.shiftToday}</div>
            <div className="tiny dim">Shift Hari Ini</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{todayJobs.length}</div>
            <div className="tiny dim">Job Hari Ini</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value">{Math.round(totalMinutes / 60 * 10) / 10}j</div>
            <div className="tiny dim">Estimasi Durasi</div>
          </div>
        </div>

        <div className="m-section">{fmtDateLong(TODAY)}</div>

        {active.length > 0 && (
          <div>
            <div className="m-section">Sedang Berjalan</div>
            <div className="stack g2">
              {active.map((b) => (
                <div key={b.id} className="m-card m-card-tight" style={{ border: "1px solid var(--accent)" }}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="small bold" style={{ color: "var(--text-1)" }}>{b.customerName}</span>
                    <Badge tone="accent" dot>Aktif</Badge>
                  </div>
                  <div className="tiny dim">{b.packageName} · {b.roomName} · mulai {fmtTime(b.scheduledStart)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="m-section">Menunggu ({pending.length})</div>
          <div className="stack g2">
            {pending.map((b) => (
              <div key={b.id} className="m-card m-card-tight">
                <div className="row between" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                    <div className="tiny dim truncate">{b.packageName} · {b.roomName}</div>
                  </div>
                  <div className="tiny bold" style={{ color: "var(--accent)", flexShrink: 0 }}>{fmtTime(b.scheduledStart)}</div>
                </div>
                {b.notes && (
                  <div className="tiny" style={{ color: "var(--warning)", marginBottom: 8 }}>
                    <Icon name="info" size={11} /> {b.notes}
                  </div>
                )}
                <button className={`m-btn ${["ARRIVED", "CHECKED_IN"].includes(b.status) ? "m-btn-primary" : "m-btn-ghost"}`}>
                  <Icon name={["ARRIVED", "CHECKED_IN"].includes(b.status) ? "play" : "clock"} size={14} />
                  {ACTION_LABEL[b.status]}
                </button>
              </div>
            ))}
            {pending.length === 0 && <div className="small dim">Tidak ada job yang menunggu.</div>}
          </div>
        </div>

        <div>
          <div className="m-section">Selesai ({done.length})</div>
          <div className="stack g2">
            {done.map((b) => (
              <div key={b.id} className="m-row">
                <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "var(--success-soft)" }}>
                  <Icon name="check" size={13} style={{ color: "var(--success)" }} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                  <div className="tiny dim truncate">{b.packageName}</div>
                </div>
                <span className="tiny dim">{fmtTime(b.scheduledStart)}</span>
              </div>
            ))}
            {done.length === 0 && todayJobs.length === 0 && (
              <div className="m-card m-card-tight" style={{ textAlign: "center" }}>
                <Icon name="sun" size={20} style={{ color: "var(--text-4)", marginBottom: 6 }} />
                <div className="small dim">Anda libur hari ini.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
