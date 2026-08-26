import Icon from "@/components/Icon";
import { PageHead, Card, StatusBadge, Avatar, Meter, StatCard } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, planOf, TODAY } from "@/lib/mock";
import { rp, fmtDate, addDays } from "@/lib/format";

export default function SubscriptionsPage() {
  const totalMrr = TENANTS.filter((t) => t.status !== "CHURNED").reduce((s, t) => s + t.mrr, 0);
  const overdue = TENANTS.filter((t) => t.status === "GRACE" || t.status === "SUSPENDED");
  // FIX 2026-08-24 — this was `[...TENANTS].sort(...).slice(0, 6)`, feeding
  // a card labelled "Renewal 30 Hari". slice(0, 6) is not a date filter, so
  // the number it produced was always exactly 6 (or the tenant count, if
  // fewer) no matter how far away the renewals actually were — the label
  // promised a 30-day window the code never looked at. Now it really is a
  // 30-day window, counted from the same frozen demo date the rest of this
  // mock page uses.
  const renewalCutoff = addDays(TODAY, 30);
  const upcoming = TENANTS.filter((t) => t.renewalAt >= TODAY && t.renewalAt <= renewalCutoff);

  return (
    <>
      <PageHead title="Subscriptions & Limits" desc="Status billing, siklus penagihan, dan batas penggunaan tiap tenant." />

      <MockDataNotice title="Data contoh — belum ada model langganan">
        MRR, status langganan, dan tanggal perpanjangan di halaman ini <strong>tidak punya sumber
        data</strong> — TheraHub belum pernah mencatat harga langganan tenant di mana pun. Angka di
        sini contoh tampilan dan tidak boleh dipakai untuk keputusan apa pun. Jumlah tenant, outlet,
        dan terapis yang sungguhan ada di <strong>Tenants</strong> dan <strong>Dashboard</strong>.
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
