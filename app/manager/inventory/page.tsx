import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell } from "@/components/ui";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getOutlets } from "@/lib/data/outlets";
import {
  getProducts,
  getLowStockForOutlet,
  getMovementsForOutlet,
  getPurchaseOrdersForOutlet,
  getStockOpnamesForOutlet,
  getStockTransfersForOutlet,
} from "@/lib/data/inventory";
import { rp, fmtDateTime, num } from "@/lib/format";
import { NewProductForm, PurchaseOrderForm, ReceivePOButton, StockTransferForm, StockOpnameForm } from "@/components/InventoryEditor";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — was 100% lib/mock (PRODUCTS, movementsOf, lowStock,
// PURCHASE_ORDERS, STOCK_OPNAMES, TRANSFERS), flagged by the user: "coba
// buatkan skemanya?". Introspection of production found the core 4
// tables (products/product_stocks/stock_movements/expenses) already
// existed since baseline 0001 with matching RLS + enums — only
// purchase_orders/stock_transfers/stock_opnames/petty_cash were missing,
// added by supabase/migrations/0020_inventory_expenses.sql.
//
// Same dual-mode convention as the rest of the app: getCurrentOutlet()
// already resolves the signed-in manager's real outlet (or falls back to
// the first outlet for the demo "Ganti Role" viewer); lib/data/inventory.ts
// mirrors that by session, not by row count, so a real tenant with zero
// products yet shows a real EMPTY state instead of borrowing mock
// numbers. "Purchase Order" / "Transfer" / "Stock Opname" / "Produk
// Baru" are now real writes (lib/actions/inventory.ts) instead of the
// old dead buttons.
// ---------------------------------------------------------------------

const MOVE_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: "Penerimaan Barang", SALE: "Penjualan", TREATMENT_USAGE: "Pemakaian Treatment",
  TRANSFER_OUT: "Transfer Keluar", TRANSFER_IN: "Transfer Masuk", ADJUSTMENT: "Penyesuaian",
  STOCK_OPNAME: "Stock Opname", WASTE_DAMAGE: "Rusak/Waste", RETURN_TO_SUPPLIER: "Retur Supplier",
};

export default async function InventoryPage() {
  const outlet = await getCurrentOutlet();
  const [products, low, movements, pos, opnames, transfers, outlets] = await Promise.all([
    getProducts(),
    getLowStockForOutlet(outlet.id),
    getMovementsForOutlet(outlet.id, 10),
    getPurchaseOrdersForOutlet(outlet.id),
    getStockOpnamesForOutlet(outlet.id),
    getStockTransfersForOutlet(outlet.id),
    getOutlets(),
  ]);
  const totalValue = products.reduce((s, p) => s + p.costPrice * (p.stocks[outlet.id] ?? 0), 0);

  return (
    <>
      <PageHead
        title="Inventory"
        desc={`${outlet.name} · Stok produk, consumable, purchase order, transfer, dan stock opname.`}
        actions={
          <>
            <NewProductForm tenantId={outlet.tenantId} />
            <StockTransferForm tenantId={outlet.tenantId} currentOutletId={outlet.id} outlets={outlets.map((o) => ({ id: o.id, name: o.name }))} products={products} />
            <StockOpnameForm outletId={outlet.id} products={products} />
            <PurchaseOrderForm outletId={outlet.id} products={products} />
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
                  <td className="num small" style={{ color: "var(--danger)" }}>{p.stocks[outlet.id] ?? 0} {p.uom}</td>
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
                {movements.length === 0 && (
                  <tr><td colSpan={5} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada pergerakan stok.</td></tr>
                )}
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
                  <div className="tiny dim">{p.code} · {p.itemCount} item · {rp(p.totalAmount, { short: true })}</div>
                </div>
                <div className="stack g1" style={{ alignItems: "flex-end" }}>
                  <Badge tone={p.status === "RECEIVED" ? "success" : p.status === "PARTIAL" ? "warning" : p.status === "DRAFT" ? "neutral" : "info"}>{p.status}</Badge>
                  <ReceivePOButton poId={p.id} status={p.status} />
                </div>
              </div>
            ))}
            {pos.length === 0 && <div className="small dim">Belum ada purchase order.</div>}
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
                  <div className="tiny dim">{o.opnameDate} · {o.itemCount} item · {o.postedBy ?? "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="small" style={{ color: o.varianceValue < 0 ? "var(--danger)" : "var(--success)" }}>{rp(o.varianceValue)}</div>
                  <Badge tone={o.status === "POSTED" ? "success" : "neutral"}>{o.status}</Badge>
                </div>
              </div>
            ))}
            {opnames.length === 0 && <div className="small dim">Belum ada stock opname.</div>}
          </div>
        </Card>
        <Card>
          <CardHead title="Transfer Antar Outlet" sub={`${transfers.length} transfer terkait outlet ini`} />
          <div className="card-body stack g2">
            {transfers.map((t) => (
              <div key={t.id} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{t.note || `${t.fromOutletName} → ${t.toOutletName}`}</div>
                  <div className="tiny dim">{t.code} · {t.totalQty} unit · {t.fromOutletName} → {t.toOutletName}</div>
                </div>
                <Badge tone={t.status === "COMPLETED" ? "success" : "info"}>{t.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
            {transfers.length === 0 && <div className="small dim">Belum ada transfer.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
