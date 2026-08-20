import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, Progress } from "@/components/ui";
import { PRIMARY_OUTLET, sessionsOf, TODAY, NOW_HHMM } from "@/lib/mock";

export default function SessionMonitorPage() {
  const outlet = PRIMARY_OUTLET;
  const sessions = sessionsOf(outlet.id);
  const running = sessions.filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
  const endingSoon = sessions.filter((s) => s.status === "ENDING_SOON");
  const completed = sessions.filter((s) => s.status === "COMPLETED");

  return (
    <>
      <PageHead
        title="Session Monitor"
        desc={`${outlet.name} · ${TODAY} · Pukul ${NOW_HHMM} · Pantau sesi berjalan untuk persiapan pembayaran.`}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Sesi Aktif" value={running.length} icon="timer" toneKey="teal" deltaLabel="Sedang berjalan" />
        <StatCard label="Akan Selesai" value={endingSoon.length} icon="hourglass" toneKey="amber" deltaLabel="Siapkan struk ≤ 10 menit" />
        <StatCard label="Selesai — Siap Bayar" value={completed.length} icon="credit-card" toneKey="gold" deltaLabel="Menunggu pembayaran" />
      </div>

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
          <CardHead title="Siap Diproses Pembayaran" sub={`${completed.length} sesi selesai`} action={<button className="btn btn-quiet btn-sm">Lihat POS</button>} />
          <div className="card-body stack g2">
            {completed.length === 0 && <div className="small dim">Belum ada sesi yang selesai.</div>}
            {completed.map((s) => (
              <div key={s.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <PersonCell name={s.customerName} sub={`${s.packageName} · ${s.therapistName}`} toneKey="gold" size={28} />
                <div className="row g2">
                  <span className="tiny dim">{s.bookingCode}</span>
                  <button className="btn btn-primary btn-sm"><Icon name="shopping-cart" size={12} /> Bayar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
