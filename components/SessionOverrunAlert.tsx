import Icon from "@/components/Icon";
import { SESSION_OVERDUE_ALERT_MIN, SESSION_OVERDUE_AUTOCLOSE_MIN } from "@/lib/data/sessionOverrunSweep";
import type { SessionRec } from "@/lib/types";

// ---------------------------------------------------------------------
// "sesi yg aktif kalau tidak diclose menggantung terus... alert ke kasir
// setelah lewat 10 menit, tidak ada tindakan juga maka end sesi +15
// menit otomatis closed, kalau tidak ada extend" (user, 2026-08-23).
//
// Server component, not client: unlike ExtensionRequestAlert (which
// needs a live subscription because a NEW request can arrive at any
// moment), overrun state only ever needs to be as fresh as the last
// page load/revalidate — the same info a kasir gets by simply looking
// at "Sesi Berjalan" a little more insistently. No polling, no beep, no
// websocket: just a louder rendering of overdueMin, which
// lib/data/sessions.ts already recomputes on every read.
//
// Sessions here are, by construction, the ones the +15 sweep did NOT
// close — either because they haven't reached 15 yet, or because a
// PENDING extension request is holding them open (see
// sessionOverrunSweep.ts's header for why that suppresses the sweep).
// ---------------------------------------------------------------------

export default function SessionOverrunAlert({ sessions }: { sessions: SessionRec[] }) {
  const overdue = sessions
    .filter((s) => s.overdueMin >= SESSION_OVERDUE_ALERT_MIN)
    .sort((a, b) => b.overdueMin - a.overdueMin);

  if (overdue.length === 0) return null;

  return (
    <div
      className="stack g2"
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--danger-soft)",
        border: "1px solid var(--danger)",
        marginBottom: 16,
      }}
    >
      <div className="row g2" style={{ alignItems: "center" }}>
        <Icon name="hourglass" size={16} style={{ color: "var(--danger)" }} />
        <span className="small bold" style={{ color: "var(--text-1)" }}>
          {overdue.length} sesi sudah lewat waktu — segera selesaikan atau ajukan extension
        </span>
      </div>
      <div className="stack g1">
        {overdue.map((s) => (
          <div key={s.id} className="row between tiny" style={{ paddingLeft: 24 }}>
            <span className="dim">{s.customerName} · {s.therapistName} · {s.roomName}</span>
            <span style={{ color: "var(--danger)" }}>
              {s.overdueMin}m lewat
              {s.overdueMin >= SESSION_OVERDUE_AUTOCLOSE_MIN ? " · menunggu extension" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
