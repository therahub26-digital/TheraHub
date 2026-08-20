import Icon from "@/components/Icon";
import { Badge, Progress } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, sessionsOf, bookingsOf, EXTENSION_REQUESTS, TODAY, NOW_HHMM } from "@/lib/mock";
import { minutesToHm, fmtTime } from "@/lib/format";

export default function SessionControlPage() {
  const me = ME_THERAPIST;
  const active = sessionsOf(me.outletId).find((s) => s.therapistId === me.id && (s.status === "ACTIVE" || s.status === "ENDING_SOON"));
  const myExtensions = EXTENSION_REQUESTS.filter((r) => r.therapistName === me.name);
  const nextJob = bookingsOf(me.outletId, TODAY)
    .filter((b) => b.therapistId === me.id && ["ARRIVED", "CHECKED_IN"].includes(b.status))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];

  if (!active) {
    return (
      <MobileShell role="therapist" title="Sesi Aktif" subtitle={`Pukul ${NOW_HHMM}`} avatarName={me.name} avatarTone={me.avatarTone}>
        <div className="stack g4">
          <div className="m-card" style={{ textAlign: "center", padding: "32px 16px" }}>
            <Icon name="timer" size={30} style={{ color: "var(--text-4)", marginBottom: 10 }} />
            <div className="m-title" style={{ marginBottom: 4 }}>Tidak Ada Sesi Aktif</div>
            <div className="tiny dim">Mulai sesi baru saat tamu sudah check-in dan siap dilayani.</div>
          </div>

          {nextJob ? (
            <div className="m-card m-card-tight">
              <div className="m-section">Job Berikutnya</div>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div>
                  <div className="small bold" style={{ color: "var(--text-1)" }}>{nextJob.customerName}</div>
                  <div className="tiny dim">{nextJob.packageName} · {nextJob.roomName}</div>
                </div>
                <span className="tiny bold" style={{ color: "var(--accent)" }}>{fmtTime(nextJob.scheduledStart)}</span>
              </div>
              <button className="m-btn m-btn-primary"><Icon name="play" size={15} /> Mulai Sesi</button>
            </div>
          ) : (
            <div className="small dim" style={{ textAlign: "center" }}>Tidak ada job yang siap dimulai saat ini.</div>
          )}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell role="therapist" title="Sesi Aktif" subtitle={active.bookingCode} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
          <Badge tone={active.status === "ENDING_SOON" ? "warning" : "accent"} dot lg>
            {active.status === "ENDING_SOON" ? "Akan Berakhir" : "Sesi Berjalan"}
          </Badge>
          <div style={{ margin: "16px 0 6px", fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--text-1)" }}>
            {active.minutesRemaining}
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-3)" }}> menit tersisa</span>
          </div>
          <Progress value={active.progressPct} tone={active.status === "ENDING_SOON" ? "warn" : undefined} />
          <div className="tiny dim" style={{ marginTop: 10 }}>
            Mulai {active.actualStart} · Estimasi selesai {active.expectedEnd}
            {active.extensionMinutes > 0 && ` · +${active.extensionMinutes}m extension`}
          </div>
        </div>

        <div className="m-card m-card-tight">
          <div className="m-section">Detail Tamu</div>
          <div className="stack g2">
            <div className="row between tiny"><span className="muted">Tamu</span><span style={{ color: "var(--text-1)" }}>{active.customerName}</span></div>
            <div className="row between tiny"><span className="muted">Layanan</span><span style={{ color: "var(--text-1)" }}>{active.packageName}</span></div>
            <div className="row between tiny"><span className="muted">Room</span><span style={{ color: "var(--text-1)" }}>{active.roomName}</span></div>
            <div className="row between tiny"><span className="muted">Durasi Dibeli</span><span style={{ color: "var(--text-1)" }}>{minutesToHm(active.purchasedDurationMin)}</span></div>
          </div>
        </div>

        <div className="stack g2">
          <button className="m-btn m-btn-primary"><Icon name="check" size={15} /> Selesaikan Sesi</button>
          <button className="m-btn m-btn-ghost"><Icon name="hourglass" size={15} /> Ajukan Extension</button>
        </div>

        {myExtensions.length > 0 && (
          <div>
            <div className="m-section">Riwayat Extension</div>
            <div className="stack g2">
              {myExtensions.map((r) => (
                <div key={r.id} className="m-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tiny bold" style={{ color: "var(--text-1)" }}>{r.extensionName}</div>
                    <div className="tiny dim">{r.bookingCode} · {r.customerName}</div>
                  </div>
                  <Badge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
