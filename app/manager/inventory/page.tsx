import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { PRIMARY_OUTLET, PRODUCTS, movementsOf, lowStock, PURCHASE_ORDERS, STOCK_OPNAMES, TRANSFERS } from "@/lib/mock";
import { rp, fmtDateTime, num } from "@/lib/format";

const MOVE_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: "Penerimaan Barang", SALE: "Penjualan", TREATMENT_USAGE: "Pemakaian Treatment",
  TRANSFER_OUT: "Transfer Keluar", TRANSFER_IN: "Transfer Masuk", ADJUSTMENT: "Penyesuaian",
  STOCK_OPNAME: "Stock Opname", WASTE_DAMAGE: "Rusak/Waste",
};

export default function InventoryPage() {
  const outlet = PRIMARY_OUTLET;
  const products = PRODUCTS;
  const low = lowStock(outlet.id);
  const movements = movementsOf(outlet.id).slice(0, 10);
  const pos = PURCHASE_ORDERS.filter((p) => p.outletId === outlet.id);
  const opnames = STOCK_OPNAMES.filter((o) => o.outletId === outlet.id);
  const transfers = TRANSFERS.filter((t) => t.from === outlet.id || t.to === outlet.id);
  const totalValue = products.reduce((s, p) => s + p.costPrice * (p.stocks[outlet.id] ?? 0), 0);

  return (
    <>
      <PageHead
        title="Inventory"
        desc={`${outlet.name} · Stok produk, consumable, purchase order, transfer, dan stock opname.`}
        actions={
          <>
            <button className="btn btn-ghost btn-sm"><Icon name="arrow-left-right" size={14} /> Transfer</button>
            <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Purchase Order</button>
          </>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total SKU" value={products.length} icon="package" toneKey="teal" deltaLabel="Semua kategori" />
        <StatCard label="Stok Menipis" value={low.length} icon="alert-triangle" toneKey="danger" deltaLabel="Di bawah minimum" />
        <StatCard label="Nilai Inventory" value={rp(totalValue, { short: true })} icon="circle-dollar" toneKey="gold" deltaLabel="Harga cost" />
        <StatCard label="Transfer Berjalan" value={transfers.filter((t) => t.status === "IN_TRANSIT").length} icon="arrow-left-right" toneKey="sky" deltaLabel={`${transfers.length} total transfer`} />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Stok Menipis" sub={`${low.length} produk perlu restock segera`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Produk</th><th>Kategori</th><th>Stok</th><th>Minimum</th><th>Terpakai/bulan</th></tr></thead>
            <tbody>
              {low.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td><PersonCell name={p.name} sub={p.sku} toneKey="danger" size={26} /></td>
                  <td className="muted small">{p.category}</td>
                  <td className="num small" style={{ color: "var(--danger)" }}>{p.stocks[outlet.id]} {p.uom}</td>
                  <td className="num small muted">{p.minStock} {p.uom}</td>
                  <td className="num small muted">{num(p.usedThisMonth)}</td>
                </tr>
              ))}
              {low.length === 0 && (
                <tr><td colSpan={5} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Semua stok dalam batas aman.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Pergerakan Stok Terbaru" sub={`${movements.length} transaksi terakhir`} />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Produk</th><th>Tipe</th><th>Qty</th><th>Waktu</th><th>Oleh</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{m.productName}</td>
                    <td className="muted small">{MOVE_LABEL[m.type] ?? m.type}</td>
                    <td className="num small" style={{ color: m.qty > 0 ? "var(--success)" : "var(--danger)" }}>
                      {m.qty > 0 ? "+" : ""}{m.qty}
                    </td>
                    <td className="muted small">{fmtDateTime(m.postedAt)}</td>
                    <td className="muted small">{m.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Purchase Order" sub={`${pos.length} PO outlet ini`} />
          <div className="card-body stack g2">
            {pos.map((p) => (
              <div key={p.id} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="strong truncate" style={{ color: "var(--text-1)" }}>{p.supplier}</div>
                  <div className="tiny dim">{p.id} · {p.items} item · {rp(p.total, { short: true })}</div>
                </div>
                <Badge tone={p.status === "RECEIVED" ? "success" : p.status === "PARTIAL" ? "warning" : p.status === "DRAFT" ? "neutral" : "info"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Stock Opname" sub={`${opnames.length} sesi opname`} />
          <div className="card-body stack g2">
            {opnames.map((o) => (
              <div key={o.id} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{o.scope}</div>
                  <div className="tiny dim">{o.date} · {o.items} item · {o.by}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="small" style={{ color: o.varianceValue < 0 ? "var(--danger)" : "var(--success)" }}>{rp(o.varianceValue)}</div>
                  <Badge tone={o.status === "POSTED" ? "success" : "neutral"}>{o.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Transfer Antar Outlet" sub={`${transfers.length} transfer terkait outlet ini`} />
          <div className="card-body stack g2">
            {transfers.map((t) => (
              <div key={t.id} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{t.note}</div>
                  <div className="tiny dim">{t.id} · {t.qty} unit · {t.date}</div>
                </div>
                <Badge tone={t.status === "COMPLETED" ? "success" : "info"}>{t.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
