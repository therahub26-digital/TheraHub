import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getTransactionsForOutlet, isLiveTransactionsData } from "@/lib/data/transactions";
import { getProducts, getLowStockForOutlet } from "@/lib/data/inventory";
import { rp, fmtTime } from "@/lib/format";
import { toCsv, csvFilename } from "@/lib/csv";
import ExportCsvButton from "@/components/ExportCsvButton";

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
//
// UPDATE 2026-08-26 — bagian "Produk Retail & F&B" ikut jadi data nyata.
// Komentar lama di sini menyatakan "there is no real products/inventory
// table in this schema at all", dan itu memang benar saat ditulis. Migrasi
// 0020 (2026-08-24) membuatnya tidak benar lagi: tabel produk dan stok ada,
// /manager/inventory sudah hidup di atasnya. Kalimat "Modul inventori belum
// dibangun" jadi tertinggal di layar — memberi tahu manager bahwa fitur yang
// SUDAH ADA tidak ada. Alasan menahannya dulu (jangan menyandingkan
// transaksi nyata dengan stok karangan) sekarang justru terbalik: kedua
// sisinya nyata, jadi menahannya yang menyesatkan.
// ---------------------------------------------------------------------

export default async function PosPage() {
  const outlet = await getCurrentOutlet();
  const today = await getEffectiveToday();
  const [transactions, live, products, lowStock] = await Promise.all([
    getTransactionsForOutlet(outlet.id, today),
    isLiveTransactionsData(),
    getProducts(),
    getLowStockForOutlet(outlet.id),
  ]);

  // Ekspor CSV (backlog 4.5, 2026-08-24). Dibangun di server dari baris
  // yang sama yang dirender tabel di bawah — TANPA .slice(0, 12) yang
  // dipakai tampilan, karena batas 12 baris itu murni supaya kartunya
  // tidak kepanjangan di layar; file ekspor harus berisi seluruh transaksi
  // hari itu, bukan 12 teratas. Angka uang sengaja mentah (bukan rp()),
  // lihat catatan format di lib/csv.ts.
  const transactionsCsv = toCsv(transactions, [
    { header: "Waktu", value: (t) => (t.paidAt ? fmtTime(t.paidAt) : "") },
    { header: "No. Struk", value: (t) => t.receiptNo },
    { header: "Kode Booking", value: (t) => t.bookingCode ?? "" },
    { header: "Customer", value: (t) => t.customerName },
    { header: "Kasir", value: (t) => t.cashierName },
    { header: "Metode", value: (t) => t.paymentMethod },
    { header: "Status", value: (t) => t.status },
    { header: "Subtotal", value: (t) => t.subtotal },
    { header: "Diskon", value: (t) => t.discount },
    { header: "Service Charge", value: (t) => t.serviceCharge },
    { header: "Pajak", value: (t) => t.tax },
    { header: "Total", value: (t) => t.total },
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

  // Unit barang (bukan layanan) yang benar-benar terjual hari ini — dihitung
  // dari baris transaksi yang sama, bukan dari stok. Sengaja qty, bukan
  // rupiah: pertanyaan yang dijawab kartu ini adalah "berapa banyak barang
  // berpindah tangan", dan itu yang menentukan kapan stok perlu diisi ulang.
  const RETAIL_KINDS = new Set(["PRODUCT", "FOOD", "BEVERAGE"]);
  const retailUnits = paid.reduce(
    (sum, t) => sum + t.items.filter((it) => RETAIL_KINDS.has(it.itemType)).reduce((s, it) => s + it.qty, 0),
    0
  );

  // Produk yang bisa dijual di outlet ini, diurutkan dari yang stoknya
  // paling tipis — supaya kartunya berguna saat kasir sedang melayani,
  // bukan sekadar daftar abjad.
  const sellable = products
    .filter((p) => p.sellPrice !== null)
    .map((p) => ({ ...p, stock: p.stocks[outlet.id] ?? 0 }))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);
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
        <StatCard
          label="Item Retail Terjual"
          value={retailUnits}
          icon="package"
          toneKey="neutral"
          deltaLabel={lowStock.length ? `${lowStock.length} produk stok menipis` : "Stok dalam batas aman"}
        />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="Transaksi Hari Ini"
            sub={`${transactions.length} struk`}
            action={
              <ExportCsvButton
                csv={transactionsCsv}
                filename={csvFilename(`transaksi-${outlet.code}`, today)}
                rowCount={transactions.length}
                emptyReason="Belum ada transaksi hari ini untuk diekspor."
              />
            }
          />
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
          <CardHead
            title="Produk Retail & F&B"
            sub={sellable.length ? "Stok outlet ini, yang paling tipis di atas" : "Stok cepat untuk penjualan langsung"}
            action={
              <Link href="/manager/inventory" className="btn btn-quiet btn-sm">
                Kelola stok <Icon name="arrow-right" size={13} />
              </Link>
            }
          />
          <div className="card-body">
            {sellable.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Produk</th><th className="num">Harga</th><th className="num">Stok</th></tr>
                  </thead>
                  <tbody>
                    {sellable.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="strong" style={{ color: "var(--text-1)" }}>{p.name}</div>
                          <div className="tiny dim">{p.category} · {p.uom}</div>
                        </td>
                        <td className="num">{p.sellPrice === null ? "—" : rp(p.sellPrice, { short: true })}</td>
                        <td className="num">
                          {p.trackStock ? (
                            <Badge tone={p.stock < p.minStock ? "warning" : "neutral"}>{p.stock}</Badge>
                          ) : (
                            <span className="dim">tidak dilacak</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="small dim" style={{ textAlign: "center", padding: "20px 0" }}>
                Belum ada produk yang bisa dijual di outlet ini. Tambahkan lewat menu Inventory.
              </div>
            )}
          </div>
        </Card>
      </div>

      {!live && (
        <div className="tiny dim" style={{ marginTop: 16 }}>
          Menampilkan data contoh (viewer demo &quot;Ganti Role&quot;) — login sungguhan untuk melihat transaksi outlet ini.
        </div>
      )}
    </>
  );
}
