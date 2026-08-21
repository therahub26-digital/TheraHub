import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { PaySessionButton, ExtensionDecisionButtons } from "@/components/SessionActions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getSessionsForOutlet, getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { rp } from "@/lib/format";

const CONFLICT_LABEL: Record<string, string> = {
  CLEAR: "Tidak ada konflik",
  ROOM_CONFLICT: "Konflik room",
  THERAPIST_CONFLICT: "Konflik jadwal terapis",
};

export default async function SessionMonitorPage() {
  // Same first-outlet default + effective-today convention as the other
  // migrated pages (see Fase 9 in the roadmap for real per-user scoping).
  const outlet = await getCurrentOutlet();
  const [today, now] = await Promise.all([getEffectiveToday(), getEffectiveNow()]);
  const [sessions, requests] = await Promise.all([
    getSessionsForOutlet(outlet.id, today),
    getExtensionRequestsForOutlet(outlet.id),
  ]);
  const pendingExtensions = requests.filter((r) => r.status === "PENDING");

  const running = sessions.filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
  const endingSoon = sessions.filter((s) => s.status === "ENDING_SOON");
  // A completed session is only the CASHIER'S problem until it has been
  // billed. Session status stays COMPLETED forever, so without the
  // isPaid split an already-paid guest reappears in the payment queue on
  // every refresh — and a kasir working down that list would charge them
  // twice. (The server-side guard in payForSession() blocks the second
  // charge, but the queue should not be inviting it in the first place.)
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const awaitingPayment = completed.filter((s) => !s.isPaid);
  const alreadyPaid = completed.filter((s) => s.isPaid);

  return (
    <>
      <PageHead
        title="Session Monitor"
        desc={`${outlet.name} · ${today} · Pukul ${now} · Pantau sesi berjalan untuk persiapan pembayaran.`}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Sesi Aktif" value={running.length} icon="timer" toneKey="teal" deltaLabel="Sedang berjalan" />
        <StatCard label="Akan Selesai" value={endingSoon.length} icon="hourglass" toneKey="amber" deltaLabel="Siapkan struk ≤ 10 menit" />
        <StatCard label="Selesai — Siap Bayar" value={awaitingPayment.length} icon="credit-card" toneKey="gold" deltaLabel={alreadyPaid.length ? `${alreadyPaid.length} sudah dibayar` : "Menunggu pembayaran"} />
        <StatCard label="Extension Pending" value={pendingExtensions.length} icon="clock" toneKey="danger" deltaLabel="Menunggu keputusan kasir" />
      </div>

      {requests.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead title="Permintaan Extension" sub={`${pendingExtensions.length} menunggu keputusan`} />
          <div className="card-body stack g3">
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
                    {CONFLICT_LABEL[r.conflictCheck]}{r.reason ? ` — ${r.reason}` : ""}
                  </div>
                )}
                {r.status === "PENDING" && <ExtensionDecisionButtons requestId={r.id} />}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Sesi Berjalan" sub="Urutkan berdasarkan waktu selesai" />
          <div className="card-body stack g3">
            {running.length === 0 && <div className="small dim">Tidak ada sesi aktif.</div>}
            {running.map((s) => (
              <div key={s.id} className="stack g2" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
                <div className="between">
                  <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.roomName}`} toneKey="teal" size={28} />
                  <Badge tone={s.status === "ENDING_SOON" ? "warning" : "accent"} dot>
                    {s.status === "ENDING_SOON" ? `${s.minutesRemaining}m lagi` : "Aktif"}
                  </Badge>
                </div>
                <Progress value={s.progressPct} tone={s.status === "ENDING_SOON" ? "warn" : undefined} />
                <div className="tiny dim">{s.therapistName} · estimasi selesai {s.expectedEnd}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Siap Diproses Pembayaran" sub={`${awaitingPayment.length} menunggu · ${alreadyPaid.length} sudah dibayar`} action={<button className="btn btn-quiet btn-sm">Lihat POS</button>} />
          <div className="card-body stack g2">
            {completed.length === 0 && <div className="small dim">Belum ada sesi yang selesai.</div>}
            {completed.length > 0 && awaitingPayment.length === 0 && (
              <div className="small dim">Semua sesi hari ini sudah dibayar.</div>
            )}
            {awaitingPayment.map((s) => (
              <div key={s.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.therapistName}`} toneKey="gold" size={28} />
                <div className="row g2" style={{ alignItems: "center" }}>
                  <span className="tiny dim">{s.bookingCode}</span>
                  <PaySessionButton sessionId={s.id} />
                </div>
              </div>
            ))}

            {alreadyPaid.length > 0 && (
              <>
                <div className="tiny dim" style={{ marginTop: 8 }}>Sudah dibayar hari ini</div>
                {alreadyPaid.map((s) => (
                  <div key={s.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: 0.65 }}>
                    <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.therapistName}`} toneKey="teal" size={28} />
                    <div className="row g2" style={{ alignItems: "center" }}>
                      <span className="tiny dim">{s.bookingCode}</span>
                      <Badge tone="success" dot>Lunas</Badge>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
