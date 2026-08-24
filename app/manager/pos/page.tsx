import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getTransactionsForOutlet, isLiveTransactionsData } from "@/lib/data/transactions";
import { rp, fmtTime } from "@/lib/format";

const ITEM_LABEL: Record<string, string> = {
  SERVICE: "Layanan", EXTENSION: "Extension", ADD_ON: "Add-on", PRODUCT: "Produk", FOOD: "Makanan", BEVERAGE: "Minuman",
};

// ---------------------------------------------------------------------
// Migrated to real data 2026-08-22 (Bug 8, priority #2). Was 100% mock
// (PRIMARY_OUTLET/transactionsOf/salesBreakdown/sellableProducts/TODAY
// from lib/mock) — the actual checkout flow has run through real data
// via /kasir/pos since Bug 4 was fixed, this page was just never wired
// to read it back. lib/data/transactions.ts already had everything
// needed (getTransactionsForOutlet, dual-mode fallback-to-mock for the
// demo "Ganti Role" viewer) — this page just wasn't calling it.
//
// SCOPE: transaction history + sales breakdown (by item type, by payment
// method) are real, computed here from the same rows /kasir/pos writes.
// The "Produk Retail & F&B" section and its low-stock stat are NOT
// migrated — there is no real products/inventory table in this schema
// at all (same gap noted for /manager/inventory in the progress doc),
// so showing real transactions next to fabricated stock numbers would
// look equally authoritative while only one side is true. That section
// stays honestly labeled "belum tersedia" instead, matching the pattern
// already used for Inventory/Expenses elsewhere in this app.
// ---------------------------------------------------------------------

export default async function PosPage() {
  const outlet = await getCurrentOutlet();
  const today = await getEffectiveToday();
  const [transactions, live] = await Promise.all([
    getTransactionsForOutlet(outlet.id, today),
    isLiveTransactionsData(),
  ]);

  const paid = transactions.filter((t) => t.status === "PAID");
  const byType: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const t of paid) {
    for (const it of t.items) {
      byType[it.itemType] = (byType[it.itemType] ?? 0) + it.qty * it.unitPrice;
    }
    byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] ?? 0) + t.total;
  }
  const count = paid.length;
  const total = paid.reduce((s, t) => s + t.total, 0);
  const byTypeList = Object.entries(byType).map(([name, value]) => ({ name: ITEM_LABEL[name] ?? name, value }));
  const byMethodList = Object.entries(byMethod).map(([name, value]) => ({ name, value }));

  return (
    <>
      <PageHead
        title="POS / Transactions"
        desc={`${outlet.name} · ${today} · Riwayat transaksi kasir dan ringkasan penjualan.`}
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — POS hanya bisa dibuka dari akun kasir yang login."><Icon name="shopping-cart" size={14} /> Buka POS Kasir</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Transaksi" value={count} icon="receipt" toneKey="teal" deltaLabel="Hari ini" />
        <StatCard label="Total Penjualan" value={rp(total, { short: true })} icon="circle-dollar" toneKey="gold" deltaLabel="Termasuk pajak & service" />
        <StatCard label="Avg Transaksi" value={rp(count ? total / count : 0, { short: true })} icon="trending-up" toneKey="sky" deltaLabel="Per struk" />
        <StatCard label="Item Retail" value="—" icon="package" toneKey="neutral" deltaLabel="Modul inventori belum dibangun" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Transaksi Hari Ini" sub={`${transactions.length} struk`} action={<button className="btn btn-quiet btn-sm" disabled title="Belum tersedia — ekspor laporan belum dibangun di aplikasi ini."><Icon name="download" size={13} /> Export</button>} />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Waktu</th><th>No. Struk</th><th>Customer</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {transactions.slice(0, 12).map((t) => (
                  <tr key={t.id}>
                    <td className="mono small">{t.paidAt ? fmtTime(t.paidAt) : "—"}</td>
                    <td className="mono small">{t.receiptNo}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.customerName}</td>
                    <td className="muted small">{t.cashierName || "—"}</td>
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
            {byMethodList.length > 0 ? (
              <>
                <DonutChart data={byMethodList} nameKey="name" valueKey="value" height={160} centerValue={rp(total, { short: true })} centerLabel="Total" />
                <div style={{ marginTop: 10 }}>
                  <LegendList data={byMethodList.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
                </div>
              </>
            ) : (
              <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada transaksi PAID hari ini.</div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Penjualan per Kategori Item" sub="Layanan, extension, add-on, produk, F&B" />
          <div className="card-body">
            {byTypeList.length > 0 ? (
              <LegendList data={byTypeList.map((t) => ({ label: t.name, value: rp(t.value, { short: true }) }))} />
            ) : (
              <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada item terjual hari ini.</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Produk Retail & F&B" sub="Stok cepat untuk penjualan langsung" />
          <div className="card-body">
            <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>
              Modul inventori/produk belum dibangun — belum ada data stok real untuk ditampilkan di sini.
            </div>
          </div>
        </Card>
      </div>

      {!live && (
        <div className="tiny dim" style={{ marginTop: 16 }}>
          Menampilkan data contoh (viewer demo "Ganti Role") — login sungguhan untuk melihat transaksi outlet ini.
        </div>
      )}
    </>
  );
}
