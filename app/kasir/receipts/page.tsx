import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { PRINT_JOBS, PRINTER_PROFILES } from "@/lib/mock";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getTransactionsForOutlet } from "@/lib/data/transactions";
import { getEffectiveToday } from "@/lib/data/bookings";
import { rp, fmtTime, fmtDateTime } from "@/lib/format";

// ---------------------------------------------------------------------
// Live-migrated for the transaction history table (lib/data/transactions.ts,
// same auth-based fallback rule as bookings/sessions). Printer status and
// print-job history stay mock/presentational — there is no printer or
// print_job table in the schema (confirmed via grep), so this is the same
// "sengaja belum dipindah" boundary used elsewhere. See the roadmap doc.
// ---------------------------------------------------------------------

export default async function ReceiptsPage() {
  const outlet = await getCurrentOutlet();
  const today = await getEffectiveToday();
  const transactions = await getTransactionsForOutlet(outlet.id, today);
  const jobs = PRINT_JOBS;
  const printers = PRINTER_PROFILES.filter((p) => p.outletId === outlet.id);
  const failed = jobs.filter((j) => j.status === "Failed").length;

  return (
    <>
      <PageHead
        title="Receipts & Reprint"
        desc={`${outlet.name} · ${today} · Riwayat struk transaksi dan status printer.`}
      />

      <MockDataNotice title="Sebagian halaman ini data contoh">
        Kartu <strong>Struk Hari Ini</strong> menampilkan transaksi yang sungguhan (15 baris pertama).
        Sisanya — <strong>Status Printer</strong>, <strong>Riwayat Print Job</strong>, dan kotak angka
        Print Job/Gagal Cetak/Printer Online — adalah data contoh, dan tombol <strong>Reprint</strong>
        belum berfungsi. Cetak ulang struk belum dibangun.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Struk Hari Ini" value={transactions.length} icon="receipt" toneKey="teal" deltaLabel="Total transaksi" />
        <StatCard label="Print Job" value={jobs.length} icon="printer" toneKey="sky" deltaLabel="Riwayat terbaru" />
        <StatCard label="Gagal Cetak" value={failed} icon="alert-triangle" toneKey="danger" deltaLabel="Perlu retry" />
        <StatCard label="Printer Online" value={printers.filter((p) => p.status === "Online").length} icon="check-circle" toneKey="gold" deltaLabel={`Dari ${printers.length} unit`} />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Struk Hari Ini" sub={`${transactions.length} transaksi`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Waktu</th><th>No. Struk</th><th>Customer</th><th>Total</th><th>Metode</th><th>Dicetak</th><th></th></tr></thead>
            <tbody>
              {transactions.slice(0, 15).map((t) => (
                <tr key={t.id}>
                  <td className="mono small">{fmtTime(t.paidAt)}</td>
                  <td className="mono small">{t.receiptNo}</td>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{t.customerName}</td>
                  <td className="num small">{rp(t.total)}</td>
                  <td><Badge tone="neutral">{t.paymentMethod}</Badge></td>
                  <td className="num small muted">{t.printedCount}×</td>
                  <td><button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — cetak & cetak ulang struk belum dibangun (belum ada tabel printer di database)."><Icon name="printer" size={12} /> Reprint</button></td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={7} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>Belum ada struk hari ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Status Printer" sub={`${printers.length} unit terdaftar`} />
          <div className="card-body stack g2">
            {printers.map((p) => (
              <div key={p.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{p.name}</div>
                  <div className="tiny dim">{p.type} · {p.width}mm · {p.address}</div>
                </div>
                <Badge tone={p.status === "Online" ? "success" : "neutral"} dot>{p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Riwayat Print Job" sub="Termasuk retry otomatis" />
          <div className="card-body stack g2">
            {jobs.map((j) => (
              <div key={j.id} className="row between small" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="strong" style={{ color: "var(--text-1)" }}>{j.receiptNo}</div>
                  <div className="tiny dim">{j.printer} · {j.type} · {fmtDateTime(j.at)}</div>
                </div>
                <Badge tone={j.status === "Success" ? "success" : "danger"} dot>{j.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
