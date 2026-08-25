import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge } from "@/components/ui";
import { DonutChart, LegendList } from "@/components/Charts";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getExpensesForOutlet, expenseByCategory, getPettyCash } from "@/lib/data/expenses";
import { rp, fmtDateShort, monthLabel } from "@/lib/format";
import { toCsv, csvFilename } from "@/lib/csv";
import ExportCsvButton from "@/components/ExportCsvButton";
import { NewExpenseForm, ApproveRejectButtons, PettyCashTopUpForm } from "@/components/ExpenseEditor";
import { todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — was 100% lib/mock (expensesOf, expenseByCategory,
// PETTY_CASH, CURRENT_PERIOD). `expenses` table itself already existed
// in production since baseline 0001 (with RLS) — only petty_cash /
// petty_cash_movements + expenses.approved_by/approved_at were missing,
// added by supabase/migrations/0020_inventory_expenses.sql. See
// app/manager/inventory/page.tsx's header for the same story on that
// migration's other half.
//
// Same session-based dual-mode convention as lib/data/inventory.ts — a
// signed-in manager sees real data (including a genuine empty state),
// the demo "Ganti Role" viewer keeps the original mock numbers.
// "Catat Pengeluaran" / Setujui / Tolak / Top-up are now real writes
// (lib/actions/expenses.ts).
// ---------------------------------------------------------------------

// Bulan WIB, bukan bulan UTC — lihat catatan yang sama di
// lib/data/inventory.ts. Tanpa ini, tiap tanggal 1 dini hari halaman
// menampilkan total & grafik bulan LALU sambil berjudul bulan berjalan.
function currentPeriod(): string {
  return todayIsoDate().slice(0, 7);
}

export default async function ExpensesPage() {
  const outlet = await getCurrentOutlet();
  const [{ expenses, live }, { pettyCash }] = await Promise.all([
    getExpensesForOutlet(outlet.id),
    getPettyCash(outlet.id),
  ]);
  const period = live ? currentPeriod() : "2026-08"; // CURRENT_PERIOD equivalent for the mock branch's fixed demo data
  const thisMonth = expenses.filter((e) => e.date.startsWith(period));
  const pending = expenses.filter((e) => e.status === "SUBMITTED" || e.status === "DRAFT");
  const byCategory = expenseByCategory(expenses, period);
  const total = byCategory.reduce((s, c) => s + c.value, 0);

  // Ekspor CSV (backlog 4.5, 2026-08-24). Seluruh riwayat pengeluaran
  // outlet ini, bukan hanya 12 baris yang dirender tabel dan bukan hanya
  // periode berjalan — laporan pengeluaran hampir selalu dipakai lintas
  // bulan (rekap ke akuntan), jadi memotongnya ke satu periode di file
  // ekspor justru memaksa ekspor berulang kali. Nama file tetap memakai
  // periode berjalan sebagai penanda kapan ekspornya diambil.
  const expensesCsv = toCsv(expenses, [
    { header: "Tanggal", value: (e) => e.date },
    { header: "Kategori", value: (e) => e.category },
    { header: "Vendor", value: (e) => e.vendor },
    { header: "Deskripsi", value: (e) => e.description },
    { header: "Metode", value: (e) => e.paymentMethod },
    { header: "Jumlah", value: (e) => e.amount },
    { header: "Pajak", value: (e) => e.tax },
    { header: "Status", value: (e) => e.status },
    { header: "Diajukan Oleh", value: (e) => e.submittedBy },
    { header: "Ada Lampiran", value: (e) => (e.attachment ? "Ya" : "Tidak") },
  ]);

  return (
    <>
      <PageHead
        title="Expenses"
        desc={`${outlet.name} · ${monthLabel(period)} · Pengeluaran operasional dan petty cash.`}
        actions={<NewExpenseForm outletId={outlet.id} />}
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Bulan Ini" value={rp(total, { short: true })} icon="wallet" toneKey="teal" deltaLabel={`${thisMonth.length} entri`} />
        <StatCard label="Menunggu Approval" value={pending.length} icon="clock" toneKey="danger" deltaLabel="Draft & submitted" />
        <StatCard label="Kas Kecil" value={rp(pettyCash.balance, { short: true })} icon="piggy-bank" toneKey="gold" deltaLabel={`Limit ${rp(pettyCash.limit, { short: true })}`} />
        <StatCard label="Custodian" value={pettyCash.custodianName.split(" ")[0]} icon="user" toneKey="sky" deltaLabel={pettyCash.lastTopUp ? `Top-up terakhir ${fmtDateShort(pettyCash.lastTopUp)}` : "Belum pernah top-up"} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="Riwayat Pengeluaran"
            sub={`${expenses.length} entri`}
            action={
              <ExportCsvButton
                csv={expensesCsv}
                filename={csvFilename(`pengeluaran-${outlet.code}`, period)}
                rowCount={expenses.length}
                emptyReason="Belum ada pengeluaran tercatat untuk diekspor."
              />
            }
          />
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
                {expenses.length === 0 && (
                  <tr><td colSpan={6} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada pengeluaran tercatat.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-pad">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="tiny dim uppercase">Distribusi Kategori</div>
            <PettyCashTopUpForm outletId={outlet.id} />
          </div>
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
              <div className="row g3" style={{ alignItems: "center" }}>
                <span className="strong" style={{ color: "var(--text-1)" }}>{rp(e.amount)}</span>
                {live ? <ApproveRejectButtons id={e.id} /> : <StatusBadge status={e.status} />}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
