import { PageHead, Card, CardHead, StatCard, Badge } from "@/components/ui";
import { TrendArea, MultiLine, DonutChart, LegendList, BarsChart } from "@/components/Charts";
import { PLATFORM_MRR_SERIES, PLATFORM_USAGE_SERIES, PLAN_MIX, TENANTS, PLATFORM_KPI } from "@/lib/mock";
import { rp } from "@/lib/format";

export default function AnalyticsPage() {
  const topRevenue = [...TENANTS].sort((a, b) => b.mrr - a.mrr).slice(0, 6).map((t) => ({ name: t.name.split(" ")[0], revenue: t.mrr }));

  return (
    <>
      <PageHead title="Platform Analytics" desc="Analitik penggunaan dan performa sistem di seluruh tenant." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="MRR" value={rp(PLATFORM_KPI.mrr, { short: true })} icon="circle-dollar" toneKey="gold" delta={12.6} />
        <StatCard label="Active Tenants" value={PLATFORM_KPI.activeTenants} icon="building-2" toneKey="violet" delta={8.3} />
        <StatCard label="Churn Rate" value={`${PLATFORM_KPI.churnRate}%`} icon="trending-down" toneKey="danger" delta={-1.1} />
        <StatCard label="Notification Delivery" value={`${PLATFORM_KPI.notificationDelivery}%`} icon="bell-ring" toneKey="sky" delta={0.4} />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card className="card-pad" style={{ gridColumn: "span 2" }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3>Pendapatan Platform (MRR)</h3>
            <Badge tone="success">+{((PLATFORM_MRR_SERIES.at(-1)!.mrr / PLATFORM_MRR_SERIES[0].mrr - 1) * 100).toFixed(0)}% 12 bulan</Badge>
          </div>
          <TrendArea data={PLATFORM_MRR_SERIES} xKey="month" yKey="mrr" color="#a78bfa" height={240} />
        </Card>

        <Card className="card-pad">
          <h3 style={{ marginBottom: 10 }}>Sumber MRR per Plan</h3>
          <DonutChart
            data={PLAN_MIX}
            nameKey="name"
            valueKey="mrr"
            centerValue={rp(PLATFORM_KPI.mrr, { short: true })}
            centerLabel="Total MRR"
            height={168}
          />
          <div style={{ marginTop: 12 }}>
            <LegendList data={PLAN_MIX.map((p) => ({ label: p.name, value: rp(p.mrr, { short: true }) }))} />
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Volume Penggunaan Harian" sub="Booking, sesi, dan absensi — 14 hari terakhir" />
          <div className="card-body">
            <MultiLine
              data={PLATFORM_USAGE_SERIES}
              xKey="day"
              series={[
                { key: "bookings", label: "Booking" },
                { key: "sessions", label: "Sesi" },
                { key: "attendance", label: "Absensi" },
              ]}
              height={260}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Top 6 Tenant" sub="Berdasarkan MRR" />
          <div className="card-body">
            <BarsChart data={topRevenue} xKey="name" yKey="revenue" height={260} horizontal color="#a78bfa" />
          </div>
        </Card>
      </div>
    </>
  );
}
