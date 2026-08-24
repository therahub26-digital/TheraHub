import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, StatusBadge, Avatar, Badge } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, PLANS } from "@/lib/mock";
import { rp, fmtDate } from "@/lib/format";

export default function TenantsPage() {
  return (
    <>
      <PageHead
        title="Tenants"
        desc="Kelola seluruh tenant, plan, dan status subscription platform."
        actions={
          <>
            <div className="search-box">
              <Icon name="search" size={15} />
              <input className="input" placeholder="Cari tenant, slug, atau kota…" disabled title="Belum tersedia — kotak pencarian di halaman ini belum menyaring tabel." style={{ width: 240 }} />
            </div>
            <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — provisioning tenant baru belum dibangun; tombol ini tidak membuat tenant apa pun.">
              <Icon name="plus" size={14} /> Provision Tenant Baru
            </button>
          </>
        }
      />

      <MockDataNotice title="Data contoh — portal platform belum dibangun">
        Super Admin adalah level platform (provisioning tenant, paket langganan, feature flag) yang
        belum relevan selama TheraHub dipakai satu bisnis saja. Seluruh angka dan tabel di halaman
        ini contoh tampilan, dan tidak ada tombol di sini yang menulis ke database.
      </MockDataNotice>

      <div className="row g2 wrap" style={{ marginBottom: 16 }}>
        <span className="chip on" title="Angkanya benar, tapi chip ini hanya penghitung — menekannya belum menyaring tabel.">Semua ({TENANTS.length})</span>
        {["ACTIVE", "TRIAL", "GRACE", "SUSPENDED", "CHURNED"].map((s) => (
          <span className="chip" key={s}>{s} ({TENANTS.filter((t) => t.status === s).length})</span>
        ))}
      </div>

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Outlet</th>
                <th>User</th>
                <th>MRR</th>
                <th>Status</th>
                <th>Renewal</th>
                <th>Health</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {TENANTS.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/super-admin/tenants/${t.id}`} className="row g3">
                      <Avatar name={t.name} toneKey={t.logoTone} size={32} rect />
                      <div style={{ minWidth: 0 }}>
                        <div className="strong truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                        <div className="tiny dim truncate">{t.city} · {t.legalName}</div>
                      </div>
                    </Link>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{t.plan}</td>
                  <td className="num">{t.outletCount}/{t.maxOutlets}</td>
                  <td className="num">{t.userCount}</td>
                  <td className="num strong">{rp(t.mrr, { short: true })}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="muted small">{fmtDate(t.renewalAt)}</td>
                  <td>
                    <Badge tone={t.healthScore >= 75 ? "success" : t.healthScore >= 50 ? "warning" : "danger"}>
                      {t.healthScore}
                    </Badge>
                  </td>
                  <td>
                    <Link href={`/super-admin/tenants/${t.id}`} className="btn btn-quiet btn-icon btn-sm">
                      <Icon name="chevron-right" size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-4" style={{ marginTop: 20 }}>
        {PLANS.map((p) => (
          <Card key={p.key} className="card-pad">
            <div className="between" style={{ marginBottom: 6 }}>
              <h4>{p.name}</h4>
              <Badge tone="neutral">{TENANTS.filter((t) => t.plan === p.key).length} tenant</Badge>
            </div>
            <div className="tiny dim" style={{ marginBottom: 10 }}>{p.target}</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text-1)" }}>
              {rp(p.pricePerOutlet, { short: true })}
              <span className="tiny dim" style={{ fontWeight: 500 }}> /outlet/bulan</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
