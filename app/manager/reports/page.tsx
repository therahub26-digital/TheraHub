import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, KV } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TrendArea, BarsChart, DonutChart, LegendList } from "@/components/Charts";
import { PRIMARY_OUTLET, revenueSeries, bookingKpi, salesBreakdown, outletPnl, THERAPIST_RANKING, packagesOf, TODAY, CURRENT_PERIOD } from "@/lib/mock";
import { rp, pct, monthLabel } from "@/lib/format";

export default function ReportsPage() {
  const outlet = PRIMARY_OUTLET;
  const series = revenueSeries(outlet.id);
  const kpi = bookingKpi(outlet.id);
  const breakdown = salesBreakdown(outlet.id, TODAY);
  const pnl = outletPnl(outlet.id, CURRENT_PERIOD);
  const topTherapists = THERAPIST_RANKING.filter((t) => t.outletId === outlet.id).slice(0, 6);
  const packages = packagesOf(outlet.id).sort((a, b) => b.popularity - a.popularity).slice(0, 6);
  const byMethod = Object.entries(breakdown.byMethod).map(([name, value]) => ({ name, value }));

  return (
    <>
      <PageHead
        title="Reports"
        desc={`${outlet.name} · ${monthLabel(CURRENT_PERIOD)} · Ringkasan operasional dan profitabilitas outlet.`}
        actions={<button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — ekspor laporan belum dibangun di aplikasi ini."><Icon name="download" size={14} /> Export PDF</button>}
      />

      <MockDataNotice>
        Seluruh angka di halaman ini — Revenue, Operating Profit, No-show Rate, ranking terapis —
        ditulis tetap di kode sebagai contoh tampilan. Halaman ini bahkan tidak mengikuti outlet
        yang sedang Anda gunakan. Untuk angka sungguhan: pendapatan di <strong>Today</strong> dan
        <strong>POS / Transactions</strong>, komisi di <strong>Komisi Terapis</strong>, biaya di
        <strong>Expenses</strong>, performa terapis di <strong>Therapists &amp; Staff</strong>.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Revenue Bulan Ini" value={rp(pnl.revenue, { short: true })} icon="circle-dollar" toneKey="teal" deltaLabel="Termasuk semua kategori item" />
        <StatCard label="Operating Profit" value={rp(pnl.operatingProfit, { short: true })} icon="trending-up" toneKey="gold" deltaLabel={`Margin ${pct(pnl.margin)}`} />
        <StatCard label="Guest Hari Ini" value={kpi.guests} icon="users" toneKey="sky" deltaLabel={`Avg ticket ${rp(kpi.avgTicket, { short: true })}`} />
        <StatCard label="No-show Rate" value={pct(kpi.noShowRate)} icon="user-check" toneKey="danger" deltaLabel={`${kpi.noShow} dari ${kpi.total} booking`} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Tren Revenue 8 Hari" sub="Revenue dari booking berstatus PAID" />
          <TrendArea data={series} xKey="label" yKey="revenue" />
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>P&amp;L Ringkas</div>
          <KV
            items={[
              ["Revenue", rp(pnl.revenue, { short: true })],
              ["COGS", rp(pnl.cogs, { short: true })],
              ["Gross Margin", rp(pnl.grossMargin, { short: true })],
              ["Komisi Terapis", rp(pnl.commission, { short: true })],
              ["Payroll", rp(pnl.payroll, { short: true })],
              ["Opex Lain", rp(pnl.opex, { short: true })],
              ["Operating Profit", rp(pnl.operatingProfit, { short: true })],
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Popularitas Paket" sub="Top 6 paket berdasarkan skor popularitas" />
          <BarsChart data={packages.map((p) => ({ name: p.name, value: p.popularity }))} xKey="name" yKey="value" money={false} horizontal height={240} />
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Metode Pembayaran</div>
          <DonutChart data={byMethod} nameKey="name" valueKey="value" height={160} centerValue={rp(breakdown.total, { short: true })} centerLabel="Total hari ini" />
          <div style={{ marginTop: 10 }}>
            <LegendList data={byMethod.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Ranking Terapis" sub="Diurutkan berdasarkan revenue bulan berjalan" />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Terapis</th><th>Grade</th><th>Tamu</th><th>Revenue</th><th>Komisi</th><th>Utilization</th><th>Rating</th></tr></thead>
            <tbody>
              {topTherapists.map((t) => (
                <tr key={t.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{t.name}</td>
                  <td className="muted small">{t.grade}</td>
                  <td className="num small">{t.guests}</td>
                  <td className="num small">{rp(t.revenue, { short: true })}</td>
                  <td className="num small muted">{rp(t.commission, { short: true })}</td>
                  <td className="num small muted">{pct(t.utilization)}</td>
                  <td className="num small muted">{t.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
