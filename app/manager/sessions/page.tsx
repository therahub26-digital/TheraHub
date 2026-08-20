import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { PRIMARY_OUTLET, sessionsOf, EXTENSION_REQUESTS, TODAY, NOW_HHMM } from "@/lib/mock";
import { minutesToHm, rp } from "@/lib/format";

const CONFLICT_LABEL: Record<string, string> = {
  CLEAR: "Tidak ada konflik",
  ROOM_CONFLICT: "Konflik room",
  THERAPIST_CONFLICT: "Konflik jadwal terapis",
};

export default function SessionsPage() {
  const outlet = PRIMARY_OUTLET;
  const sessions = sessionsOf(outlet.id);
  const running = sessions.filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
  const endingSoon = sessions.filter((s) => s.status === "ENDING_SOON");
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const requests = EXTENSION_REQUESTS;
  const avgProgress = running.length
    ? Math.round(running.reduce((s, r) => s + r.progressPct, 0) / running.length)
    : 0;

  return (
    <>
      <PageHead
        title="Sessions"
        desc={`${outlet.name} · ${TODAY} · Pukul ${NOW_HHMM} · Monitor sesi berjalan dan permintaan extension`}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Sesi Aktif" value={running.length} icon="timer" toneKey="teal" deltaLabel="Berjalan saat ini" />
        <StatCard label="Akan Berakhir" value={endingSoon.length} icon="hourglass" toneKey="amber" deltaLabel="≤ 10 menit lagi" />
        <StatCard label="Selesai Hari Ini" value={completed.length} icon="check-circle" toneKey="sky" deltaLabel="Sesi tercatat" />
        <StatCard label="Extension Pending" value={requests.filter((r) => r.status === "PENDING").length} icon="clock" toneKey="danger" deltaLabel={`${requests.filter((r) => r.conflictCheck !== "CLEAR").length} dengan konflik`} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Sesi Berjalan" sub={`Rata-rata progres ${avgProgress}%`} />
          <div className="card-body stack g3">
            {running.length === 0 && <div className="small dim">Tidak ada sesi aktif saat ini.</div>}
            {running.map((s) => (
              <div key={s.id} className="stack g2" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
                <div className="between">
                  <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.roomName}`} toneKey="teal" size={30} />
                  <Badge tone={s.status === "ENDING_SOON" ? "warning" : "accent"} dot lg>
                    {s.status === "ENDING_SOON" ? `${s.minutesRemaining}m lagi` : "Aktif"}
                  </Badge>
                </div>
                <Progress value={s.progressPct} tone={s.status === "ENDING_SOON" ? "warn" : undefined} />
                <div className="between tiny dim">
                  <span>{s.therapistName} · mulai {s.actualStart}</span>
                  <span>
                    Estimasi selesai {s.expectedEnd}
                    {s.extensionMinutes > 0 && ` · +${s.extensionMinutes}m extension`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Permintaan Extension" sub={`${requests.filter((r) => r.status === "PENDING").length} menunggu keputusan`} />
          <div className="card-body stack g3">
            {requests.length === 0 && <div className="small dim">Tidak ada permintaan extension.</div>}
            {requests.map((r) => (
              <div key={r.id} className="stack g2" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong truncate" style={{ color: "var(--text-1)" }}>{r.customerName}</div>
                    <div className="tiny dim truncate">{r.bookingCode} · {r.therapistName} · {r.roomName}</div>
                  </div>
                  <Badge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>{r.status}</Badge>
                </div>
                <div className="row between small">
                  <span className="muted">{r.extensionName} ({r.durationMin}m)</span>
                  <span className="strong" style={{ color: "var(--text-1)" }}>{rp(r.price)}</span>
                </div>
                {r.conflictCheck !== "CLEAR" ? (
                  <div className="row g2 tiny" style={{ color: "var(--danger)" }}>
                    <Icon name="alert-triangle" size={12} />
                    {CONFLICT_LABEL[r.conflictCheck]}{r.reason ? ` — ${r.reason}` : ""}
                  </div>
                ) : (
                  <div className="row g2 tiny dim">
                    <Icon name="check-circle" size={12} />
                    {CONFLICT_LABEL[r.conflictCheck]}
                  </div>
                )}
                {r.status === "PENDING" && (
                  <div className="row g2">
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}><Icon name="check" size={13} /> Setujui</button>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}><Icon name="x" size={13} /> Tolak</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Sesi Selesai Hari Ini" sub={`${completed.length} sesi`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th><th>Mulai</th><th>Selesai</th><th>Durasi Aktual</th></tr></thead>
            <tbody>
              {completed.map((s) => (
                <tr key={s.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{s.customerName}</td>
                  <td className="muted small">{s.packageName}</td>
                  <td className="muted small">{s.therapistName}</td>
                  <td className="muted small">{s.roomName}</td>
                  <td className="mono small">{s.actualStart}</td>
                  <td className="mono small">{s.actualEnd ?? "—"}</td>
                  <td className="muted small">{minutesToHm(s.purchasedDurationMin + s.extensionMinutes)}</td>
                </tr>
              ))}
              {completed.length === 0 && (
                <tr><td colSpan={7} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada sesi selesai.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
