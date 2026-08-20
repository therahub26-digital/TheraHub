import Icon from "@/components/Icon";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, THERAPIST_NOTIFICATIONS } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";

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
};

export default function TherapistNotificationsPage() {
  const me = ME_THERAPIST;
  const notifications = THERAPIST_NOTIFICATIONS;

  return (
    <MobileShell
      role="therapist"
      title="Notifikasi"
      subtitle={`${notifications.filter((n) => !n.read).length} belum dibaca`}
      avatarName={me.name}
      avatarTone={me.avatarTone}
    >
      <div className="stack g2">
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
