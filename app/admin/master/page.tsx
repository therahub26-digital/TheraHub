import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge, InfoNote, PersonCell } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getCategories, getServiceTypes, getPackagesForOutlet, isLiveCatalogData } from "@/lib/data/catalog";
import { getOutlets } from "@/lib/data/outlets";
import { getEmployees, isLiveEmployeesData, outletNameMap } from "@/lib/data/employees";
import { PRIMARY_OUTLET, packagesOf, SKILL_LIST } from "@/lib/mock";
import { rp, minutesToHm } from "@/lib/format";
import { NewCategoryButton, NewServiceTypeButton, CategoryList, ServiceTypeTable } from "@/components/MasterCatalogEditor";

// ---------------------------------------------------------------------
// Adjie (2026-08-25), item 3/3 dari 3 permintaan baru: "master inisial:
// dibuatkan opsi saja mana yg akan di aktifkan, kalau di amet baru 1
// layanan, sisanya optional dan bisa diedit, tambahkan atau dihapus.
// perhatikan juga link ke halaman / role yg lain". Dijawab lewat
// pertanyaan pilihan ganda: jadikan Master Initial "editor master tenant
// sungguhan" (bukan cuma tampilan contoh seperti sebelumnya).
//
// Kategori & Jenis Layanan sekarang data sungguhan + bisa diedit
// langsung di sini (lihat components/MasterCatalogEditor.tsx dan
// lib/actions/masterCatalog.ts). Starter Package & Import Terapis
// SENGAJA dibiarkan sebagai ringkasan tautan ke halaman yang sudah jadi
// tempat sungguhannya (Manager > Catalog untuk harga per outlet, Manager
// > Therapists & Staff untuk data karyawan) — permintaan Adjie cuma
// menyebut "opsi mana yang aktif" untuk kategori/jenis layanan, dan
// membangun editor harga/karyawan kedua di sini akan menduplikasi sistem
// yang sudah benar di tempat lain (persis peringatan Adjie sendiri:
// "harus sesuai dengan yang sudah terbangun juga").
// ---------------------------------------------------------------------

export default async function MasterDataPage() {
  const [categories, serviceTypes, live, employees, employeesLive, outletNameById] = await Promise.all([
    getCategories(),
    getServiceTypes(),
    isLiveCatalogData(),
    getEmployees(),
    isLiveEmployeesData(),
    outletNameMap(),
  ]);

  const outlet = PRIMARY_OUTLET;
  const packages = live ? [] : packagesOf(outlet.id).sort((a, b) => b.popularity - a.popularity);
  const starter = packages.slice(0, 6);
  // Stat card saja — jumlah paket sungguhan dijumlah dari SEMUA outlet
  // tenant (bukan cuma outlet contoh), karena Starter Package di halaman
  // ini murni ringkasan; angka sungguhannya sendiri hidup di Manager >
  // Catalog per outlet.
  const packageCount = live
    ? (await Promise.all((await getOutlets()).map((o) => getPackagesForOutlet(o.id)))).flat().length
    : packages.length;
  const therapists = employees.filter((e) => e.jobRole === "Terapis").slice(0, 6);
  const activeCount = serviceTypes.filter((t) => t.active).length;

  return (
    <>
      <PageHead
        title="Master Initial"
        desc="Data master tenant: kategori layanan, jenis layanan (aktif/opsional), starter package, dan import terapis."
        actions={
          live ? (
            <>
              <NewServiceTypeButton categories={categories} />
              <NewCategoryButton />
            </>
          ) : (
            <button className="btn btn-primary btn-sm" disabled title="Perlu sesi login asli — tidak tersedia di mode contoh/demo."><Icon name="plus" size={14} /> Kategori Baru</button>
          )
        }
      />

      {!live && (
        <MockDataNotice>
          Kategori dan Jenis Layanan di bawah ini data contoh, bukan master tenant Anda — login dengan akun asli
          (Admin/Owner) untuk mengelola master data sungguhan.
        </MockDataNotice>
      )}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Kategori Layanan" value={categories.length} icon="layers" toneKey="teal" deltaLabel="Dipakai seluruh outlet" />
        <StatCard label="Jenis Layanan Aktif" value={activeCount} icon="book-open" toneKey="sky" deltaLabel={`${serviceTypes.length - activeCount} opsional/nonaktif`} />
        <StatCard label="Starter Package" value={packageCount} icon="ticket" toneKey="gold" deltaLabel="Lihat Manager > Catalog" />
        <StatCard label="Terapis Terdaftar" value={employees.filter((e) => e.jobRole === "Terapis").length} icon="hand-heart" toneKey="violet" deltaLabel={`${SKILL_LIST.length} skill tersedia`} />
      </div>

      <InfoNote icon="info" title="Kategori/Jenis Layanan aktif vs. opsional">
        Amethyst saat ini baru benar-benar memakai <strong>1 jenis layanan</strong> untuk penetapan harga di Manager
        &gt; Catalog. Jenis layanan lain yang ditambahkan di sini boleh dibuat <strong>opsional</strong> (saklar
        &quot;Aktif&quot; dimatikan) — tetap tersimpan sebagai master, tapi tidak akan muncul di dropdown &quot;Tambah
        Paket&quot; Manager sampai diaktifkan.
      </InfoNote>

      <div className="grid grid-2" style={{ alignItems: "start", margin: "20px 0" }}>
        <Card>
          <CardHead title="1 · Kategori Layanan" sub={`${categories.length} kategori tingkat tenant`} />
          <CategoryList categories={categories} types={serviceTypes} />
        </Card>

        <Card>
          <CardHead
            title="2 · Jenis Layanan"
            sub="Setiap jenis mensyaratkan skill terapis tertentu"
            action={live ? <NewServiceTypeButton categories={categories} /> : undefined}
          />
          <ServiceTypeTable categories={categories} types={serviceTypes} />
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="3 · Starter Package"
          sub={live ? "Harga & paket sungguhan diatur per outlet di Manager > Catalog" : "Template paket awal — harga final diatur Manager per outlet"}
          action={<Link href="/manager/catalog" className="btn btn-quiet btn-sm">Buka Catalog outlet</Link>}
        />
        {live ? (
          <div className="card-body">
            <InfoNote tone="accent" icon="info" title="Dikelola di Manager > Catalog, bukan di sini">
              Starter Package adalah harga per outlet, bukan master tenant — mengelolanya di sini akan menduplikasi
              sistem harga yang sudah berjalan di Manager &gt; Catalog (per outlet, per jenis layanan). Klik &quot;Buka
              Catalog outlet&quot; untuk menambah/mengubah paket harga.
            </InfoNote>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Paket</th><th>Jenis Layanan</th><th>Durasi</th><th>Harga Awal</th><th>Komisi</th><th>Room</th><th>Status</th></tr>
              </thead>
              <tbody>
                {starter.map((p) => (
                  <tr key={p.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{p.name}</td>
                    <td className="muted small">{serviceTypes.find((t) => t.id === p.serviceTypeId)?.name}</td>
                    <td className="mono small">{minutesToHm(p.durationMin)}</td>
                    <td className="num small">{rp(p.listPrice)}</td>
                    <td className="num small muted">{rp(p.commissionValue)}</td>
                    <td className="muted small">{p.roomType}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="4 · Import Terapis"
            sub={`${employees.filter((e) => e.jobRole === "Terapis").length} terapis terdaftar`}
            action={<Link href="/manager/therapists" className="btn btn-quiet btn-sm">Buka Therapists & Staff</Link>}
          />
          {employeesLive ? (
            <div className="card-body">
              <InfoNote tone="accent" icon="info" title="Dikelola di Manager > Therapists & Staff, bukan di sini">
                Menambah/mengedit terapis (termasuk foto, skill, grade) sudah punya jalur sungguhan di Manager &gt;
                Therapists & Staff — klik &quot;Buka Therapists & Staff&quot; di atas. Import CSV massal belum dibangun.
              </InfoNote>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Terapis</th><th>Outlet</th><th>Grade</th><th>Skill</th><th>Status</th></tr></thead>
                <tbody>
                  {therapists.map((t) => (
                    <tr key={t.id}>
                      <td><PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} photoUrl={t.photoUrl} /></td>
                      <td className="muted small">{outletNameById.get(t.outletId) ?? t.outletId}</td>
                      <td><Badge tone="neutral">{t.therapistGrade}</Badge></td>
                      <td className="muted small">{t.skills.slice(0, 2).join(", ")}{t.skills.length > 2 ? ` +${t.skills.length - 2}` : ""}</td>
                      <td><Badge tone={t.status === "ACTIVE" ? "success" : "danger"} dot>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="card-pad">
          <div className="row g2" style={{ marginBottom: 12 }}>
            <Icon name="sparkles" size={16} style={{ color: "var(--accent)" }} />
            <h3>Skill Terapis</h3>
          </div>
          <div className="row g2 wrap" style={{ marginBottom: 12 }}>
            {SKILL_LIST.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
          <div className="tiny dim">
            Skill menentukan terapis mana yang boleh ditugaskan pada sebuah jenis layanan saat booking dibuat.
          </div>
        </Card>
      </div>
    </>
  );
}
