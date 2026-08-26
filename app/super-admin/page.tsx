import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Avatar, InfoNote, EmptyState } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { PLATFORM_KPI, TENANTS } from "@/lib/mock";
import { num, fmtDate } from "@/lib/format";
import { getPlatformOverview, getPlatformTenants, getPlatformDiagnostics } from "@/lib/data/platform";

// ---------------------------------------------------------------------
// UPDATE 2026-08-26 — dashboard platform sekarang menampilkan angka
// sungguhan lintas-tenant untuk akun super-admin.
//
// YANG DIHAPUS, dan kenapa — ini bagian yang penting:
//  - "MRR Platform", "Tren MRR 12 bulan", "Distribusi Plan": TheraHub belum
//    punya model langganan. Tidak ada harga tenant yang tercatat di tabel
//    mana pun, jadi setiap rupiah di sini dulu adalah angka karangan.
//  - "Tenant Berisiko / health score": tidak pernah punya rumus. Sebuah
//    angka 0-100 tanpa definisi lebih buruk daripada tidak ada angka —
//    orang akan menganggapnya terukur.
//  - "Penggunaan Platform 14 hari", "Insiden & Status", persentase
//    "vs bulan lalu" di tiap kotak: tidak ada deret waktu historis yang
//    disimpan, dan tidak ada lapisan pemantauan insiden.
//
// Yang menggantikannya: hitungan nyata + ringkasan diagnostik, karena
// pertanyaan yang benar-benar bisa dijawab platform hari ini adalah
// "berapa banyak, dan mana yang setupnya belum beres" — bukan "berapa
// pendapatan bulan ini".
// ---------------------------------------------------------------------

export default async function SuperAdminDashboard() {
  const [overview, tenants, findings] = await Promise.all([
    getPlatformOverview(),
    getPlatformTenants(),
    getPlatformDiagnostics(),
  ]);

  if (!overview || !tenants || !findings) {
    return (
      <>
        <PageHead title="Dashboard Super Admin" desc="Ringkasan seluruh tenant di platform TheraHub." />
        <MockDataNotice title="Data contoh — perlu akun super-admin sungguhan">
          Portal ini satu-satunya bagian aplikasi yang membaca lintas-tenant, jadi aksesnya dibatasi
          ketat. Masuk dengan akun <strong>super-admin</strong> untuk melihat angka yang sebenarnya —
          di mode demo &quot;Ganti Role&quot; tidak ada yang bisa dibaca.
        </MockDataNotice>
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Tenant Aktif" value={PLATFORM_KPI.activeTenants} icon="building-2" toneKey="violet" />
          <StatCard label="Total Outlet" value={PLATFORM_KPI.totalOutlets} icon="map-pin" toneKey="teal" />
          <StatCard label="Terapis Terdaftar" value={num(PLATFORM_KPI.totalTherapists)} icon="sparkles" toneKey="rose" />
          <StatCard label="Tenant Contoh" value={TENANTS.length} icon="database" toneKey="gold" />
        </div>
      </>
    );
  }

  const critical = findings.filter((f) => f.severity === "critical");
  const warning = findings.filter((f) => f.severity === "warning");
  const newest = [...tenants]
    .filter((t) => t.createdAt)
    .sort((a, b) => (a.createdAt! < b.createdAt! ? 1 : -1))
    .slice(0, 6);

  return (
    <>
      <PageHead
        title="Dashboard Super Admin"
        desc="Ringkasan seluruh tenant yang terdaftar di platform TheraHub."
        actions={
          <Link href="/super-admin/tenants" className="btn btn-quiet btn-sm">
            Lihat semua tenant <Icon name="arrow-right" size={13} />
          </Link>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Tenant" value={overview.tenants} icon="building-2" toneKey="violet" deltaLabel="Terdaftar di platform" />
        <StatCard label="Outlet" value={overview.outlets} icon="map-pin" toneKey="teal" deltaLabel={`${overview.rooms} ruangan`} />
        <StatCard label="Terapis Aktif" value={num(overview.therapists)} icon="sparkles" toneKey="rose" deltaLabel="Status ACTIVE" />
        <StatCard label="Akun Staf" value={overview.staffUsers} icon="users" toneKey="sky" deltaLabel={`${num(overview.customers)} customer terdaftar`} />
      </div>

      {(critical.length > 0 || warning.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <InfoNote
            tone={critical.length ? "danger" : "warning"}
            icon="alert-triangle"
            title={
              critical.length
                ? `${critical.length} temuan kritis di setup tenant`
                : `${warning.length} temuan perlu perhatian`
            }
          >
            {critical.length > 0 && (
              <>
                Menghalangi operasional: <strong>{critical.map((f) => f.title).join(", ")}</strong>.{" "}
              </>
            )}
            {warning.length > 0 && <>Perlu perhatian: {warning.map((f) => f.title).join(", ")}. </>}
            <Link href="/super-admin/diagnostics">Buka Diagnostik</Link> untuk melihat akibat dan
            langkah menutupnya.
          </InfoNote>
        </div>
      )}

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Tenant Terbaru"
          sub={`${tenants.length} tenant terdaftar`}
          action={
            <Link href="/super-admin/tenants" className="btn btn-quiet btn-sm">
              Lihat semua <Icon name="arrow-right" size={13} />
            </Link>
          }
        />
        {newest.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Tenant</th><th>Kota</th><th className="num">Outlet</th><th className="num">Terapis</th><th className="num">Akun</th><th>Terdaftar</th></tr>
              </thead>
              <tbody>
                {newest.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/super-admin/tenants/${t.id}`} className="row g3">
                        <Avatar name={t.name} size={30} rect />
                        <div style={{ minWidth: 0 }}>
                          <div className="strong truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                          {t.slug && <div className="tiny dim truncate">{t.slug}</div>}
                        </div>
                      </Link>
                    </td>
                    <td className="muted small">{t.city || "—"}</td>
                    <td className="num">{t.outlets}</td>
                    <td className="num">{t.therapists}</td>
                    <td className="num muted">{t.staffUsers}</td>
                    <td className="muted small">{fmtDate(t.createdAt!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="building-2"
            title="Belum ada tenant dengan tanggal pendaftaran"
            desc="Tenant yang ada tidak menyimpan tanggal dibuat, jadi urutan terbaru tidak bisa ditentukan."
          />
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Sebaran per Tenant" sub="Dihitung langsung dari database" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Tenant</th><th className="num">Outlet</th><th className="num">Terapis Aktif</th><th className="num">Akun Staf</th><th className="num">Customer</th></tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{t.name}</td>
                  <td className="num">{t.outlets}</td>
                  <td className="num">{t.therapists}</td>
                  <td className="num">{t.staffUsers}</td>
                  <td className="num muted">{t.customers}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Total</td>
                <td className="num strong">{overview.outlets}</td>
                <td className="num strong">{overview.therapists}</td>
                <td className="num strong">{overview.staffUsers}</td>
                <td className="num strong">{overview.customers}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <InfoNote tone="info" title="Yang tidak ada di dashboard ini">
        MRR, distribusi paket, churn, health score, dan grafik penggunaan historis{" "}
        <strong>tidak ditampilkan</strong>. Tiga alasannya berbeda: langganan belum dimodelkan
        (tidak ada harga tenant yang tercatat), health score tidak pernah punya rumus, dan tidak ada
        deret waktu historis maupun pemantauan insiden yang disimpan. Angka di halaman ini semuanya
        dihitung ulang saat halaman dibuka — tidak ada yang di-cache dan tidak ada yang diperkirakan.
      </InfoNote>
    </>
  );
}
