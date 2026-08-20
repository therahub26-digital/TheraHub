import { PageHead, Card, CardHead, StatCard } from "@/components/ui";
import { TrendArea, GroupedBars } from "@/components/Charts";
import { MONTHLY_TREND, CONSOLIDATED_PNL, TENANT_PNL, OUTLETS } from "@/lib/mock";
import { rp, pct } from "@/lib/format";

export default function RevenuePage() {
  const pnlSeries = MONTHLY_TREND.map((m) => ({ month: m.month, revenue: m.revenue, profit: m.profit }));

  return (
    <>
      <PageHead title="Revenue & Profitability" desc="P&L style summary dan tren konsolidasi seluruh outlet." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Revenue" value={rp(TENANT_PNL.revenue, { short: true })} icon="circle-dollar" toneKey="gold" />
        <StatCard label="Gross Margin" value={rp(TENANT_PNL.grossMargin, { short: true })} icon="trending-up" toneKey="teal" foot={pct((TENANT_PNL.grossMargin / TENANT_PNL.revenue) * 100)} />
        <StatCard label="Operating Profit" value={rp(TENANT_PNL.operatingProfit, { short: true })} icon="wallet" toneKey="sky" foot={pct((TENANT_PNL.operatingProfit / TENANT_PNL.revenue) * 100)} />
        <StatCard label="COGS + OPEX" value={rp(TENANT_PNL.cogs + TENANT_PNL.opex, { short: true })} icon="receipt" toneKey="rose" />
      </div>

      <Card className="card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Revenue vs Profit — 6 Bulan</h3>
        <TrendArea data={pnlSeries} xKey="month" yKey="revenue" color="#f0b429" height={230} />
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="P&L per Outlet" sub="Bulan berjalan · Agustus 2026" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Outlet</th><th>Revenue</th><th>COGS</th><th>Gross Margin</th><th>Komisi</th><th>Payroll</th><th>OPEX</th><th>Operating Profit</th><th>Margin</th></tr>
            </thead>
            <tbody>
              {CONSOLIDATED_PNL.map((p) => {
                const o = OUTLETS.find((x) => x.id === p.outletId)!;
                return (
                  <tr key={p.outletId}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{o.name.replace("Amethyst — ", "")}</td>
                    <td className="num">{rp(p.revenue, { short: true })}</td>
                    <td className="num muted">{rp(p.cogs, { short: true })}</td>
                    <td className="num">{rp(p.grossMargin, { short: true })}</td>
                    <td className="num muted">{rp(p.commission, { short: true })}</td>
                    <td className="num muted">{rp(p.payroll, { short: true })}</td>
                    <td className="num muted">{rp(p.opex, { short: true })}</td>
                    <td className="num strong" style={{ color: "var(--success)" }}>{rp(p.operatingProfit, { short: true })}</td>
                    <td className="num">{pct(p.margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Struktur Biaya" sub="Komisi, payroll, dan OPEX per outlet" />
        <div className="card-body">
          <GroupedBars
            data={CONSOLIDATED_PNL.map((p) => ({
              name: OUTLETS.find((o) => o.id === p.outletId)!.name.replace("Amethyst — ", ""),
              Komisi: p.commission,
              Payroll: p.payroll,
              OPEX: p.opex,
            }))}
            xKey="name"
            series={[
              { key: "Komisi", label: "Komisi" },
              { key: "Payroll", label: "Payroll" },
              { key: "OPEX", label: "OPEX" },
            ]}
            money
            height={260}
          />
        </div>
      </Card>
    </>
  );
}
