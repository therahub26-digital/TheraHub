import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { CompleteSessionButton, ExtensionDecisionButtons } from "@/components/SessionActions";
import ExtensionRequestAlert from "@/components/ExtensionRequestAlert";
import SessionOverrunAlert from "@/components/SessionOverrunAlert";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getSessionsForOutlet, getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { minutesToHm, rp } from "@/lib/format";

// `conflictCheck` is written as 'CLEAR' unconditionally — nothing in the
// codebase actually looks for an overlapping booking before an extension
// is approved (backlog 2.4: whether to build that detection is still the
// user's call). Until it exists, 'CLEAR' means "nobody checked", not
// "checked and clean", and the old wording — "Tidak ada konflik" next to
// a green tick — asserted the opposite of the truth at the exact moment
// the kasir decides. Saying nothing was checked is worse-looking and
// more honest, and it points at the card that can answer the question.
const CONFLICT_LABEL: Record<string, string> = {
  CLEAR: "Belum dicek otomatis — periksa sendiri room & terapis di Sesi Berjalan",
  ROOM_CONFLICT: "Konflik room",
  THERAPIST_CONFLICT: "Konflik jadwal terapis",
};

export default async function SessionsPage() {
  const outlet = await getCurrentOutlet();
  // "Effective" today/now: the real clock for a live session, the frozen
  // demo date for the mock/"Ganti Role" viewer. Shared with the bookings
  // pages so both never disagree about what day it is.
  const [today, now] = await Promise.all([getEffectiveToday(), getEffectiveNow()]);
  const [sessions, requests] = await Promise.all([
    getSessionsForOutlet(outlet.id, today),
    getExtensionRequestsForOutlet(outlet.id),
  ]);
  const pendingExtensions = requests.filter((r) => r.status === "PENDING");
  // Same-day history: decided requests (approved/rejected) from today —
  // split apart from the pending list below per the user's request, same
  // change as app/kasir/sessions/page.tsx.
  const todaysHistory = requests.filter((r) => r.status !== "PENDING" && r.requestedAt.slice(0, 10) === today);

  const running = sessions.filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
  const endingSoon = sessions.filter((s) => s.status === "ENDING_SOON");
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const avgProgress = running.length
    ? Math.round(running.reduce((s, r) => s + r.progressPct, 0) / running.length)
    : 0;

  return (
    <>
      <PageHead
        title="Sessions"
        desc={`${outlet.name} · ${today} · Pukul ${now} · Monitor sesi berjalan dan permintaan extension`}
      />

      <SessionOverrunAlert sessions={running} />
      <ExtensionRequestAlert outletId={outlet.id} pendingCount={pendingExtensions.length} />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Sesi Aktif" value={running.length} icon="timer" toneKey="teal" deltaLabel="Berjalan saat ini" />
        <StatCard label="Akan Berakhir" value={endingSoon.length} icon="hourglass" toneKey="amber" deltaLabel="≤ 10 menit lagi" />
        <StatCard label="Selesai Hari Ini" value={completed.length} icon="check-circle" toneKey="sky" deltaLabel="Sesi tercatat" />
        <StatCard label="Extension Pending" value={pendingExtensions.length} icon="clock" toneKey="danger" deltaLabel="Bentrok belum dicek otomatis" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Sesi Berjalan" sub={running.length ? `Rata-rata progres ${avgProgress}%` : "Belum ada sesi berjalan"} />
          <div className="card-body stack g3">
            {running.length === 0 && (
              <div className="small dim">
                Tidak ada sesi aktif saat ini. Mulai sesi dari halaman Bookings setelah tamu check-in.
              </div>
            )}
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
                <div className="row">
                  <CompleteSessionButton sessionId={s.id} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Permintaan Extension" sub={`${pendingExtensions.length} menunggu keputusan · ${todaysHistory.length} riwayat hari ini`} />
          <div className="card-body stack g4">
            <div className="stack g3">
              {requests.length === 0 && <div className="small dim">Tidak ada permintaan extension.</div>}
              {requests.length > 0 && pendingExtensions.length === 0 && (
                <div className="small dim">Tidak ada permintaan yang menunggu keputusan.</div>
              )}
              {pendingExtensions.map((r) => (
                <div key={r.id} className="stack g2" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <div className="between">
                    <div style={{ minWidth: 0 }}>
                      <div className="small strong truncate" style={{ color: "var(--text-1)" }}>{r.customerName}</div>
                      <div className="tiny dim truncate">{r.bookingCode} · {r.therapistName} · {r.roomName}</div>
                    </div>
                    <Badge tone="warning">{r.status}</Badge>
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
                    <div className="row g2 tiny" style={{ color: "var(--warning)" }}>
                      <Icon name="info" size={12} />
                      {CONFLICT_LABEL[r.conflictCheck]}
                    </div>
                  )}
                  <ExtensionDecisionButtons requestId={r.id} />
                </div>
              ))}
            </div>

            {todaysHistory.length > 0 && (
              <div>
                <div className="m-section" style={{ marginBottom: 8 }}>Riwayat Hari Ini</div>
                <div className="stack g2">
                  {todaysHistory.map((r) => (
                    <div key={r.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: 0.75 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="tiny strong truncate" style={{ color: "var(--text-1)" }}>{r.customerName}</div>
                        <div className="tiny dim truncate">{r.bookingCode} · {r.therapistName} · {r.extensionName} ({r.durationMin}m)</div>
                      </div>
                      <Badge tone={r.status === "APPROVED" ? "success" : "danger"}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
