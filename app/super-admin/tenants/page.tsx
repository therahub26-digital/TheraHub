import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, Avatar, EmptyState, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TENANTS, PLANS } from "@/lib/mock";
import { rp, fmtDate } from "@/lib/format";
import { getPlatformTenants } from "@/lib/data/platform";

// ---------------------------------------------------------------------
// UPDATE 2026-08-26 — daftar tenant sekarang data sungguhan lintas-tenant
// untuk akun super-admin (lihat header lib/data/platform.ts soal kenapa
// jalur ini memakai service-role, bukan RLS).
//
// Kolom Plan / MRR / Renewal / Health SENGAJA DIHAPUS, bukan dibiarkan
// menampilkan angka mock. Tidak satu pun punya sumber data: TheraHub belum
// punya model langganan sama sekali — tidak ada harga per tenant yang
// tercatat, tidak ada tanggal perpanjangan, dan "health score" tidak pernah
// punya rumus. Menampilkannya berarti mengarang angka bisnis platform, dan
// aturan "belum diatur ≠ nol" berlaku sama kerasnya di sini seperti di
// komisi terapis.
//
// Yang menggantikannya adalah kolom yang benar-benar bisa dihitung:
// jumlah outlet, terapis aktif, akun staf, dan customer terdaftar.
// ---------------------------------------------------------------------

export default async function TenantsPage() {
  const live = await getPlatformTenants();

  if (!live) {
    // Bukan super-admin, atau viewer demo "Ganti Role" — tampilkan versi
    // contoh apa adanya, dengan banner jujur.
    return (
      <>
        <PageHead title="Tenants" desc="Seluruh tenant yang terdaftar di platform." />
        <MockDataNotice title="Data contoh — perlu akun super-admin sungguhan">
          Daftar di bawah adalah data contoh. Masuk dengan akun <strong>super-admin</strong> untuk
          melihat tenant yang benar-benar terdaftar. Portal ini satu-satunya bagian aplikasi yang
          membaca lintas-tenant, jadi aksesnya sengaja dibatasi ketat.
        </MockDataNotice>
        <Card>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tenant</th><th>Kota</th><th className="num">Outlet</th><th className="num">User</th></tr></thead>
              <tbody>
                {TENANTS.slice(0, 6).map((t) => (
                  <tr key={t.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.name}</td>
                    <td className="muted small">{t.city}</td>
                    <td className="num">{t.outletCount}</td>
                    <td className="num">{t.userCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid grid-4" style={{ marginTop: 20 }}>
          {PLANS.map((p) => (
            <Card key={p.key} className="card-pad">
              <h4>{p.name}</h4>
              <div className="tiny dim" style={{ marginBottom: 10 }}>{p.target}</div>
              <div className="tiny dim">{rp(p.pricePerOutlet, { short: true })} /outlet/bulan — <em>paket contoh</em></div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  const totalOutlets = live.reduce((s, t) => s + t.outlets, 0);
  const totalTherapists = live.reduce((s, t) => s + t.therapists, 0);

  return (
    <>
      <PageHead
        title="Tenants"
        desc={`${live.length} tenant terdaftar · ${totalOutlets} outlet · ${totalTherapists} terapis aktif.`}
        actions={
          <button
            className="btn btn-primary btn-sm"
            disabled
            title="Belum tersedia — lihat catatan di bawah tabel."
          >
            <Icon name="plus" size={14} /> Provision Tenant Baru
          </button>
        }
      />

      <Card>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Kota</th>
                <th className="num">Outlet</th>
                <th className="num">Terapis Aktif</th>
                <th className="num">Akun Staf</th>
                <th className="num">Customer</th>
                <th>Terdaftar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {live.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/super-admin/tenants/${t.id}`} className="row g3">
                      <Avatar name={t.name} size={32} rect />
                      <div style={{ minWidth: 0 }}>
                        <div className="strong truncate" style={{ color: "var(--text-1)" }}>{t.name}</div>
                        {t.slug && <div className="tiny dim truncate">{t.slug}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="muted small">{t.city || "—"}</td>
                  <td className="num">{t.outlets}</td>
                  <td className="num">{t.therapists}</td>
                  <td className="num">{t.staffUsers}</td>
                  <td className="num muted">{t.customers}</td>
                  <td className="muted small">{t.createdAt ? fmtDate(t.createdAt) : "—"}</td>
                  <td>
                    <Link href={`/super-admin/tenants/${t.id}`} className="btn btn-quiet btn-icon btn-sm" title="Lihat detail tenant">
                      <Icon name="chevron-right" size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!live.length && (
          <EmptyState
            icon="building-2"
            title="Belum ada tenant terdaftar"
            desc="Tabel tenants kosong. Ini seharusnya tidak mungkin terjadi di produksi — laporkan ke admin teknis."
          />
        )}
      </Card>

      <div style={{ marginTop: 20 }}>
        <InfoNote tone="warning" title="Kenapa &quot;Provision Tenant Baru&quot; masih nonaktif">
          Menambah tenant kedua <strong>sekarang</strong> akan langsung membocorkan data tenant
          pertama. Empat modul pembacaan data masih salah menafsirkan &quot;nol baris&quot; sebagai
          &quot;tidak ada sesi login&quot;, lalu jatuh ke data contoh — yang isinya roster terapis,
          gaji pokok, dan harga paket tenant yang sudah ada. Tombol ini sengaja ditahan sampai
          kebocoran itu ditutup dan isolasi antar-tenant diuji eksplisit.
        </InfoNote>
      </div>

      <div style={{ marginTop: 14 }}>
        <InfoNote tone="info" title="Kolom yang tidak ada di tabel ini">
          Plan, MRR, tanggal perpanjangan, dan health score <strong>tidak ditampilkan</strong> karena
          belum ada model langganan di TheraHub — tidak ada harga per tenant yang tercatat di mana
          pun, dan health score tidak pernah punya rumus. Menampilkannya berarti mengarang angka
          bisnis. Kolom di atas adalah yang benar-benar bisa dihitung dari database.
        </InfoNote>
      </div>
    </>
  );
}
