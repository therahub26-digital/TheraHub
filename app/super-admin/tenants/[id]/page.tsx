import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { Card, CardHead, StatusBadge, Avatar, Switch, BrandPicker } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, planOf, MODULE_LIST, AUDIT_LOGS } from "@/lib/mock";
import { OUTLETS } from "@/lib/mock/org";
import { rp, fmtDate, fmtDateTime } from "@/lib/format";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = TENANTS.find((t) => t.id === id);
  if (!tenant) notFound();
  const plan = planOf(tenant.plan);
  const outlets = tenant.id === "TEN-001" ? OUTLETS : [];
  const logs = AUDIT_LOGS.filter((l) => l.scope.startsWith(tenant.name)).slice(0, 6);

  return (
    <>
      <MockDataNotice title="Data contoh — portal platform belum dibangun">
        Super Admin adalah level platform (provisioning tenant, paket langganan, feature flag) yang
        belum relevan selama TheraHub dipakai satu bisnis saja. Seluruh angka dan tabel di halaman
        ini contoh tampilan, dan tidak ada tombol di sini yang menulis ke database.
      </MockDataNotice>

      <Link href="/super-admin/tenants" className="row g2 small muted" style={{ marginBottom: 14, width: "fit-content" }}>
        <Icon name="arrow-left" size={14} /> Kembali ke Tenants
      </Link>

      <div className="between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div className="row g3">
          <Avatar name={tenant.name} toneKey={tenant.logoTone} size={52} rect />
          <div>
            <div className="row g2" style={{ marginBottom: 3 }}>
              <h1 style={{ fontSize: 22 }}>{tenant.name}</h1>
              <StatusBadge status={tenant.status} />
            </div>
            <div className="small dim">{tenant.legalName} · {tenant.city} · {tenant.slug}.therahub.id</div>
          </div>
        </div>
        <div className="row g2">
          <button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — portal platform (multi-tenant) belum dibangun."><Icon name="life-buoy" size={14} /> Support Mode</button>
          <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — portal platform (multi-tenant) belum dibangun."><Icon name="edit" size={14} /> Kelola Plan</button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 6 }}>Plan Aktif</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-1)" }}>{plan.name}</div>
          <div className="tiny dim">{rp(plan.pricePerOutlet, { short: true })}/outlet/bulan</div>
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 6 }}>MRR</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-1)" }}>{rp(tenant.mrr)}</div>
          <div className="tiny dim">Renewal {fmtDate(tenant.renewalAt)}</div>
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 6 }}>Outlet</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-1)" }}>{tenant.outletCount} / {tenant.maxOutlets}</div>
          <div className="tiny dim">Batas sesuai plan</div>
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 6 }}>Health Score</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: tenant.healthScore >= 75 ? "var(--success)" : tenant.healthScore >= 50 ? "var(--warning)" : "var(--danger)" }}>
            {tenant.healthScore}/100
          </div>
          <div className="tiny dim">Aktif terakhir {fmtDate(tenant.lastActiveAt)}</div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Module Entitlement" sub="Diaktifkan/nonaktifkan oleh Super Admin sesuai plan" />
          <div className="card-body">
            <div className="grid grid-2">
              {MODULE_LIST.map((m) => (
                <div key={m.key} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{m.label}</div>
                    <div className="tiny dim truncate">{m.desc}</div>
                  </div>
                  <Switch on={tenant.modules[m.key]} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="card-pad">
          <h3 style={{ marginBottom: 12 }}>Brand &amp; Identitas Tenant</h3>
          <BrandPicker selected={tenant.logoTone} logoInitial={tenant.name[0]} background={tenant.bgTone} />
          <div className="tiny dim" style={{ marginTop: 10 }}>
            Dikonfigurasi oleh Admin tenant di Business Profile — Super Admin hanya melihat untuk keperluan support.
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Outlet" sub={`${tenant.outletCount} outlet terdaftar`} />
          {outlets.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Outlet</th><th>Kota</th><th>Manager</th><th>Terapis</th><th>Status</th></tr></thead>
                <tbody>
                  {outlets.map((o) => (
                    <tr key={o.id}>
                      <td className="strong" style={{ color: "var(--text-1)" }}>{o.name}</td>
                      <td className="muted">{o.city}</td>
                      <td className="muted">{o.managerName}</td>
                      <td className="num">{o.therapistCount}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-body">
              <div className="empty" style={{ padding: "24px 0" }}>
                <span className="empty-icon"><Icon name="map-pin" size={20} /></span>
                <div className="small muted">Detail outlet tersedia untuk tenant demo utama (Amethyst).</div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Aktivitas Terbaru" sub="Audit log terkait tenant" />
          <div className="card-body stack g3">
            {logs.length ? logs.map((l) => (
              <div key={l.id} className="stack g1" style={{ paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                <div className="small" style={{ color: "var(--text-1)" }}>{l.detail}</div>
                <div className="tiny dim">{l.actor} · {fmtDateTime(l.at)}</div>
              </div>
            )) : <div className="small dim">Belum ada aktivitas tercatat untuk tenant ini.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
