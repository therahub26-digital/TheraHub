import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { getOutlets } from "@/lib/data/outlets";
import { getCommissionsForOutlet, getEffectivePeriod } from "@/lib/data/commissions";
import { rp, fmtDateShort, monthLabel } from "@/lib/format";

// ---------------------------------------------------------------------
// Outlet-level commission view: what the treatments sold this month have
// accrued for each therapist. Reads the same frozen `commission_entries`
// rows the therapist sees on their own phone, so the two can never
// disagree about what someone is owed — the recurring failure mode when
// each screen recomputes earnings from its own copy of the rule.
//
// Approval (PENDING -> APPROVED -> INCLUDED_IN_PAYROLL) is deliberately
// NOT wired here yet: it belongs with the payroll run, which is the next
// module. Showing an "Approve" button that writes a status no payroll
// process consumes would imply a workflow that does not exist.
// ---------------------------------------------------------------------

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "info",
  INCLUDED_IN_PAYROLL: "info",
  PAID: "success",
  ADJUSTED: "neutral",
  REVERSED: "danger",
};

export default async function ManagerCommissionsPage() {
  // First-outlet default, same convention as the other migrated manager
  // pages until real per-user outlet scoping lands (Fase 9).
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  const period = await getEffectivePeriod();
  const commissions = await getCommissionsForOutlet(outlet.id, period);

  const total = commissions.reduce((s, c) => s + c.amount, 0);
  const pending = commissions.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const basis = commissions.reduce((s, c) => s + c.basisAmount, 0);

  // Per-therapist rollup — what a manager actually looks at this page for.
  const byTherapist = new Map<string, { name: string; count: number; amount: number }>();
  for (const c of commissions) {
    const row = byTherapist.get(c.therapistId) ?? { name: c.therapistName, count: 0, amount: 0 };
    row.count += 1;
    row.amount += c.amount;
    byTherapist.set(c.therapistId, row);
  }
  const ranked = [...byTherapist.values()].sort((a, b) => b.amount - a.amount);

  return (
    <>
      <PageHead
        title="Komisi Terapis"
        desc={`${outlet.name} · ${monthLabel(period)} · Komisi yang tercatat dari treatment yang sudah dibayar.`}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Komisi" value={rp(total, { short: true })} icon="percent" toneKey="teal" deltaLabel={`${commissions.length} treatment`} />
        <StatCard label="Menunggu Approval" value={rp(pending, { short: true })} icon="clock" toneKey="amber" deltaLabel="Status PENDING" />
        <StatCard label="Omzet Dasar" value={rp(basis, { short: true })} icon="receipt" toneKey="sky" deltaLabel="Basis perhitungan" />
        <StatCard label="Terapis Aktif" value={ranked.length} icon="users" toneKey="gold" deltaLabel="Punya komisi bulan ini" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card>
          <CardHead title="Per Terapis" sub={`${ranked.length} terapis`} />
          <div className="card-body stack g2">
            {ranked.length === 0 && <div className="small dim">Belum ada komisi bulan ini.</div>}
            {ranked.map((t) => (
              <div key={t.name} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <PersonCell name={t.name} sub={`${t.count} treatment`} toneKey="teal" size={28} />
                <span className="strong" style={{ color: "var(--text-1)" }}>{rp(t.amount)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Rincian Komisi" sub={`${commissions.length} entri · ${monthLabel(period)}`} />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Tanggal</th><th>Terapis</th><th>Layanan</th><th>Booking</th><th>Aturan</th><th>Basis</th><th>Komisi</th><th>Status</th></tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="mono small">{fmtDateShort(c.date)}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{c.therapistName}</td>
                    <td className="muted small">{c.packageName}</td>
                    <td className="mono tiny dim">{c.bookingCode}</td>
                    {/* The rule as it stood when earned — not a live lookup,
                        so a later rate change never restates this row. */}
                    <td className="tiny dim">{c.ruleSnapshot}</td>
                    <td className="num small muted">{rp(c.basisAmount)}</td>
                    <td className="num small strong" style={{ color: "var(--text-1)" }}>{rp(c.amount)}</td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge></td>
                  </tr>
                ))}
                {commissions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                      Belum ada komisi tercatat bulan ini. Komisi tercatat otomatis saat sesi dibayar di kasir —
                      pastikan komisi paket sudah diatur di halaman Catalog.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
