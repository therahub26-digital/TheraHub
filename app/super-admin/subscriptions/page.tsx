import Icon from "@/components/Icon";
import { PageHead, Card, StatusBadge, Avatar, Meter, StatCard } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, planOf } from "@/lib/mock";
import { rp, fmtDate } from "@/lib/format";

export default function SubscriptionsPage() {
  const totalMrr = TENANTS.filter((t) => t.status !== "CHURNED").reduce((s, t) => s + t.mrr, 0);
  const overdue = TENANTS.filter((t) => t.status === "GRACE" || t.status === "SUSPENDED");
  const upcoming = [...TENANTS].sort((a, b) => (a.renewalAt < b.renewalAt ? -1 : 1)).slice(0, 6);

  return (
    <>
      <PageHead title="Subscriptions & Limits" desc="Status billing, siklus penagihan, dan batas penggunaan tiap tenant." />

      <MockDataNotice title="Data contoh — portal platform belum dibangun">
        Super Admin adalah level platform (provisioning tenant, paket langganan, feature flag) yang
        belum relevan selama TheraHub dipakai satu bisnis saja. Seluruh angka dan tabel di halaman
        ini contoh tampilan, dan tidak ada tombol di sini yang menulis ke database.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total MRR Tertagih" value={rp(totalMrr, { short: true })} icon="circle-dollar" toneKey="gold" />
        <StatCard label="Tenant Grace/Suspended" value={overdue.length} icon="alert-triangle" toneKey="danger" />
        <StatCard label="Rata-rata Outlet Usage" value={`${Math.round((TENANTS.reduce((s, t) => s + t.outletCount / t.maxOutlets, 0) / TENANTS.length) * 100)}%`} icon="gauge" toneKey="sky" />
        <StatCard label="Renewal 30 Hari" value={upcoming.length} icon="calendar-clock" toneKey="teal" />
      </div>

      {overdue.length > 0 && (
        <Card className="card-pad" style={{ marginBottom: 20, borderColor: "rgba(239,68,68,0.3)" }}>
          <div className="row g2" style={{ marginBottom: 12 }}>
            <Icon name="alert-triangle" size={16} style={{ color: "var(--danger)" }} />
            <h3 style={{ color: "var(--danger)" }}>Perlu Tindakan — Billing Bermasalah</h3>
          </div>
          <div className="stack g3">
            {overdue.map((t) => (
              <div key={t.id} className="row between" style={{ padding: "10px 12px", background: "var(--danger-soft)", borderRadius: "var(--r-md)" }}>
                <div className="row g3">
                  <Avatar name={t.name} toneKey={t.logoTone} size={30} rect />
                  <div>
                    <div className="small bold" style={{ color: "var(--text-1)" }}>{t.name}</div>
                    <div className="tiny dim">Renewal jatuh tempo {fmtDate(t.renewalAt)}</div>
                  </div>
                </div>
                <div className="row g2">
                  <StatusBadge status={t.status} />
                  <button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — portal platform (multi-tenant) belum dibangun.">Hubungi</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="card-head">
          <h3>Seluruh Subscription</h3>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Tenant</th><th>Plan</th><th>MRR</th><th>Outlet Usage</th><th>User Usage</th><th>Status</th><th>Renewal</th></tr>
            </thead>
            <tbody>
              {TENANTS.map((t) => {
                const plan = planOf(t.plan);
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="row g3">
                        <Avatar name={t.name} toneKey={t.logoTone} size={28} rect />
                        <span className="strong" style={{ color: "var(--text-1)" }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{t.plan}</td>
                    <td className="num strong">{rp(t.mrr, { short: true })}</td>
                    <td style={{ width: 150 }}><Meter label="" value={t.outletCount} max={t.maxOutlets} /></td>
                    <td style={{ width: 150 }}><Meter label="" value={t.userCount} max={plan.maxUsers} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="muted small">{fmtDate(t.renewalAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
