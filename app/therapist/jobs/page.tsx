import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, bookingsOf, TODAY, outletOf } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { fmtTime } from "@/lib/format";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — same bug and same fix as /therapist/shift (see
// that file's header): this page was 100% mock (ME_THERAPIST/bookingsOf/
// TODAY), so every real therapist saw the same fixed mock job list
// regardless of who was actually signed in. Migrated to the same
// dual-mode pattern as /therapist (Beranda).
//
// Action buttons ("Mulai Sesi" etc.) are left presentational here, same
// as before this fix — the real start/complete controls live on
// /therapist/session (already migrated), this page is the day's list.
// ---------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  BOOKED: "Menunggu Tamu", CONFIRMED: "Menunggu Tamu", ARRIVED: "Mulai Sesi", CHECKED_IN: "Mulai Sesi",
  IN_SESSION: "Sedang Berjalan", COMPLETED: "Selesai", PAID: "Selesai",
};

export default async function JobsPage() {
  const signedIn = await getSignedInTherapist();

  if (signedIn) {
    const outlet = await getCurrentOutlet();
    const today = await getEffectiveToday();
    const todaysBookings = await getBookingsForOutlet(outlet.id, today);
    const jobs = todaysBookings.filter(
      (b) => b.therapistId === signedIn.id && b.status !== "CANCELLED" && b.status !== "NO_SHOW"
    );
    const pending = jobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
    const active = jobs.filter((b) => b.status === "IN_SESSION");
    const done = jobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));

    return (
      <MobileShell role="therapist" title="Job Saya" subtitle={`${outlet.name} · ${jobs.length} job hari ini`} avatarName={signedIn.name} avatarTone="teal">
        <div className="stack g4">
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
            </div>
          </div>
        </div>
      </MobileShell>
    );
  }

  // ---- Demo "Ganti Role" viewer: unchanged mock presentation ----------
  const me = ME_THERAPIST;
  const outlet = outletOf(me.outletId);
  const jobs = bookingsOf(me.outletId, TODAY).filter((b) => b.therapistId === me.id && b.status !== "CANCELLED" && b.status !== "NO_SHOW");
  const pending = jobs.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const active = jobs.filter((b) => b.status === "IN_SESSION");
  const done = jobs.filter((b) => ["COMPLETED", "PAID"].includes(b.status));

  return (
    <MobileShell role="therapist" title="Job Saya" subtitle={`${outlet.name} · ${jobs.length} job hari ini`} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
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
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
