import { Badge } from "@/components/ui";
import MobileShell from "@/components/MobileShell";
import { ME_THERAPIST } from "@/lib/mock";
import { getCommissionsForTherapist, getEffectivePeriod, getSignedInTherapist } from "@/lib/data/commissions";
import { rp, fmtDateShort, monthLabel } from "@/lib/format";

export default async function CommissionPage() {
  // Live: the therapist who is actually signed in. Demo/"Ganti Role":
  // the ME_THERAPIST persona, so the showcase still has a face. Without
  // this resolution a real therapist would be shown someone else's
  // earnings, which is both wrong and a privacy leak.
  const signedIn = await getSignedInTherapist();
  const me = signedIn ?? ME_THERAPIST;
  const [commissions, period] = await Promise.all([
    getCommissionsForTherapist(me.id),
    getEffectivePeriod(),
  ]);
  const thisMonth = commissions.filter((c) => c.date.startsWith(period));
  const pending = commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const approved = commissions.filter((c) => c.status === "APPROVED" || c.status === "INCLUDED_IN_PAYROLL").reduce((s, c) => s + c.amount, 0);
  const paid = commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amount, 0);
  const total = thisMonth.reduce((s, c) => s + c.amount, 0);
  // The live employee record has no avatar tone column; the mock persona
  // does. Fall back to a fixed tone rather than adding a cosmetic column.
  const avatarTone = signedIn ? "teal" : ME_THERAPIST.avatarTone;

  return (
    <MobileShell role="therapist" title="Komisi Saya" subtitle={monthLabel(period)} avatarName={me.name} avatarTone={avatarTone}>
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
            {commissions.length === 0 && (
              <div className="m-row tiny dim" style={{ justifyContent: "center", padding: "16px 0" }}>
                Belum ada komisi tercatat.
              </div>
            )}
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
