import Icon from "@/components/Icon";
import { PageHead, Card, Badge, Avatar } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { AUDIT_LOGS } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";

const SEV_TONE = { info: "info", warning: "warning", critical: "danger" } as const;

export default function AuditLogPage() {
  return (
    <>
      <PageHead
        title="Audit Log"
        desc="Log role, price, extension, discount, refund, commission, payroll, dan stock adjustment — seluruh platform."
        actions={
          <>
            <div className="search-box">
              <Icon name="search" size={15} />
              <input className="input" placeholder="Cari actor, action, atau entity…" disabled title="Belum tersedia — kotak pencarian di halaman ini belum menyaring tabel." style={{ width: 240 }} />
            </div>
            <button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — ekspor laporan belum dibangun di aplikasi ini."><Icon name="download" size={14} /> Export CSV</button>
          </>
        }
      />

      <MockDataNotice title="Data contoh — audit log belum ditulis lintas-tenant">
        Tabel <code>audit_logs</code> ada, tapi cakupannya masih diperkirakan lewat baris
        <code>app_users</code> pelaku — <strong>tabelnya sendiri tidak punya kolom tenant</strong>,
        jadi baris yang pelakunya sudah dihapus atau yang ditulis proses sistem tidak terlihat oleh
        siapa pun. Log di halaman ini contoh tampilan sampai cakupan itu diperbaiki.
      </MockDataNotice>

      <div className="row g2 wrap" style={{ marginBottom: 16 }} title="Angkanya benar, tapi chip ini hanya penghitung — menekannya belum menyaring tabel.">
        <span className="chip on">Semua ({AUDIT_LOGS.length})</span>
        <span className="chip">Critical ({AUDIT_LOGS.filter((l) => l.severity === "critical").length})</span>
        <span className="chip">Warning ({AUDIT_LOGS.filter((l) => l.severity === "warning").length})</span>
        <span className="chip">Info ({AUDIT_LOGS.filter((l) => l.severity === "info").length})</span>
      </div>

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Scope</th>
                <th>Detail</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT_LOGS.map((l) => (
                <tr key={l.id}>
                  <td className="mono small nowrap">{fmtDateTime(l.at)}</td>
                  <td>
                    <div className="row g2">
                      <Avatar name={l.actor} size={24} />
                      <div>
                        <div className="small strong" style={{ color: "var(--text-1)" }}>{l.actor}</div>
                        <div className="tiny dim" style={{ textTransform: "capitalize" }}>{l.actorRole.replace("-", " ")}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono small">{l.action}</td>
                  <td className="small muted">{l.entity}</td>
                  <td className="small muted">{l.scope}</td>
                  <td className="small" style={{ maxWidth: 260 }}>{l.detail}</td>
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
