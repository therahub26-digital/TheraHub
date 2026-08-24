import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, InfoNote, Badge, StatCard } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, PLATFORM_INCIDENTS, PLATFORM_KPI } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";

const TICKETS = [
  { id: "TK-24051", tenant: "Bali Serenity Spa", subject: "Integrasi payment gateway error", status: "Terbuka", priority: "high", at: "2026-08-18T09:20" },
  { id: "TK-24048", tenant: "Lotus Thai Spa", subject: "Laporan keuangan tidak muncul", status: "Proses", priority: "medium", at: "2026-08-17T14:05" },
  { id: "TK-24044", tenant: "Amethyst", subject: "Akses user baru bermasalah", status: "Terbuka", priority: "low", at: "2026-08-17T11:12" },
  { id: "TK-24040", tenant: "Urban Reflexo Hub", subject: "Downtime saat backup terjadwal", status: "Selesai", priority: "high", at: "2026-08-16T08:40" },
];

export default function DiagnosticsPage() {
  return (
    <>
      <PageHead title="Support Diagnostics" desc="Akses troubleshooting terbatas, time-bound, dan selalu diaudit." />

      <MockDataNotice title="Data contoh — akses support tidak benar-benar dibuka">
        Tiket dan insiden di halaman ini contoh tampilan. Tombol <strong>Buka Akses</strong> tidak
        membuka sesi support apa pun <strong>dan tidak mencatat apa pun ke Audit Log</strong>,
        meskipun teks di formulir menjanjikan sesi terbatas waktu yang tercatat penuh.
      </MockDataNotice>

      <InfoNote tone="warning" icon="shield-check" title="Mode Support">
        Membuka mode diagnostik memberi akses read-only sementara ke data operasional tenant untuk keperluan
        troubleshooting. Setiap sesi dibatasi waktu (maks. 60 menit) dan tercatat penuh di Audit Log.
      </InfoNote>

      <div className="grid grid-4" style={{ margin: "20px 0" }}>
        <StatCard label="Tiket Terbuka" value={PLATFORM_KPI.openTickets} icon="life-buoy" toneKey="danger" />
        <StatCard label="API Success Rate" value={`${PLATFORM_KPI.apiSuccessRate}%`} icon="activity" toneKey="teal" />
        <StatCard label="Avg Latency" value={PLATFORM_KPI.avgLatencyMs} unit="ms" icon="zap" toneKey="sky" />
        <StatCard label="Print Failure Rate" value={`${PLATFORM_KPI.printFailureRate}%`} icon="printer" toneKey="amber" />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Tiket Support Terbaru" sub="Diagnostik tenant" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tiket</th><th>Tenant</th><th>Subjek</th><th>Prioritas</th><th>Status</th></tr></thead>
              <tbody>
                {TICKETS.map((t) => (
                  <tr key={t.id}>
                    <td className="mono small">{t.id}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.tenant}</td>
                    <td className="muted">{t.subject}</td>
                    <td><Badge tone={t.priority === "high" ? "danger" : t.priority === "medium" ? "warning" : "neutral"}>{t.priority}</Badge></td>
                    <td><Badge tone={t.status === "Selesai" ? "success" : t.status === "Proses" ? "info" : "warning"}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Insiden Sistem" sub="Monitoring platform-wide" />
          <div className="card-body stack g3">
            {PLATFORM_INCIDENTS.map((inc) => (
              <div key={inc.id} className="stack g1" style={{ paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <span className="small bold" style={{ color: "var(--text-1)" }}>{inc.title}</span>
                  <Badge tone={inc.severity === "critical" ? "danger" : inc.severity === "warning" ? "warning" : "info"}>{inc.severity}</Badge>
                </div>
                <div className="tiny dim">{inc.tenant} · {inc.module} · {fmtDateTime(inc.at)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="card-pad">
        <h3 style={{ marginBottom: 12 }}>Buka Support Mode untuk Tenant</h3>
        <div className="row g3 wrap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Pilih Tenant</label>
            <select className="select">
              {TENANTS.map((t) => <option key={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>Durasi</label>
            <select className="select">
              <option>15 menit</option>
              <option>30 menit</option>
              <option>60 menit</option>
            </select>
          </div>
          <div className="field grow">
            <label>Alasan (wajib, tercatat di audit)</label>
            <input className="input" placeholder="Contoh: Investigasi laporan keuangan tidak muncul" />
          </div>
          <button className="btn btn-primary" disabled title="Belum tersedia — tidak membuka sesi support apa pun dan tidak mencatat apa pun ke Audit Log.">
            <Icon name="shield-check" size={15} /> Buka Akses
          </button>
        </div>
      </Card>
    </>
  );
}
