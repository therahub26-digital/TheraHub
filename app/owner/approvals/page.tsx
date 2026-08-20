import Icon from "@/components/Icon";
import { PageHead, Card, Badge, StatCard } from "@/components/ui";
import { APPROVALS, outletName } from "@/lib/mock";
import { rp, fmtDateTime } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  Payroll: "wallet", Expense: "receipt", Refund: "rotate-ccw", Discount: "percent",
  "Stock Adjustment": "package", Extension: "timer", Attendance: "map-pin-check",
};

export default function ApprovalsPage() {
  const high = APPROVALS.filter((a) => a.priority === "high");
  const totalAmount = APPROVALS.reduce((s, a) => s + (a.amount ?? 0), 0);

  return (
    <>
      <PageHead title="Approvals" desc="Antrian persetujuan payroll, biaya, refund, discount, dan penyesuaian stok." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Menunggu" value={APPROVALS.length} icon="check-check" toneKey="amber" />
        <StatCard label="Prioritas Tinggi" value={high.length} icon="alert-triangle" toneKey="danger" />
        <StatCard label="Nilai Terkait" value={rp(totalAmount, { short: true })} icon="circle-dollar" toneKey="gold" />
        <StatCard label="Rata-rata Waktu Respons" value="4,2" unit=" jam" icon="clock" toneKey="teal" />
      </div>

      <div className="row g2 wrap" style={{ marginBottom: 16 }}>
        <span className="chip on">Semua ({APPROVALS.length})</span>
        {Array.from(new Set(APPROVALS.map((a) => a.type))).map((t) => (
          <span key={t} className="chip">{t} ({APPROVALS.filter((a) => a.type === t).length})</span>
        ))}
      </div>

      <div className="stack g3">
        {APPROVALS.map((a) => (
          <Card key={a.id} className="card-pad" hover>
            <div className="row between wrap g4" style={{ alignItems: "flex-start" }}>
              <div className="row g3" style={{ minWidth: 0, flex: 1 }}>
                <span
                  className="stat-icon"
                  style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: a.priority === "high" ? "var(--danger-soft)" : a.priority === "medium" ? "var(--warning-soft)" : "var(--bg-surface-3)",
                    color: a.priority === "high" ? "var(--danger)" : a.priority === "medium" ? "var(--warning)" : "var(--text-3)",
                  }}
                >
                  <Icon name={TYPE_ICON[a.type] ?? "circle-check"} size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="row g2 wrap" style={{ marginBottom: 3 }}>
                    <span className="strong" style={{ color: "var(--text-1)" }}>{a.title}</span>
                    <Badge tone={a.priority === "high" ? "danger" : a.priority === "medium" ? "warning" : "neutral"}>{a.priority}</Badge>
                    <Badge tone="info">{a.type}</Badge>
                  </div>
                  <div className="small muted" style={{ marginBottom: 4 }}>{a.detail}</div>
                  <div className="tiny dim">
                    {a.requestedBy} · {outletName(a.outletId)} · {fmtDateTime(a.requestedAt)}
                  </div>
                </div>
              </div>

              <div className="row g3" style={{ flexShrink: 0 }}>
                {a.amount !== null && (
                  <div className="right">
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-1)" }}>
                      {rp(a.amount, { short: true })}
                    </div>
                    <div className="tiny dim">nilai pengajuan</div>
                  </div>
                )}
                <div className="row g2">
                  <button className="btn btn-ghost btn-sm"><Icon name="x" size={13} /> Tolak</button>
                  <button className="btn btn-primary btn-sm"><Icon name="check" size={13} /> Setujui</button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
