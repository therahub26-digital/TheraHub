import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, DAY_RANGE, bookingsOf, TODAY, outletOf } from "@/lib/mock";
import { fmtDayShort, fmtDateLong, fmtTime } from "@/lib/format";

export default function ShiftPage() {
  const me = ME_THERAPIST;
  const outlet = outletOf(me.outletId);
  const week = DAY_RANGE.slice(4, 11);
  const jobsByDay = week.map((d) => ({
    date: d,
    jobs: bookingsOf(me.outletId, d).filter((b) => b.therapistId === me.id && b.status !== "CANCELLED"),
  }));
  const todayJobs = jobsByDay.find((d) => d.date === TODAY)?.jobs ?? [];
  const totalMinutes = todayJobs.reduce((s, b) => s + b.durationMin, 0);

  return (
    <MobileShell role="therapist" title="Jadwal Saya" subtitle={outlet.name} avatarName={me.name} avatarTone={me.avatarTone}>
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

        <div>
          <div className="m-section">{fmtDateLong(TODAY)}</div>
          <div className="stack g2">
            {todayJobs.map((b) => (
              <div key={b.id} className="m-row">
                <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
                  <div className="tiny bold" style={{ color: "var(--accent)" }}>{fmtTime(b.scheduledStart)}</div>
                  <div className="tiny dim">{fmtTime(b.scheduledEnd)}</div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{b.customerName}</div>
                  <div className="tiny dim truncate">{b.packageName} · {b.roomName}</div>
                </div>
                <Badge tone="neutral">{b.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
            {todayJobs.length === 0 && (
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
