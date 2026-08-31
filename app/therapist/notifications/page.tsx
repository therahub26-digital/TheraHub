import Icon from "@/components/Icon";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST } from "@/lib/mock";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getNotificationsForTherapist, MOCK_NOTIFICATIONS } from "@/lib/data/notifications";
import { fmtDateTime } from "@/lib/format";
import { getTenantTheme } from "@/lib/data/tenant";

const SEVERITY_BG: Record<string, string> = {
  info: "var(--info-soft)",
  success: "var(--success-soft)",
  warning: "var(--warning-soft)",
  danger: "var(--danger-soft)",
};
const SEVERITY_FG: Record<string, string> = {
  info: "var(--info)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)",
};
const TYPE_ICON: Record<string, string> = {
  "job.assigned": "list-todo", "extension.approved": "check-circle", "attendance.ok": "map-pin-check",
  "commission.approved": "percent", "shift.changed": "calendar-clock",
  // Live alerts (2026-08-21) — computed at read time, see lib/data/notifications.ts.
  "shift.upcoming": "clock", "session.ending": "hourglass",
};

export default async function TherapistNotificationsPage() {
  const theme = await getTenantTheme();
  const signedIn = await getSignedInTherapist();
  const me = signedIn ?? ME_THERAPIST;
  const avatarTone = signedIn ? "teal" : ME_THERAPIST.avatarTone;

  let notifications = MOCK_NOTIFICATIONS;
  if (signedIn) {
    const outlet = await getCurrentOutlet();
    notifications = await getNotificationsForTherapist(me.id, outlet.id);
  }

  return (
    <MobileShell
      role="therapist" brandKey={theme.brandKey} bgKey={theme.bgKey}
      title="Notifikasi"
      subtitle={`${notifications.filter((n) => !n.read).length} belum dibaca`}
      avatarName={me.name} avatarUrl={me.photoUrl}
      avatarTone={avatarTone}
    >
      <div className="stack g2">
        {notifications.length === 0 && (
          <div className="small dim" style={{ textAlign: "center", padding: "28px 0" }}>
            Tidak ada notifikasi. Pemberitahuan muncul di sini menjelang job berikutnya
            dan saat sesi Anda hampir berakhir.
          </div>
        )}
        {notifications.map((n) => (
          <div key={n.id} className="m-list-link" style={{ alignItems: "flex-start", opacity: n.read ? 0.72 : 1 }}>
            <span
              className="stat-icon"
              style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: SEVERITY_BG[n.severity] }}
            >
              <Icon name={TYPE_ICON[n.type] ?? "bell"} size={15} style={{ color: SEVERITY_FG[n.severity] }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{n.title}</div>
              <div className="tiny dim" style={{ marginBottom: 3 }}>{n.body}</div>
              <div className="tiny dim">{fmtDateTime(n.at)} · {n.channel}</div>
            </div>
            {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </MobileShell>
  );
}
