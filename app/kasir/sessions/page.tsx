import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { PaySessionButton, ExtensionDecisionButtons, CompleteSessionButton } from "@/components/SessionActions";
import ExtensionRequestAlert from "@/components/ExtensionRequestAlert";
import SessionOverrunAlert from "@/components/SessionOverrunAlert";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getSessionsForOutlet, getExtensionRequestsForOutlet } from "@/lib/data/sessions";
import { getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { rp } from "@/lib/format";

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
  // Same-day history: decided requests (approved/rejected) from today —
  // requested per the user, split apart from the pending list below
  // instead of the previous single mixed list ("dibagi 2: yg belum
  // diapprove, dibagian bawahnya history pada hari itu").
  const todaysHistory = requests.filter((r) => r.status !== "PENDING" && r.requestedAt.slice(0, 10) === today);

  const running = sessions
    .filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON")
    // User request 2026-08-23 ("sesi berjalan juga diurutkan terbalik, mana
    // yg sebentar lagi selesai"): soonest-ending session first. Sessions
    // without a resolvable end time (shouldn't happen while running, but
    // defensive) sort to the end instead of crashing the comparator.
    .sort((a, b) => {
      const aEnd = a.expectedEndIso ? Date.parse(a.expectedEndIso) : Infinity;
      const bEnd = b.expectedEndIso ? Date.parse(b.expectedEndIso) : Infinity;
      return aEnd - bEnd;
    });
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

      <SessionOverrunAlert sessions={running} />
      <ExtensionRequestAlert outletId={outlet.id} pendingCount={pendingExtensions.length} />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Sesi Aktif" value={running.length} icon="timer" toneKey="teal" deltaLabel="Sedang berjalan" />
        <StatCard label="Akan Selesai" value={endingSoon.length} icon="hourglass" toneKey="amber" deltaLabel="Siapkan struk ≤ 10 menit" />
        <StatCard label="Selesai — Siap Bayar" value={awaitingPayment.length} icon="credit-card" toneKey="gold" deltaLabel={alreadyPaid.length ? `${alreadyPaid.length} sudah dibayar` : "Menunggu pembayaran"} />
        <StatCard label="Extension Pending" value={pendingExtensions.length} icon="clock" toneKey="danger" deltaLabel="Menunggu keputusan kasir" />
      </div>

      {requests.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead title="Permintaan Extension" sub={`${pendingExtensions.length} menunggu keputusan · ${todaysHistory.length} riwayat hari ini`} />
          <div className="card-body stack g4">
            <div className="stack g3">
              {pendingExtensions.length === 0 && <div className="small dim">Tidak ada permintaan yang menunggu keputusan.</div>}
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
                      {CONFLICT_LABEL[r.conflictCheck]}{r.reason ? ` — ${r.reason}` : ""}
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
                <div className="row">
                  <CompleteSessionButton sessionId={s.id} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Siap Diproses Pembayaran" sub={`${awaitingPayment.length} menunggu · ${alreadyPaid.length} sudah dibayar`} action={<Link href="/kasir/pos" className="btn btn-quiet btn-sm">Lihat POS</Link>} />
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
