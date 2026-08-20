import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, StatusBadge } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { PAYROLL_RUNS, PAYROLL, commissionLiability, savingsLiability, THR_ACCRUALS } from "@/lib/mock";
import { rp, monthLabel } from "@/lib/format";

export default function PayrollLiabilityPage() {
  const currentRun = PAYROLL_RUNS[0];
  const items = PAYROLL.filter((p) => p.period === currentRun.period);
  const byRole: Record<string, number> = {};
  items.forEach((p) => (byRole[p.jobRole] = (byRole[p.jobRole] ?? 0) + p.netPay));
  const roleData = Object.entries(byRole).map(([name, value]) => ({ name, value }));
  const totalSavings = Object.values(savingsLiability).reduce((s, v) => s + v, 0);
  const thrPending = THR_ACCRUALS.filter((t) => t.status === "PRORATA" || t.status === "ELIGIBLE_FULL").reduce((s, t) => s + t.accrued, 0);

  return (
    <>
      <PageHead title="Payroll Liability" desc="Overview kewajiban gaji, komisi, tabungan, dan THR seluruh outlet." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Payroll Berjalan" value={rp(currentRun.net, { short: true })} icon="wallet" toneKey="gold" foot={`${currentRun.employees} karyawan · ${monthLabel(currentRun.period)}`} />
        <StatCard label="Komisi Belum Dibayar" value={rp(commissionLiability(), { short: true })} icon="percent" toneKey="rose" />
        <StatCard label="Liabilitas Tabungan" value={rp(totalSavings, { short: true })} icon="piggy-bank" toneKey="teal" />
        <StatCard label="THR Accrued" value={rp(thrPending, { short: true })} icon="gift" toneKey="amber" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Riwayat Payroll Run" sub="4 periode terakhir" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Periode</th><th>Karyawan</th><th>Gross</th><th>Potongan</th><th>Net</th><th>Status</th></tr></thead>
              <tbody>
                {PAYROLL_RUNS.map((r) => (
                  <tr key={r.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{monthLabel(r.period)}</td>
                    <td className="num">{r.employees}</td>
                    <td className="num">{rp(r.gross, { short: true })}</td>
                    <td className="num muted">-{rp(r.deductions, { short: true })}</td>
                    <td className="num strong">{rp(r.net, { short: true })}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-pad">
          <h3 style={{ marginBottom: 10 }}>Payroll per Role</h3>
          <DonutChart data={roleData} nameKey="name" valueKey="value" centerValue={rp(currentRun.net, { short: true })} centerLabel="Net Payroll" height={168} />
          <div style={{ marginTop: 12 }}>
            <LegendList data={roleData.map((r) => ({ label: r.name, value: rp(r.value, { short: true }) }))} />
          </div>
        </Card>
      </div>

      <Card className="card-pad">
        <div className="row g2" style={{ marginBottom: 10 }}>
          <Icon name="info" size={15} style={{ color: "var(--info)" }} />
          <h4>Payroll {monthLabel(currentRun.period)} menunggu approval</h4>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>
          Gross {rp(currentRun.gross)} · potongan {rp(currentRun.deductions)} · net dibayar {rp(currentRun.net)}.
          Setujui untuk mempublikasikan payslip ke seluruh karyawan.
        </p>
        <div className="row g2">
          <button className="btn btn-primary btn-sm"><Icon name="check-check" size={14} /> Setujui & Publish</button>
          <button className="btn btn-ghost btn-sm">Lihat Detail per Karyawan</button>
        </div>
      </Card>
    </>
  );
}
