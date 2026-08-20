import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { PRIMARY_OUTLET, transactionsOf, salesBreakdown, sellableProducts, TODAY } from "@/lib/mock";
import { rp, fmtTime } from "@/lib/format";

const ITEM_LABEL: Record<string, string> = {
  SERVICE: "Layanan", EXTENSION: "Extension", ADD_ON: "Add-on", PRODUCT: "Produk", FOOD: "Makanan", BEVERAGE: "Minuman",
};

export default function PosPage() {
  const outlet = PRIMARY_OUTLET;
  const transactions = transactionsOf(outlet.id, TODAY);
  const breakdown = salesBreakdown(outlet.id, TODAY);
  const byType = Object.entries(breakdown.byType).map(([name, value]) => ({ name: ITEM_LABEL[name] ?? name, value }));
  const byMethod = Object.entries(breakdown.byMethod).map(([name, value]) => ({ name, value }));
  const retail = sellableProducts.filter((p) => p.category === "Retail Product" || p.category === "Food & Beverage").slice(0, 6);

  return (
    <>
      <PageHead
        title="POS / Transactions"
        desc={`${outlet.name} · ${TODAY} · Riwayat transaksi kasir dan ringkasan penjualan.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="shopping-cart" size={14} /> Buka POS Kasir</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Transaksi" value={breakdown.count} icon="receipt" toneKey="teal" deltaLabel="Hari ini" />
        <StatCard label="Total Penjualan" value={rp(breakdown.total, { short: true })} icon="circle-dollar" toneKey="gold" deltaLabel="Termasuk pajak & service" />
        <StatCard label="Avg Transaksi" value={rp(breakdown.count ? breakdown.total / breakdown.count : 0, { short: true })} icon="trending-up" toneKey="sky" deltaLabel="Per struk" />
        <StatCard label="Item Retail Rendah" value={retail.filter((p) => p.stocks[outlet.id] < p.minStock).length} icon="package" toneKey="danger" deltaLabel="Perlu restock" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Transaksi Hari Ini" sub={`${transactions.length} struk`} action={<button className="btn btn-quiet btn-sm"><Icon name="download" size={13} /> Export</button>} />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Waktu</th><th>No. Struk</th><th>Customer</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {transactions.slice(0, 12).map((t) => (
                  <tr key={t.id}>
                    <td className="mono small">{fmtTime(t.paidAt)}</td>
                    <td className="mono small">{t.receiptNo}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.customerName}</td>
                    <td className="muted small">{t.cashierName}</td>
                    <td><Badge tone="neutral">{t.paymentMethod}</Badge></td>
                    <td className="num small">{rp(t.total)}</td>
                    <td><Badge tone={t.status === "PAID" ? "success" : t.status === "VOID" ? "danger" : "warning"} dot>{t.status.replace(/_/g, " ")}</Badge></td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={7} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada transaksi hari ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack g5">
          <Card className="card-pad">
            <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Penjualan per Metode</div>
            <DonutChart data={byMethod} nameKey="name" valueKey="value" height={160} centerValue={rp(breakdown.total, { short: true })} centerLabel="Total" />
            <div style={{ marginTop: 10 }}>
              <LegendList data={byMethod.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Penjualan per Kategori Item" sub="Layanan, extension, add-on, produk, F&B" />
          <div className="card-body">
            <LegendList data={byType.map((t) => ({ label: t.name, value: rp(t.value, { short: true }) }))} />
          </div>
        </Card>
        <Card>
          <CardHead title="Produk Retail & F&B" sub="Stok cepat untuk penjualan langsung" />
          <div className="card-body stack g2">
            {retail.map((p) => (
              <div key={p.id} className="row between small">
                <PersonCell name={p.name} sub={`SKU ${p.sku}`} toneKey="sky" size={26} />
                <div style={{ textAlign: "right" }}>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{rp(p.sellPrice ?? 0)}</div>
                  <div className={`tiny ${p.stocks[outlet.id] < p.minStock ? "" : "dim"}`} style={p.stocks[outlet.id] < p.minStock ? { color: "var(--danger)" } : undefined}>
                    Stok {p.stocks[outlet.id]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
