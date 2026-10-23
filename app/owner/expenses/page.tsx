import { PageHead, Card, CardHead, StatCard, StatusBadge, Badge } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { DonutChart, LegendList, BarsChart } from "@/components/Charts";
import { ApproveRejectButtons, MarkPaidButton } from "@/components/ExpenseEditor";
import { getOutlets } from "@/lib/data/outlets";
import { getExpensesForOutlet, expenseByCategory, getPettyCash } from "@/lib/data/expenses";
import { rp, fmtDate, monthLabel } from "@/lib/format";
import { todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Owner → Expenses (2026-10-23). Sebelumnya 100% mock dengan tombol
// Setujui/Tolak mati. Sekarang membaca pengeluaran & kas kecil SEMUA outlet
// tenant (RLS: admin/owner tenant-wide) dan owner bisa langsung
// menyetujui, menolak, dan menandai dibayar — memakai aksi yang sama
// dengan portal Manager. Mode demo "Ganti Role" tetap memakai data contoh.
// ---------------------------------------------------------------------

export default async function OwnerExpensesPage() {
  const outlets = await getOutlets();
  const perOutlet = await Promise.all(
    outlets.map(async (outlet) => {
      const [{ expenses, live }, { pettyCash }] = await Promise.all([getExpensesForOutlet(outlet.id), getPettyCash(outlet.id)]);
      return { outlet, expenses, live, pettyCash };
    }),
  );
  const live = perOutlet.some((entry) => entry.live);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));
  const all = perOutlet.flatMap((entry) => entry.expenses).sort((a, b) => b.date.localeCompare(a.date));
  const period = live ? todayIsoDate().slice(0, 7) : "2026-08";
  const pending = all.filter((e) => e.status === "SUBMITTED" || e.status === "DRAFT");
  const awaitingPayment = all.filter((e) => e.status === "APPROVED");
  const byCat = expenseByCategory(all, period);
  const totalThisMonth = byCat.reduce((s, c) => s + c.value, 0);
  const byOutlet = perOutlet.map((entry) => ({
    name: entry.outlet.name,
    value: expenseByCategory(entry.expenses, period).reduce((s, c) => s + c.value, 0),
  }));
  const pettyTotal = perOutlet.reduce((s, entry) => s + entry.pettyCash.balance, 0);

  return (
    <>
      <PageHead title="Expenses" desc={`Biaya operasional & kas kecil seluruh outlet · ${monthLabel(period)}`} />

      {!live && (
        <MockDataNotice>
          Angka di halaman ini contoh tampilan untuk mode demo. Setelah login dengan akun owner, data dan tombol persetujuan memakai data asli.
        </MockDataNotice>
      )}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Biaya Bulan Ini" value={rp(totalThisMonth, { short: true })} icon="receipt" toneKey="rose" />
        <StatCard label="Menunggu Approval" value={pending.length} icon="clock" toneKey="amber" foot={rp(pending.reduce((s, e) => s + e.amount, 0), { short: true })} />
        <StatCard label="Menunggu Dibayar" value={awaitingPayment.length} icon="wallet" toneKey="sky" foot={rp(awaitingPayment.reduce((s, e) => s + e.amount + e.tax, 0), { short: true })} />
        <StatCard label="Kas Kecil (semua outlet)" value={rp(pettyTotal, { short: true })} icon="coins" toneKey="teal" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card className="card-pad">
          <h3 style={{ marginBottom: 10 }}>Biaya per Kategori</h3>
          <DonutChart data={byCat} nameKey="name" valueKey="value" centerValue={rp(totalThisMonth, { short: true })} centerLabel="Total" height={168} />
          <div style={{ marginTop: 12, maxHeight: 160, overflowY: "auto" }}>
            <LegendList data={byCat.map((c) => ({ label: c.name, value: rp(c.value, { short: true }) }))} />
          </div>
        </Card>

        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Biaya per Outlet" sub="Bulan berjalan, tanpa yang ditolak/draft" />
          <div className="card-body">
            <BarsChart data={byOutlet} xKey="name" yKey="value" height={220} color="#fb7185" />
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Kas Kecil per Outlet" sub="Top-up, pengeluaran, dan pengaturan pemegang dilakukan di portal Manager → Expenses" />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Outlet</th><th>Pemegang</th><th className="num">Saldo</th><th className="num">Limit</th><th>Top-up terakhir</th></tr></thead>
            <tbody>
              {perOutlet.map(({ outlet, pettyCash }) => (
                <tr key={outlet.id}>
                  <td>{outlet.name}</td>
                  <td className="muted">{pettyCash.custodianName}</td>
                  <td className="num strong">{rp(pettyCash.balance)}</td>
                  <td className="num">{pettyCash.limit ? rp(pettyCash.limit) : "—"}</td>
                  <td className="muted small">{pettyCash.lastTopUp ? fmtDate(pettyCash.lastTopUp.slice(0, 10)) : "Belum pernah"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Menunggu Approval" sub={`${pending.length} pengajuan`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tanggal</th><th>Outlet</th><th>Kategori</th><th>Vendor</th><th>Deskripsi</th><th>Diajukan</th><th className="num">Jumlah</th><th></th></tr></thead>
            <tbody>
              {pending.map((e) => (
                <tr key={e.id}>
                  <td className="muted small">{fmtDate(e.date)}</td>
                  <td className="small">{outletName.get(e.outletId) ?? "—"}</td>
                  <td><Badge tone="neutral">{e.category}</Badge></td>
                  <td className="muted">{e.vendor}</td>
                  <td className="muted small">{e.description}</td>
                  <td className="muted small">{e.submittedBy}</td>
                  <td className="num strong">{rp(e.amount)}</td>
                  <td>{live ? <ApproveRejectButtons id={e.id} /> : <StatusBadge status={e.status} />}</td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td colSpan={8} className="dim small" style={{ textAlign: "center", padding: "18px 0" }}>Tidak ada pengajuan yang menunggu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Riwayat Biaya" sub={`${all.length} entri · 20 terbaru`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tanggal</th><th>Outlet</th><th>Kategori</th><th>Vendor</th><th>Metode</th><th className="num">Jumlah</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {all.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td className="muted small">{fmtDate(e.date)}</td>
                  <td className="small">{outletName.get(e.outletId) ?? "—"}</td>
                  <td>{e.category}</td>
                  <td className="muted">{e.vendor}</td>
                  <td className="muted small">{e.paymentMethod}</td>
                  <td className="num">{rp(e.amount)}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td style={{ textAlign: "right" }}>{live && e.status === "APPROVED" && <MarkPaidButton id={e.id} viaPettyCash={e.paymentMethod === "Petty Cash"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
