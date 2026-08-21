import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, StatusBadge, PersonCell } from "@/components/ui";
import { RunPayrollButton } from "@/components/PayrollControls";
import { getOutlets } from "@/lib/data/outlets";
import { getPayrollForOutlet, getPayrollSettings } from "@/lib/data/payroll";
import { getCommissionsForOutlet, getEffectivePeriod } from "@/lib/data/commissions";
import { activeComponents, splitComponents } from "@/lib/payroll";
import { rp, monthLabel } from "@/lib/format";

// ---------------------------------------------------------------------
// Payroll run + liability view, live.
//
// Renders only the components the outlet actually uses (payroll_settings,
// migration 0005). For Amethyst that is a single column — Komisi — and
// the table is honest about being that narrow rather than padding itself
// with Gaji Pokok / Tunjangan columns of Rp0 that no therapist is owed.
//
// Savings and THR cards from the mock version are GONE, not ported:
// `savings_entries` has no write path and there is no THR accrual
// policy, so those figures could only ever have been fabricated.
// ---------------------------------------------------------------------

export default async function PayrollPage() {
  // Owner is tenant-wide by design (oversees every outlet), not bound to
  // one via app_users.outlet_id the way manager/kasir now are (see
  // getCurrentOutlet(), lib/data/outlets.ts) — so "first outlet" here isn't
  // the same bug that was fixed for manager pages, it's a real open gap:
  // an owner with more than one outlet needs a switcher or an aggregate
  // view across outlets, neither of which exists yet. Cikawao-only is the
  // known limitation until that's built.
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  const period = await getEffectivePeriod();
  const [settings, items, commissions] = await Promise.all([
    getPayrollSettings(outlet.id),
    getPayrollForOutlet(outlet.id, period),
    getCommissionsForOutlet(outlet.id, period),
  ]);

  // Commission earned but not yet rolled into a payslip — the real
  // outstanding liability, computed from actual entries rather than an
  // invented accrual.
  const unpaidCommission = commissions
    .filter((c) => c.status === "PENDING")
    .reduce((s, c) => s + c.amount, 0);

  const components = activeComponents(settings?.components ?? []);
  const { earnings, deductions } = splitComponents(components);
  const totalNet = items.reduce((s, p) => s + p.netPay, 0);

  if (!settings) {
    return (
      <>
        <PageHead title="Payroll" desc={`${outlet.name} · ${monthLabel(period)}`} />
        <Card>
          <CardHead title="Struktur payroll belum diatur" />
          <div className="card-body stack g3">
            <p className="small muted" style={{ maxWidth: 560 }}>
              Payroll belum bisa dihitung karena belum ada keputusan komponen apa saja yang
              membentuk slip gaji di outlet ini. Ini sengaja tidak ditebak — menebaknya berarti
              menetapkan kebijakan gaji atas nama bisnis Anda.
            </p>
            <div>
              <Link className="btn btn-primary btn-sm" href="/manager/payroll-settings">
                <Icon name="sliders-horizontal" size={13} /> Atur Struktur Payroll
              </Link>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Payroll"
        desc={`${outlet.name} · ${monthLabel(period)} · ${components.map((c) => c.label).join(" + ")}`}
        actions={<RunPayrollButton outletId={outlet.id} period={period} />}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Take-Home" value={rp(totalNet, { short: true })} icon="wallet" toneKey="gold" deltaLabel={`${items.length} payslip`} />
        <StatCard label="Komisi Belum Masuk Payroll" value={rp(unpaidCommission, { short: true })} icon="percent" toneKey="rose" deltaLabel="Status PENDING" />
        <StatCard label="Komponen Aktif" value={components.length} icon="sliders-horizontal" toneKey="teal" deltaLabel={components.map((c) => c.label).join(", ")} />
        <StatCard label="Periode" value={monthLabel(period)} icon="calendar-days" toneKey="sky" deltaLabel={settings.periodType === "MONTHLY" ? "Bulanan" : settings.periodType} />
      </div>

      {settings.note && (
        <Card style={{ marginBottom: 20 }}>
          <div className="card-body small muted">
            <Icon name="info" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {settings.note}
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title="Slip Gaji Periode Ini"
          sub={items.length ? `${items.length} karyawan` : "Belum dihitung — tekan Hitung Payroll"}
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Peran</th>
                {earnings.map((c) => <th key={c.key}>{c.label}</th>)}
                {deductions.map((c) => <th key={c.key}>{c.label}</th>)}
                <th>Take-Home</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td><PersonCell name={p.employeeName} toneKey="teal" size={26} /></td>
                  <td className="muted small">{p.jobRole}</td>
                  {earnings.map((c) => (
                    <td key={c.key} className="num small">{rp(Number(p[c.field] ?? 0))}</td>
                  ))}
                  {deductions.map((c) => (
                    <td key={c.key} className="num small muted">-{rp(Number(p[c.field] ?? 0))}</td>
                  ))}
                  <td className="num small strong" style={{ color: "var(--text-1)" }}>{rp(p.netPay)}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4 + earnings.length + deductions.length} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                    Belum ada payslip untuk {monthLabel(period)}. Tekan <strong>Hitung Payroll</strong> untuk
                    membuatnya dari komisi yang tercatat periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
