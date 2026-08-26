import { PageHead, Card, CardHead, StatCard, KV, EmptyState, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TrendArea, BarsChart, DonutChart, LegendList } from "@/components/Charts";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTransactionsForOutlet, isLiveTransactionsData } from "@/lib/data/transactions";
import { getCommissionsForOutlet } from "@/lib/data/commissions";
import { getExpensesForOutlet, expenseByCategory } from "@/lib/data/expenses";
import { getBookingKpi } from "@/lib/data/bookings";
import { rp, pct, monthLabel, fmtDateShort } from "@/lib/format";
import { todayIsoDate, plusDays } from "@/lib/wallclock";
import { toCsv, csvFilename } from "@/lib/csv";
import ExportCsvButton from "@/components/ExportCsvButton";

// ---------------------------------------------------------------------
// UPDATE 2026-08-26 — halaman ini dulu 100% lib/mock (revenueSeries,
// bookingKpi, salesBreakdown, outletPnl, THERAPIST_RANKING, packagesOf)
// dan bahkan tidak mengikuti outlet yang sedang login: `PRIMARY_OUTLET`
// selalu Cikawao. Backlog 5.1 menyebutnya "prioritas tinggi — dipakai
// operasional harian", dan audit 2026-08-23 menandainya sebagai salah
// satu halaman yang seluruh angkanya karangan.
//
// Sekarang seluruh angka dihitung dari data live: transaksi PAID,
// commission_entries, expenses, dan booking KPI — semuanya sudah punya
// read layer yang matang, jadi halaman ini tidak menambah satu pun query
// pola baru, hanya menggabungkan yang sudah ada.
//
// ⚠️ YANG SENGAJA TIDAK DITAMPILKAN, dan kenapa
// ------------------------------------------------
// Versi mock menampilkan "Operating Profit", "COGS", "Gross Margin",
// "Payroll", plus kolom Grade/Utilization/Rating di ranking terapis.
// Semuanya DIHAPUS, bukan diisi angka hasil tebakan:
//
//  - COGS / Gross Margin: `transaction_items` tidak menyimpan snapshot
//    harga modal. Menghitungnya berarti join hidup ke `products.cost`
//    hari ini untuk transaksi bulan lalu — persis "join hidup menulis
//    ulang sejarah" yang sudah dilarang di konvensi komisi
//    (`rule_snapshot`). Kalau COGS mau ditampilkan, yang benar adalah
//    menambah kolom snapshot harga modal di `transaction_items`, bukan
//    menghitungnya di layer tampilan.
//  - Payroll: `payroll_items` sudah MEMUAT komisi sebagai komponen
//    COMMISSION. Menjumlahkan revenue − komisi − payroll akan
//    menghitung komisi dua kali. Karena terapis Amethyst berstatus lepas
//    (penghasilan murni komisi), komisi sudah mewakili beban terapis;
//    payroll ditampilkan di halamannya sendiri.
//  - Grade / Utilization / Rating terapis: `therapist_grade` masih
//    placeholder rata "Junior" (backlog 7.7), dan utilization & rating
//    TIDAK PUNYA SUMBER DATA sama sekali — keduanya field mock murni.
//    Aturan "belum diatur ≠ nol" berlaku: lebih baik kolomnya tidak ada
//    daripada ada tapi bohong.
//
// Karena itu halaman ini tidak lagi mengklaim menyajikan P&L. Yang
// disajikan adalah arus kas operasional kasar (revenue − komisi −
// pengeluaran), dan itu dinyatakan terang-terangan di layar lewat
// InfoNote, bukan disembunyikan di komentar kode ini saja.
//
// Ekspor CSV sekarang HIDUP (menutup sebagian backlog 4.5). Sebelumnya
// tombol Export sengaja dinonaktifkan karena datanya mock: mengekspor
// angka karangan ke file yang bisa dikirim ke akuntan jauh lebih
// berbahaya daripada menampilkannya di layar berbanner — begitu jadi
// file, bannernya hilang. Alasan itu tidak berlaku lagi sekarang.
//
// Konvensi dual-mode sama seperti /manager/expenses: manager yang login
// melihat data asli (termasuk keadaan kosong yang jujur), viewer demo
// "Ganti Role" tetap melihat angka mock.
// ---------------------------------------------------------------------

// Bulan WIB, bukan bulan UTC — tanpa ini, tiap tanggal 1 antara
// 00:00–06:59 WIB halaman menampilkan total bulan LALU sambil berjudul
// bulan berjalan. Kebocoran yang sama sudah ditambal di
// lib/data/inventory.ts dan app/manager/expenses/page.tsx (backlog 7.20).
function currentPeriod(): string {
  return todayIsoDate().slice(0, 7);
}

const TREND_DAYS = 14;

export default async function ReportsPage() {
  const outlet = await getCurrentOutlet();
  const live = await isLiveTransactionsData();
  const period = live ? currentPeriod() : "2026-08";

  const [allTx, commissions, { expenses }, kpi] = await Promise.all([
    getTransactionsForOutlet(outlet.id),
    getCommissionsForOutlet(outlet.id, period),
    getExpensesForOutlet(outlet.id),
    getBookingKpi(outlet.id),
  ]);

  // --- Uang masuk -----------------------------------------------------
  // Hanya transaksi berstatus PAID. VOID/REFUNDED sengaja tidak dihitung
  // sebagai pendapatan, dan PARTIALLY_PAID juga tidak — nilai `total`
  // pada baris itu adalah tagihan, bukan uang yang benar-benar diterima.
  const paidTx = allTx.filter((t) => t.status === "PAID");
  const monthTx = paidTx.filter((t) => t.paidAt.slice(0, 7) === period);
  const revenue = monthTx.reduce((s, t) => s + t.total, 0);

  // --- Uang keluar ----------------------------------------------------
  // Komisi: baris REVERSED dikeluarkan — itu koreksi atas komisi yang
  // dibatalkan, menghitungnya berarti membebankan biaya yang tidak jadi.
  const commissionRows = commissions.filter((c) => c.status !== "REVERSED");
  const commissionTotal = commissionRows.reduce((s, c) => s + c.amount, 0);

  // Pengeluaran: memakai helper yang sama dengan /manager/expenses supaya
  // kedua halaman tidak pernah menampilkan total yang berbeda untuk
  // periode yang sama (helper itu sudah mengecualikan REJECTED & DRAFT).
  const expenseCategories = expenseByCategory(expenses, period);
  const expenseTotal = expenseCategories.reduce((s, c) => s + c.value, 0);

  const netCash = revenue - commissionTotal - expenseTotal;

  // --- Tren harian ----------------------------------------------------
  const trendStart = live ? plusDays(todayIsoDate(), -(TREND_DAYS - 1)) : "2026-08-05";
  const trendDays: string[] = [];
  for (let i = 0; i < TREND_DAYS; i++) trendDays.push(plusDays(trendStart, i));
  const revenueByDay = new Map<string, number>();
  for (const t of paidTx) {
    const d = t.paidAt.slice(0, 10);
    revenueByDay.set(d, (revenueByDay.get(d) ?? 0) + t.total);
  }
  const series = trendDays.map((d) => ({ label: fmtDateShort(d), revenue: revenueByDay.get(d) ?? 0 }));
  const trendHasData = trendDays.some((d) => revenueByDay.has(d));

  // --- Metode pembayaran ----------------------------------------------
  const methodMap = new Map<string, number>();
  for (const t of monthTx) methodMap.set(t.paymentMethod, (methodMap.get(t.paymentMethod) ?? 0) + t.total);
  const byMethod = [...methodMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // --- Item terlaris --------------------------------------------------
  // Diagregasi dari baris transaksi sungguhan, bukan "skor popularitas"
  // yang di versi mock tidak pernah punya rumus.
  const itemMap = new Map<string, { qty: number; value: number }>();
  for (const t of monthTx) {
    for (const it of t.items) {
      const cur = itemMap.get(it.name) ?? { qty: 0, value: 0 };
      cur.qty += it.qty;
      cur.value += it.qty * it.unitPrice;
      itemMap.set(it.name, cur);
    }
  }
  const topItems = [...itemMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, value: v.value }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  // --- Ranking terapis ------------------------------------------------
  // Sesi dihitung dari `bookingCode` UNIK, bukan jumlah baris komisi —
  // satu sesi ber-extension menulis DUA baris komisi (paket + extension),
  // jadi menghitung baris akan menggelembungkan jumlah sesi persis untuk
  // terapis yang paling sering di-extend. Bug yang sama pernah nyata di
  // /therapist/commission dan runPayroll() (Fase 18).
  const therapistMap = new Map<string, { name: string; bookings: Set<string>; commission: number; basis: number }>();
  for (const c of commissionRows) {
    const cur = therapistMap.get(c.therapistId) ?? { name: c.therapistName, bookings: new Set<string>(), commission: 0, basis: 0 };
    cur.commission += c.amount;
    cur.basis += c.basisAmount;
    if (c.bookingCode) cur.bookings.add(c.bookingCode);
    else cur.bookings.add(c.id); // baris tanpa booking (data uji) = satu sesi
    therapistMap.set(c.therapistId, cur);
  }
  const therapistRanking = [...therapistMap.values()]
    .map((t) => ({ name: t.name, sessions: t.bookings.size, commission: t.commission, basis: t.basis }))
    .sort((a, b) => b.basis - a.basis);

  // --- Ekspor CSV -----------------------------------------------------
  // Satu file berisi transaksi PAID periode berjalan, satu baris per
  // transaksi. Mengambil SELURUH baris, bukan hanya yang dirender tabel.
  const txCsv = toCsv(monthTx, [
    { header: "Tanggal", value: (t) => t.paidAt.slice(0, 10) },
    { header: "No Struk", value: (t) => t.receiptNo },
    { header: "Kode Booking", value: (t) => t.bookingCode ?? "" },
    { header: "Pelanggan", value: (t) => t.customerName },
    { header: "Kasir", value: (t) => t.cashierName },
    { header: "Metode", value: (t) => t.paymentMethod },
    { header: "Subtotal", value: (t) => t.subtotal },
    { header: "Diskon", value: (t) => t.discount },
    { header: "Service Charge", value: (t) => t.serviceCharge },
    { header: "Pajak", value: (t) => t.tax },
    { header: "Total", value: (t) => t.total },
  ]);

  return (
    <>
      <PageHead
        title="Reports"
        desc={`${outlet.name} · ${monthLabel(period)} · Ringkasan operasional outlet.`}
        actions={
          <ExportCsvButton
            csv={txCsv}
            filename={csvFilename(`laporan-transaksi-${outlet.code}`, period)}
            rowCount={monthTx.length}
            label="Export CSV"
            emptyReason="Belum ada transaksi lunas di periode ini untuk diekspor."
          />
        }
      />

      {!live && (
        <MockDataNotice>
          Anda sedang melihat mode demo &quot;Ganti Role&quot; — angka di halaman ini berasal dari
          data contoh, bukan dari database. Masuk dengan akun manager sungguhan untuk melihat
          angka outlet Anda.
        </MockDataNotice>
      )}

      {live && (
        <InfoNote tone="info" title="Apa yang dihitung di halaman ini">
          Angka di bawah dihitung dari transaksi <strong>lunas</strong>, komisi terapis, dan
          pengeluaran yang sudah disetujui pada periode berjalan. Ini <strong>bukan laporan laba
          rugi lengkap</strong>: harga modal produk belum disimpan per transaksi, dan payroll tidak
          ikut dijumlahkan karena komisi sudah menjadi komponen di dalamnya — menjumlahkan keduanya
          akan menghitung beban terapis dua kali. Untuk slip gaji, buka <strong>Payroll</strong>.
        </InfoNote>
      )}

      <div className="grid grid-4" style={{ marginBottom: 20, marginTop: 16 }}>
        <StatCard
          label="Pendapatan Bulan Ini"
          value={rp(revenue, { short: true })}
          icon="circle-dollar"
          toneKey="teal"
          deltaLabel={`${monthTx.length} transaksi lunas`}
        />
        <StatCard
          label="Komisi Terapis"
          value={rp(commissionTotal, { short: true })}
          icon="users"
          toneKey="gold"
          deltaLabel={commissionRows.length ? `${commissionRows.length} entri komisi` : "Belum ada entri"}
        />
        <StatCard
          label="Pengeluaran Disetujui"
          value={rp(expenseTotal, { short: true })}
          icon="receipt"
          toneKey="violet"
          deltaLabel={expenseCategories.length ? `${expenseCategories.length} kategori` : "Belum ada pengeluaran"}
        />
        <StatCard
          label="Sisa Kas Operasional"
          value={rp(netCash, { short: true })}
          icon="trending-up"
          toneKey={netCash >= 0 ? "sky" : "danger"}
          deltaLabel="Pendapatan − komisi − pengeluaran"
        />
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Tamu Hari Ini" value={kpi.guests} icon="user-check" toneKey="sky" deltaLabel={`${kpi.paid} booking lunas`} />
        <StatCard label="Rata-rata Struk" value={rp(kpi.avgTicket, { short: true })} icon="circle-dollar" toneKey="teal" deltaLabel="Hari ini" />
        <StatCard
          label="No-show Hari Ini"
          value={kpi.total ? pct(kpi.noShowRate) : "—"}
          icon="user-x"
          toneKey="danger"
          deltaLabel={kpi.total ? `${kpi.noShow} dari ${kpi.total} booking` : "Belum ada booking hari ini"}
        />
        <StatCard label="Batal Hari Ini" value={kpi.cancelled} icon="circle-x" toneKey="warn" deltaLabel={`${kpi.sessions} sesi berjalan/selesai`} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title={`Tren Pendapatan ${TREND_DAYS} Hari`} sub="Total transaksi lunas per hari" />
          {trendHasData ? (
            <TrendArea data={series} xKey="label" yKey="revenue" />
          ) : (
            <EmptyState
              icon="trending-up"
              title="Belum ada transaksi lunas"
              desc={`Tidak ada pembayaran tercatat dalam ${TREND_DAYS} hari terakhir di ${outlet.name}. Grafik akan terisi otomatis begitu kasir menyelesaikan pembayaran pertama.`}
            />
          )}
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Ringkas Kas — {monthLabel(period)}</div>
          <KV
            items={[
              ["Pendapatan (lunas)", rp(revenue, { short: true })],
              ["Komisi terapis", rp(commissionTotal, { short: true })],
              ["Pengeluaran disetujui", rp(expenseTotal, { short: true })],
              ["Sisa kas operasional", rp(netCash, { short: true })],
            ]}
          />
          <div className="tiny dim" style={{ marginTop: 10, lineHeight: 1.5 }}>
            Harga modal produk dan payroll tidak termasuk — lihat catatan di atas.
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Item Terlaris" sub={`Top 6 berdasarkan jumlah terjual · ${monthLabel(period)}`} />
          {topItems.length ? (
            <BarsChart
              data={topItems.map((p) => ({ name: p.name, value: p.qty }))}
              xKey="name"
              yKey="value"
              money={false}
              horizontal
              height={240}
            />
          ) : (
            <EmptyState
              icon="package"
              title="Belum ada item terjual"
              desc="Belum ada baris transaksi di periode ini. Paket, add-on, dan produk yang terjual lewat kasir akan muncul di sini."
            />
          )}
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Metode Pembayaran</div>
          {byMethod.length ? (
            <>
              <DonutChart
                data={byMethod}
                nameKey="name"
                valueKey="value"
                height={160}
                centerValue={rp(revenue, { short: true })}
                centerLabel={monthLabel(period)}
              />
              <div style={{ marginTop: 10 }}>
                <LegendList data={byMethod.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
              </div>
            </>
          ) : (
            <EmptyState icon="credit-card" title="Belum ada pembayaran" desc="Tidak ada transaksi lunas di periode ini." />
          )}
        </Card>
      </div>

      <Card>
        <CardHead
          title="Kontribusi Terapis"
          sub={`Diurutkan berdasarkan nilai layanan yang dikerjakan · ${monthLabel(period)}`}
        />
        {therapistRanking.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Terapis</th>
                  <th>Sesi</th>
                  <th>Nilai Layanan</th>
                  <th>Komisi</th>
                </tr>
              </thead>
              <tbody>
                {therapistRanking.map((t) => (
                  <tr key={t.name}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.name}</td>
                    <td className="num small">{t.sessions}</td>
                    <td className="num small">{rp(t.basis, { short: true })}</td>
                    <td className="num small muted">{rp(t.commission, { short: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="users"
            title="Belum ada komisi tercatat bulan ini"
            desc="Baris komisi dibuat otomatis saat kasir menyelesaikan pembayaran sesi. Kalau pembayaran sudah ada tapi tabel ini tetap kosong, kemungkinan tarif komisi paketnya belum diatur di Catalog."
          />
        )}
      </Card>
    </>
  );
}
