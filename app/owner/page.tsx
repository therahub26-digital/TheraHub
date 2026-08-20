import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, Avatar } from "@/components/ui";
import { TrendArea, BarsChart, DonutChart, LegendList } from "@/components/Charts";
import { OUTLETS, MONTHLY_TREND, CONSOLIDATED_PNL, TENANT_PNL, THERAPIST_RANKING, APPROVALS } from "@/lib/mock";
import { rp, pct } from "@/lib/format";

export default function OwnerDashboard() {
  const outletBars = CONSOLIDATED_PNL.map((p) => ({
    name: OUTLETS.find((o) => o.id === p.outletId)!.name.replace("Amethyst — ", ""),
    revenue: p.revenue,
  }));
  const mix = CONSOLIDATED_PNL.map((p) => ({
    name: OUTLETS.find((o) => o.id === p.outletId)!.name.replace("Amethyst — ", ""),
    value: p.revenue,
  }));
  const topTherapists = THERAPIST_RANKING.slice(0, 5);
  const urgentApprovals = APPROVALS.filter((a) => a.priority === "high").slice(0, 4);

  return (
    <>
      <PageHead
        title="All Outlets KPI"
        desc="Dashboard konsolidasi seluruh outlet Amethyst — periode Agustus 2026."
        actions={
          <>
            <button className="btn btn-ghost btn-sm"><Icon name="download" size={14} /> Export</button>
            <button className="btn btn-primary btn-sm"><Icon name="calendar" size={14} /> Agustus 2026</button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Revenue Konsolidasi" value={rp(TENANT_PNL.revenue, { short: true })} icon="circle-dollar" toneKey="gold" delta={9.2} deltaLabel="vs bulan lalu" />
        <StatCard label="Operating Profit" value={rp(TENANT_PNL.operatingProfit, { short: true })} icon="trending-up" toneKey="teal" delta={11.4} deltaLabel={`Margin ${pct((TENANT_PNL.operatingProfit / TENANT_PNL.revenue) * 100)}`} />
        <StatCard label="Komisi Terapis" value={rp(TENANT_PNL.commission, { short: true })} icon="percent" toneKey="rose" foot="Periode berjalan" />
        <StatCard label="Approval Menunggu" value={APPROVALS.length} icon="check-check" toneKey="amber" foot={`${urgentApprovals.length} prioritas tinggi`} />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "stretch" }}>
        <Card className="card-pad" style={{ gridColumn: "span 2" }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <h3>Tren Revenue & Profit</h3>
              <div className="tiny dim">6 bulan terakhir · konsolidasi 3 outlet</div>
            </div>
            <Badge tone="success" dot>Margin {pct((MONTHLY_TREND.at(-1)!.profit / MONTHLY_TREND.at(-1)!.revenue) * 100)}</Badge>
          </div>
          <TrendArea data={MONTHLY_TREND} xKey="month" yKey="revenue" color="#f0b429" height={230} />
        </Card>

        <Card className="card-pad">
          <h3 style={{ marginBottom: 10 }}>Kontribusi Revenue Outlet</h3>
          <DonutChart data={mix} nameKey="name" valueKey="value" centerValue={rp(TENANT_PNL.revenue, { short: true })} centerLabel="Total" height={168} />
          <div style={{ marginTop: 12 }}>
            <LegendList data={mix.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Perbandingan Outlet" sub="Revenue, margin, dan profit bulan berjalan" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Outlet</th><th>Revenue</th><th>Komisi</th><th>Payroll</th><th>OPEX</th><th>Operating Profit</th><th>Margin</th></tr></thead>
              <tbody>
                {CONSOLIDATED_PNL.map((p) => {
                  const o = OUTLETS.find((x) => x.id === p.outletId)!;
                  return (
                    <tr key={p.outletId}>
                      <td className="strong" style={{ color: "var(--text-1)" }}>{o.name.replace("Amethyst — ", "")}</td>
                      <td className="num">{rp(p.revenue, { short: true })}</td>
                      <td className="num muted">{rp(p.commission, { short: true })}</td>
                      <td className="num muted">{rp(p.payroll, { short: true })}</td>
                      <td className="num muted">{rp(p.opex, { short: true })}</td>
                      <td className="num strong" style={{ color: "var(--success)" }}>{rp(p.operatingProfit, { short: true })}</td>
                      <td className="num">{pct(p.margin)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>Total Konsolidasi</td>
                  <td className="num strong">{rp(TENANT_PNL.revenue, { short: true })}</td>
                  <td className="num muted">{rp(TENANT_PNL.commission, { short: true })}</td>
                  <td className="num muted">{rp(TENANT_PNL.payroll, { short: true })}</td>
                  <td className="num muted">{rp(TENANT_PNL.opex, { short: true })}</td>
                  <td className="num strong" style={{ color: "var(--success)" }}>{rp(TENANT_PNL.operatingProfit, { short: true })}</td>
                  <td className="num">{pct((TENANT_PNL.operatingProfit / TENANT_PNL.revenue) * 100)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Revenue per Outlet" />
          <div className="card-body">
            <BarsChart data={outletBars} xKey="name" yKey="revenue" height={210} color="#f0b429" horizontal />
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="Top Terapis Bulan Ini"
            sub="Berdasarkan revenue generated"
            action={<Link href="/owner/therapists" className="btn btn-quiet btn-sm">Lihat semua <Icon name="arrow-right" size={13} /></Link>}
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Terapis</th><th>Grade</th><th>Tamu</th><th>Revenue</th><th>Utilization</th><th>Rating</th></tr></thead>
              <tbody>
                {topTherapists.map((t) => (
                  <tr key={t.id}>
                    <td><div className="row g2"><Avatar name={t.name} toneKey={t.avatarTone} size={26} /><span className="strong" style={{ color: "var(--text-1)" }}>{t.name}</span></div></td>
                    <td><Badge tone={t.grade === "Master" ? "gold" : t.grade === "Senior" ? "accent" : "neutral"}>{t.grade}</Badge></td>
                    <td className="num">{t.guests}</td>
                    <td className="num strong">{rp(t.revenue, { short: true })}</td>
                    <td className="num">{pct(t.utilization)}</td>
                    <td className="num">★ {t.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Approval Prioritas Tinggi"
            action={<Link href="/owner/approvals" className="btn btn-quiet btn-sm">Semua</Link>}
          />
          <div className="card-body stack g3">
            {urgentApprovals.map((a) => (
              <div key={a.id} className="stack g1" style={{ paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <span className="small bold truncate" style={{ color: "var(--text-1)", maxWidth: 160 }}>{a.title}</span>
                  <Badge tone="danger">{a.type}</Badge>
                </div>
                <div className="tiny dim">{a.requestedBy} {a.amount ? `· ${rp(a.amount, { short: true })}` : ""}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
