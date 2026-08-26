import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Avatar, Badge, EmptyState, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS } from "@/lib/mock";
import { fmtDate } from "@/lib/format";
import { getPlatformTenantDetail } from "@/lib/data/platform";

// ---------------------------------------------------------------------
// UPDATE 2026-08-26 — halaman ini sekarang membaca tenant sungguhan.
//
// Yang DIHAPUS dari versi mock, dan kenapa:
//  - Plan, MRR, status langganan, tanggal perpanjangan: tidak ada model
//    langganan di TheraHub. Tidak ada satu pun tabel yang menyimpan harga
//    per tenant.
//  - Matriks modul per plan + saklar entitlement: tidak ada mekanisme
//    entitlement di kode. Saklarnya dulu hanya gambar, dan menyalakannya
//    tidak pernah membatasi apa pun.
//  - BrandPicker: warna brand tenant diatur tenant SENDIRI di
//    Admin → Business Profile (migrasi 0025), dan sudah berfungsi di sana.
//    Menyediakan pengubah kedua di portal platform berarti dua tempat
//    mengubah nilai yang sama — jalan pintas menuju keduanya tidak cocok.
// ---------------------------------------------------------------------

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPlatformTenantDetail(id);

  if (!detail) {
    const mock = TENANTS.find((t) => t.id === id);
    if (!mock) notFound();
    return (
      <>
        <MockDataNotice title="Data contoh — perlu akun super-admin sungguhan">
          Masuk dengan akun <strong>super-admin</strong> untuk melihat data tenant yang sebenarnya.
        </MockDataNotice>
        <Link href="/super-admin/tenants" className="row g2 small muted" style={{ marginBottom: 14, width: "fit-content" }}>
          <Icon name="arrow-left" size={14} /> Kembali ke Tenants
        </Link>
        <PageHead title={mock.name} desc={`${mock.legalName} · ${mock.city}`} />
      </>
    );
  }

  const { tenant, outlets, users } = detail;
  const roleCount = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Link href="/super-admin/tenants" className="row g2 small muted" style={{ marginBottom: 14, width: "fit-content" }}>
        <Icon name="arrow-left" size={14} /> Kembali ke Tenants
      </Link>

      <div className="row g3" style={{ marginBottom: 20 }}>
        <Avatar name={tenant.name} size={52} rect />
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 3 }}>{tenant.name}</h1>
          <div className="small dim">
            {[tenant.slug, tenant.city, tenant.createdAt ? `terdaftar ${fmtDate(tenant.createdAt)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Outlet" value={tenant.outlets} icon="map-pin" toneKey="teal" />
        <StatCard label="Terapis Aktif" value={tenant.therapists} icon="sparkles" toneKey="rose" />
        <StatCard label="Akun Staf" value={tenant.staffUsers} icon="users" toneKey="violet" />
        <StatCard label="Customer Terdaftar" value={tenant.customers} icon="user-check" toneKey="sky" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Outlet" sub={`${outlets.length} outlet di tenant ini`} />
        {outlets.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Kode</th><th>Nama</th><th>Kota</th><th className="num">Terapis Aktif</th><th className="num">Ruangan</th></tr></thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{o.code}</td>
                    <td>{o.name}</td>
                    <td className="muted small">{o.city || "—"}</td>
                    <td className="num">{o.therapists}</td>
                    <td className="num muted">{o.rooms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="map-pin"
            title="Tenant ini belum punya outlet"
            desc="Hampir seluruh aplikasi membaca data lewat outlet — tanpa outlet, portal manager dan kasir tenant ini tidak bisa dipakai sama sekali."
          />
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Akun Pengguna"
          sub={Object.entries(roleCount).map(([r, n]) => `${n} ${r}`).join(" · ") || "belum ada akun"}
        />
        {users.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Peran</th><th>Email</th><th>Terikat Outlet</th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const outlet = outlets.find((o) => o.id === u.outletId);
                  return (
                    <tr key={u.id}>
                      <td><Badge tone="neutral">{u.role}</Badge></td>
                      <td className="small">
                        {u.email || "—"}
                        {!u.hasLogin && <span className="tiny dim"> · tanpa akun login</span>}
                      </td>
                      <td className="muted small">{outlet ? `${outlet.code} · ${outlet.name}` : "tenant-wide"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="users"
            title="Belum ada akun pengguna"
            desc="Tidak ada yang bisa masuk ke tenant ini. Buat akun admin pertamanya sebelum diserahkan."
          />
        )}
      </Card>

      <InfoNote tone="info" title="Yang tidak ditampilkan di halaman ini">
        Paket langganan, MRR, tanggal perpanjangan, dan matriks entitlement modul{" "}
        <strong>tidak ada di sini</strong> karena TheraHub belum punya model langganan — tidak ada
        harga per tenant yang tercatat, dan tidak ada mekanisme yang benar-benar membatasi modul per
        paket. Warna dan logo tenant diatur oleh tenant sendiri di{" "}
        <strong>Admin → Business Profile</strong>, bukan dari portal platform.
      </InfoNote>
    </>
  );
}
