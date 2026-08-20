import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST, commissionsOf, CURRENT_PERIOD } from "@/lib/mock";
import { rp, fmtDateShort, monthLabel } from "@/lib/format";

export default function CommissionPage() {
  const me = ME_THERAPIST;
  const commissions = commissionsOf(me.id);
  const thisMonth = commissions.filter((c) => c.date.startsWith(CURRENT_PERIOD));
  const pending = commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const approved = commissions.filter((c) => c.status === "APPROVED" || c.status === "INCLUDED_IN_PAYROLL").reduce((s, c) => s + c.amount, 0);
  const paid = commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amount, 0);
  const total = thisMonth.reduce((s, c) => s + c.amount, 0);

  return (
    <MobileShell role="therapist" title="Komisi Saya" subtitle={monthLabel(CURRENT_PERIOD)} avatarName={me.name} avatarTone={me.avatarTone}>
      <div className="stack g4">
        <div className="m-card" style={{ textAlign: "center", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
          <div className="tiny dim uppercase" style={{ marginBottom: 4 }}>Total Komisi Bulan Ini</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--text-1)" }}>{rp(total)}</div>
          <div className="tiny dim">{thisMonth.length} sesi tercatat</div>
        </div>

        <div className="row g2">
          <div className="m-stat">
            <div className="m-stat-value" style={{ color: "var(--warning)" }}>{rp(pending, { short: true })}</div>
            <div className="tiny dim">Pending</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value" style={{ color: "var(--info)" }}>{rp(approved, { short: true })}</div>
            <div className="tiny dim">Disetujui</div>
          </div>
          <div className="m-stat">
            <div className="m-stat-value" style={{ color: "var(--success)" }}>{rp(paid, { short: true })}</div>
            <div className="tiny dim">Terbayar</div>
          </div>
        </div>

        <div>
          <div className="m-section">Riwayat Komisi</div>
          <div className="stack g2">
            {commissions.slice(0, 20).map((c) => (
              <div key={c.id} className="m-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny bold truncate" style={{ color: "var(--text-1)" }}>{c.packageName}</div>
                  <div className="tiny dim truncate">{c.bookingCode} · {fmtDateShort(c.date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tiny bold" style={{ color: "var(--text-1)" }}>{rp(c.amount)}</div>
                  <Badge tone={c.status === "PENDING" ? "warning" : c.status === "PAID" ? "success" : "info"}>{c.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
