import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Badge, Avatar } from "@/components/ui";
import { AUDIT_LOGS } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";

const SEV_TONE = { info: "info", warning: "warning", critical: "danger" } as const;

const EXPORTS = [
  { key: "sales", label: "Laporan Penjualan", desc: "Harian per outlet, metode bayar, layanan, produk", icon: "receipt" },
  { key: "booking", label: "Laporan Booking", desc: "Booked, cancelled, no-show, rescheduled, walk-in", icon: "calendar-days" },
  { key: "therapist", label: "Laporan Terapis", desc: "Guest count, shift hours, utilization, komisi", icon: "sparkles" },
  { key: "attendance", label: "Laporan Absensi", desc: "On-time, late minutes, absence, suspicious", icon: "map-pin-check" },
  { key: "inventory", label: "Laporan Inventory", desc: "Stok, usage, waste, variance, low stock", icon: "package" },
  { key: "payroll", label: "Laporan Payroll", desc: "Komponen tetap/variabel, potongan, tabungan, THR", icon: "wallet" },
  { key: "expense", label: "Laporan Biaya", desc: "Kategori, outlet, vendor, status approval", icon: "coins" },
  { key: "pnl", label: "Laporan Profitability", desc: "P&L per outlet dan konsolidasi tenant", icon: "trending-up" },
];

export default function OwnerAuditPage() {
  const critical = AUDIT_LOGS.filter((l) => l.severity === "critical");

  return (
    <>
      <PageHead title="Audit & Export" desc="Jejak audit bisnis dan ekspor laporan untuk keperluan akuntansi." />

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Export Laporan" sub="Unduh dalam format PDF atau Excel" />
        <div className="card-body">
          <div className="grid grid-4">
            {EXPORTS.map((e) => (
              <Card key={e.key} className="card-pad" hover>
                <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10, marginBottom: 10 }}>
                  <Icon name={e.icon} size={16} />
                </span>
                <div className="strong" style={{ color: "var(--text-1)", marginBottom: 3 }}>{e.label}</div>
                <div className="tiny dim" style={{ marginBottom: 12, minHeight: 32 }}>{e.desc}</div>
                <div className="row g2">
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}><Icon name="file-text" size={12} /> PDF</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}><Icon name="download" size={12} /> Excel</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Audit Log Bisnis"
          sub={`${critical.length} entri kritikal dari ${AUDIT_LOGS.length} total`}
          action={<button className="btn btn-ghost btn-sm"><Icon name="download" size={13} /> Export CSV</button>}
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Waktu</th><th>Actor</th><th>Action</th><th>Scope</th><th>Detail</th><th>Severity</th></tr></thead>
            <tbody>
              {AUDIT_LOGS.slice(0, 30).map((l) => (
                <tr key={l.id}>
                  <td className="mono small nowrap">{fmtDateTime(l.at)}</td>
                  <td>
                    <div className="row g2">
                      <Avatar name={l.actor} size={24} />
                      <span className="small strong" style={{ color: "var(--text-1)" }}>{l.actor}</span>
                    </div>
                  </td>
                  <td className="mono small">{l.action}</td>
                  <td className="small muted">{l.scope}</td>
                  <td className="small" style={{ maxWidth: 280 }}>{l.detail}</td>
                  <td><Badge tone={SEV_TONE[l.severity]}>{l.severity}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
