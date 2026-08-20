import { PageHead, Card, CardHead, StatCard } from "@/components/ui";
import { DonutChart, LegendList, BarsChart } from "@/components/Charts";
import { PRODUCTS, OUTLETS, lowStock, STOCK_OPNAMES, TRANSFERS, outletName } from "@/lib/mock";
import { rp } from "@/lib/format";

export default function OwnerInventoryPage() {
  const stockValueOf = (outletId: string) =>
    PRODUCTS.reduce((s, p) => s + p.stocks[outletId] * p.costPrice, 0);
  const totalValue = OUTLETS.reduce((s, o) => s + stockValueOf(o.id), 0);

  const byCategory = Object.entries(
    PRODUCTS.reduce((acc, p) => {
      const v = OUTLETS.reduce((s, o) => s + p.stocks[o.id] * p.costPrice, 0);
      acc[p.category] = (acc[p.category] ?? 0) + v;
      return acc;
    }, {} as Record<string, number>),
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const byOutlet = OUTLETS.map((o) => ({ name: outletName(o.id), value: stockValueOf(o.id) }));
  const allLow = OUTLETS.flatMap((o) => lowStock(o.id).slice(0, 4).map((p) => ({ ...p, outletId: o.id })));

  return (
    <>
      <PageHead title="Inventory Summary" desc="Ringkasan nilai stok, variance, dan pergerakan antar outlet." />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Nilai Stok Total" value={rp(totalValue, { short: true })} icon="package" toneKey="teal" foot={`${PRODUCTS.length} item master`} />
        <StatCard label="Item Menipis" value={allLow.length} icon="alert-triangle" toneKey="amber" foot="Di bawah minimum stock" />
        <StatCard label="Transfer Antar Outlet" value={TRANSFERS.length} icon="arrow-left-right" toneKey="sky" foot={`${TRANSFERS.filter((t) => t.status === "IN_TRANSIT").length} in transit`} />
        <StatCard label="Variance Opname" value={rp(STOCK_OPNAMES.reduce((s, o) => s + o.varianceValue, 0))} icon="clipboard-check" toneKey="danger" foot="Akumulasi Agustus" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card className="card-pad">
          <h3 style={{ marginBottom: 10 }}>Nilai Stok per Kategori</h3>
          <DonutChart data={byCategory} nameKey="name" valueKey="value" centerValue={rp(totalValue, { short: true })} centerLabel="Total" height={168} />
          <div style={{ marginTop: 12 }}>
            <LegendList data={byCategory.map((c) => ({ label: c.name, value: rp(c.value, { short: true }) }))} />
          </div>
        </Card>

        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Nilai Stok per Outlet" />
          <div className="card-body">
            <BarsChart data={byOutlet} xKey="name" yKey="value" height={220} />
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Peringatan Stok Menipis" sub="Perlu reorder" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Produk</th><th>Outlet</th><th>Stok</th><th>Min</th></tr></thead>
              <tbody>
                {allLow.slice(0, 10).map((p, i) => (
                  <tr key={`${p.id}-${i}`}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{p.name}</td>
                    <td className="muted small">{outletName(p.outletId)}</td>
                    <td className="num" style={{ color: "var(--danger)" }}>{p.stocks[p.outletId]}</td>
                    <td className="num muted">{p.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Stock Opname Terakhir" sub="Variance actual vs expected" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Outlet</th><th>Scope</th><th>Variance</th><th>Nilai</th></tr></thead>
              <tbody>
                {STOCK_OPNAMES.map((o) => (
                  <tr key={o.id}>
                    <td className="mono small">{o.id}</td>
                    <td className="muted small">{outletName(o.outletId)}</td>
                    <td className="muted small">{o.scope}</td>
                    <td className="num" style={{ color: o.variance < 0 ? "var(--danger)" : "var(--success)" }}>{o.variance > 0 ? "+" : ""}{o.variance}</td>
                    <td className="num">{rp(o.varianceValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
