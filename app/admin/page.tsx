import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, Progress, Badge } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { SETUP_STEPS, OUTLETS, ACTIVE_TENANT } from "@/lib/mock";

const STEP_LINK: Record<string, string> = {
  profile: "/admin/profile",
  outlet: "/admin/outlets",
  geofence: "/admin/geofence",
  users: "/admin/users",
  rooms: "/admin/rooms",
  master: "/admin/master",
  payment: "/admin/settings",
  policy: "/admin/settings",
};

export default function AdminSetupPage() {
  const done = SETUP_STEPS.filter((s) => s.done).length;
  const pct = Math.round((done / SETUP_STEPS.length) * 100);

  return (
    <>
      <PageHead
        title="Setup Progress"
        desc={`Onboarding bisnis ${ACTIVE_TENANT.name} setelah tenant diprovision oleh Super Admin.`}
      />

      <MockDataNotice title="Kemajuan setup ini bukan kondisi tenant Anda">
        Persentase dan status &quot;Selesai&quot;/&quot;Belum&quot; di halaman ini adalah angka tetap
        di kode — tidak mengikuti apa pun dan tidak bisa dicentang. Pakai kartu di bawah sebagai
        daftar rujukan langkah setup saja, bukan sebagai laporan kemajuan.
      </MockDataNotice>

      <Card className="card-pad" style={{ marginBottom: 20 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <div>
            <h3>Kemajuan Setup Awal</h3>
            <div className="tiny dim">{done} dari {SETUP_STEPS.length} langkah selesai</div>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--accent)" }}>{pct}%</span>
        </div>
        <Progress value={pct} />
      </Card>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        {SETUP_STEPS.map((s, i) => (
          <Link key={s.key} href={STEP_LINK[s.key] ?? "/admin"}>
            <Card className="card-pad" hover style={{ height: "100%" }}>
              <div className="row g3" style={{ alignItems: "flex-start" }}>
                <span
                  className="stat-icon"
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: s.done ? "var(--accent-soft)" : "var(--bg-surface-3)",
                    color: s.done ? "var(--accent)" : "var(--text-4)",
                  }}
                >
                  {s.done ? <Icon name="check" size={16} /> : <span className="small bold">{i + 1}</span>}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row between">
                    <div className="strong" style={{ color: "var(--text-1)" }}>{s.label}</div>
                    <Badge tone={s.done ? "success" : "neutral"}>{s.done ? "Selesai" : "Belum"}</Badge>
                  </div>
                  <div className="small muted" style={{ marginTop: 2 }}>{s.desc}</div>
                  <div className="tiny dim" style={{ marginTop: 4 }}>Owner: {s.owner}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <div className="card-head">
          <h3>Outlet Terprovisi</h3>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Outlet</th><th>Kota</th><th>Manager</th><th>Room</th><th>Terapis</th><th>Status</th></tr></thead>
            <tbody>
              {OUTLETS.map((o) => (
                <tr key={o.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{o.name}</td>
                  <td className="muted">{o.city}</td>
                  <td className="muted">{o.managerName}</td>
                  <td className="num">{o.roomCount}</td>
                  <td className="num">{o.therapistCount}</td>
                  <td><Badge tone="success" dot>{o.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
