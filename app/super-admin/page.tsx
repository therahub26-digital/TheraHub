import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, StatusBadge, Avatar, Badge, Progress } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TrendArea, DonutChart, BarsChart, LegendList } from "@/components/Charts";
import {
  PLATFORM_KPI,
  PLATFORM_MRR_SERIES,
  PLATFORM_USAGE_SERIES,
  PLAN_MIX,
  TENANTS,
  FEATURE_FLAGS,
  PLATFORM_INCIDENTS,
} from "@/lib/mock";
import { rp, num, fmtDateTime } from "@/lib/format";

export default function SuperAdminDashboard() {
  const newestTenants = [...TENANTS].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const atRisk = TENANTS.filter((t) => t.healthScore < 60).sort((a, b) => a.healthScore - b.healthScore);
  const topFlags = FEATURE_FLAGS.slice(0, 4);

  return (
    <>
      <PageHead
        title="Dashboard Super Admin"
        desc="Ringkasan seluruh sistem dan aktivitas platform TheraHub Cloud."
        actions={
          <>
            <button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — pemilih periode belum dibangun; ini label tetap, bukan filter.">
              <Icon name="calendar" size={14} /> 1–31 Agustus 2026
            </button>
            <Link href="/super-admin/tenants" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} /> Provision Tenant
            </Link>
          </>
        }
      />

      <MockDataNotice title="Data contoh — portal platform belum dibangun">
        Super Admin adalah level platform (provisioning tenant, paket langganan, feature flag) yang
        belum relevan selama TheraHub dipakai satu bisnis saja. Seluruh angka dan tabel di halaman
        ini contoh tampilan, dan tidak ada tombol di sini yang menulis ke database.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Tenant Aktif" value={PLATFORM_KPI.activeTenants} icon="building-2" toneKey="violet" delta={8.3} deltaLabel="vs bulan lalu" />
        <StatCard label="Total Outlet" value={PLATFORM_KPI.totalOutlets} icon="map-pin" toneKey="teal" delta={5.1} deltaLabel="vs bulan lalu" />
        <StatCard label="MRR Platform" value={rp(PLATFORM_KPI.mrr, { short: true })} icon="circle-dollar" toneKey="gold" delta={12.6} deltaLabel="vs bulan lalu" />
        <StatCard label="Terapis Terdaftar" value={num(PLATFORM_KPI.totalTherapists)} icon="sparkles" toneKey="rose" delta={4.4} deltaLabel="vs bulan lalu" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "stretch" }}>
        <Card className="card-pad" style={{ gridColumn: "span 2" }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <h3>Tren MRR Platform</h3>
              <div className="tiny dim">12 bulan terakhir · seluruh tenant aktif</div>
            </div>
            <Badge tone="success" dot>+{((PLATFORM_MRR_SERIES.at(-1)!.mrr / PLATFORM_MRR_SERIES[0].mrr - 1) * 100).toFixed(0)}% YoY</Badge>
          </div>
          <TrendArea data={PLATFORM_MRR_SERIES} xKey="month" yKey="mrr" color="#a78bfa" height={230} />
        </Card>

        <Card className="card-pad">
          <div style={{ marginBottom: 10 }}>
            <h3>Distribusi Plan</h3>
            <div className="tiny dim">{TENANTS.length} tenant total</div>
          </div>
          <DonutChart
            data={PLAN_MIX}
            nameKey="name"
            valueKey="value"
            centerValue={String(TENANTS.length)}
            centerLabel="Total Tenant"
            height={168}
          />
          <div style={{ marginTop: 12 }}>
            <LegendList data={PLAN_MIX.map((p) => ({ label: p.name, value: `${p.value} tenant` }))} />
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20, alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="Tenant Terbaru"
            sub="Provisioning terakhir oleh Super Admin"
            action={
              <Link href="/super-admin/tenants" className="btn btn-quiet btn-sm">
                Lihat semua <Icon name="arrow-right" size={13} />
              </Link>
            }
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Plan</th>
                  <th>Outlet</th>
                  <th>Status</th>
                  <th>Kota</th>
                </tr>
              </thead>
              <tbody>
                {newestTenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="row g3">
                        <Avatar name={t.name} toneKey={t.logoTone} size={30} rect />
                        <div>
                          <div className="strong" style={{ color: "var(--text-1)" }}>{t.name}</div>
                          <div className="tiny dim">{t.slug}.therahub.id</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{t.plan}</td>
                    <td>{t.outletCount}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="muted">{t.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-pad">
          <div style={{ marginBottom: 10 }}>
            <h3>Tenant Berisiko</h3>
            <div className="tiny dim">Health score &lt; 60</div>
          </div>
          <div className="stack g4">
            {atRisk.map((t) => (
              <div key={t.id} className="stack g2">
                <div className="between">
                  <span className="small bold truncate" style={{ color: "var(--text-1)", maxWidth: 150 }}>{t.name}</span>
                  <span className="tiny" style={{ color: t.healthScore < 30 ? "var(--danger)" : "var(--warning)" }}>{t.healthScore}/100</span>
                </div>
                <Progress value={t.healthScore} tone="warn" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Penggunaan Platform" sub="Booking, sesi, absensi — 14 hari" />
          <div style={{ padding: "0 20px 20px" }}>
            <BarsChart data={PLATFORM_USAGE_SERIES} xKey="day" yKey="bookings" money={false} color="#a78bfa" height={190} />
          </div>
        </Card>

        <Card>
          <CardHead
            title="Feature Flags"
            sub="Rollout aktif"
            action={
              <Link href="/super-admin/flags" className="btn btn-quiet btn-sm">
                Kelola <Icon name="arrow-right" size={13} />
              </Link>
            }
          />
          <div className="card-body stack g4">
            {topFlags.map((f) => (
              <div key={f.key} className="stack g2">
                <div className="between">
                  <span className="small bold" style={{ color: "var(--text-1)" }}>{f.label}</span>
                  <span className="tiny dim">{f.rollout}%</span>
                </div>
                <Progress value={f.rollout} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Insiden & Status" sub="24–72 jam terakhir" />
          <div className="card-body stack g3">
            {PLATFORM_INCIDENTS.map((inc) => (
              <div key={inc.id} className="row g3" style={{ alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                    background: inc.severity === "critical" ? "var(--danger)" : inc.severity === "warning" ? "var(--warning)" : "var(--info)",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div className="small bold truncate" style={{ color: "var(--text-1)" }}>{inc.title}</div>
                  <div className="tiny dim">{inc.tenant} · {fmtDateTime(inc.at)} · {inc.status}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
