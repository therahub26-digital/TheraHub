import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, StatusBadge } from "@/components/ui";
import { DonutChart, LegendList, BarsChart } from "@/components/Charts";
import { expensesOf, expenseByCategory, OUTLETS, PETTY_CASH } from "@/lib/mock";
import { rp, fmtDate } from "@/lib/format";

export default function OwnerExpensesPage() {
  const all = expensesOf();
  const pending = all.filter((e) => e.status === "SUBMITTED");
  const byCat = expenseByCategory();
  const byOutlet = OUTLETS.map((o) => ({
    name: o.name.replace("Amethyst — ", ""),
    value: expensesOf(o.id).filter((e) => e.status !== "REJECTED" && e.status !== "DRAFT").reduce((s, e) => s + e.amount, 0),
  }));
  const totalThisMonth = byCat.reduce((s, c) => s + c.value, 0);

  return (
    <>
      <PageHead
        title="Expenses"
        desc="Summary dan approval workflow biaya operasional seluruh outlet."
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Input Biaya</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Biaya Bulan Ini" value={rp(totalThisMonth, { short: true })} icon="receipt" toneKey="rose" />
        <StatCard label="Menunggu Approval" value={pending.length} icon="clock" toneKey="amber" foot={rp(pending.reduce((s, e) => s + e.amount, 0), { short: true })} />
        <StatCard label="Petty Cash Total" value={rp(PETTY_CASH.reduce((s, p) => s + p.balance, 0), { short: true })} icon="coins" toneKey="teal" />
        <StatCard label="Kategori Terbesar" value={byCat[0]?.name ?? "-"} icon="tag" toneKey="sky" foot={rp(byCat[0]?.value ?? 0, { short: true })} />
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
          <CardHead title="Biaya per Outlet" />
          <div className="card-body">
            <BarsChart data={byOutlet} xKey="name" yKey="value" height={220} color="#fb7185" />
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Menunggu Approval" sub={`${pending.length} pengajuan`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tanggal</th><th>Kategori</th><th>Vendor</th><th>Deskripsi</th><th>Diajukan</th><th>Jumlah</th><th></th></tr></thead>
            <tbody>
              {pending.map((e) => (
                <tr key={e.id}>
                  <td className="muted small">{fmtDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td className="muted">{e.vendor}</td>
                  <td className="muted small">{e.description}</td>
                  <td className="muted small">{e.submittedBy}</td>
                  <td className="num strong">{rp(e.amount)}</td>
                  <td>
                    <div className="row g1">
                      <button className="btn btn-primary btn-sm">Setujui</button>
                      <button className="btn btn-ghost btn-icon btn-sm"><Icon name="x" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Riwayat Biaya" />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tanggal</th><th>Kategori</th><th>Vendor</th><th>Metode</th><th>Jumlah</th><th>Status</th></tr></thead>
            <tbody>
              {all.slice(0, 14).map((e) => (
                <tr key={e.id}>
                  <td className="muted small">{fmtDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td className="muted">{e.vendor}</td>
                  <td className="muted small">{e.paymentMethod}</td>
                  <td className="num">{rp(e.amount)}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
