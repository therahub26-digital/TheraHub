import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { PRIMARY_OUTLET, expensesOf, expenseByCategory, PETTY_CASH, CURRENT_PERIOD } from "@/lib/mock";
import { rp, fmtDateShort, monthLabel } from "@/lib/format";

export default function ExpensesPage() {
  const outlet = PRIMARY_OUTLET;
  const expenses = expensesOf(outlet.id);
  const thisMonth = expenses.filter((e) => e.date.startsWith(CURRENT_PERIOD));
  const pending = expenses.filter((e) => e.status === "SUBMITTED" || e.status === "DRAFT");
  const petty = PETTY_CASH.find((p) => p.outletId === outlet.id)!;
  const byCategory = expenseByCategory(outlet.id, CURRENT_PERIOD);
  const total = byCategory.reduce((s, c) => s + c.value, 0);

  return (
    <>
      <PageHead
        title="Expenses"
        desc={`${outlet.name} · ${monthLabel(CURRENT_PERIOD)} · Pengeluaran operasional dan petty cash.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Catat Pengeluaran</button>}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Bulan Ini" value={rp(total, { short: true })} icon="wallet" toneKey="teal" deltaLabel={`${thisMonth.length} entri`} />
        <StatCard label="Menunggu Approval" value={pending.length} icon="clock" toneKey="danger" deltaLabel="Draft & submitted" />
        <StatCard label="Kas Kecil" value={rp(petty.balance, { short: true })} icon="piggy-bank" toneKey="gold" deltaLabel={`Limit ${rp(petty.limit, { short: true })}`} />
        <StatCard label="Custodian" value={petty.custodian.split(" ")[0]} icon="user" toneKey="sky" deltaLabel={`Top-up terakhir ${fmtDateShort(petty.lastTopUp)}`} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Riwayat Pengeluaran" sub={`${expenses.length} entri`} action={<button className="btn btn-quiet btn-sm"><Icon name="download" size={13} /> Export</button>} />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tanggal</th><th>Kategori</th><th>Vendor</th><th>Metode</th><th>Jumlah</th><th>Status</th></tr></thead>
              <tbody>
                {expenses.slice(0, 12).map((e) => (
                  <tr key={e.id}>
                    <td className="muted small">{fmtDateShort(e.date)}</td>
                    <td><Badge tone="neutral">{e.category}</Badge></td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{e.vendor}</td>
                    <td className="muted small">{e.paymentMethod}</td>
                    <td className="num small">{rp(e.amount)}</td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Distribusi Kategori</div>
          <DonutChart data={byCategory} nameKey="name" valueKey="value" height={160} centerValue={rp(total, { short: true })} centerLabel="Total" />
          <div style={{ marginTop: 10 }}>
            <LegendList data={byCategory.slice(0, 6).map((c) => ({ label: c.name, value: rp(c.value, { short: true }) }))} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Butuh Approval" sub={`${pending.length} pengeluaran menunggu`} />
        <div className="card-body stack g2">
          {pending.length === 0 && <div className="small dim">Tidak ada pengeluaran yang menunggu approval.</div>}
          {pending.map((e) => (
            <div key={e.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="strong" style={{ color: "var(--text-1)" }}>{e.vendor} — {e.category}</div>
                <div className="tiny dim">{e.description} · diajukan oleh {e.submittedBy}</div>
              </div>
              <div className="row g3">
                <span className="strong" style={{ color: "var(--text-1)" }}>{rp(e.amount)}</span>
                <StatusBadge status={e.status} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
