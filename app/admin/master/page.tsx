import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, StatusBadge, InfoNote, PersonCell } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { CATEGORIES, SERVICE_TYPES, packagesOf, PRIMARY_OUTLET, THERAPISTS, SKILL_LIST, outletName } from "@/lib/mock";
import { rp, minutesToHm } from "@/lib/format";

export default function MasterDataPage() {
  const outlet = PRIMARY_OUTLET;
  const packages = packagesOf(outlet.id).sort((a, b) => b.popularity - a.popularity);
  const starter = packages.slice(0, 6);
  const therapists = THERAPISTS.slice(0, 6);

  return (
    <>
      <PageHead
        title="Master Initial"
        desc="Data master awal tenant: kategori layanan, jenis layanan, starter package, dan import terapis."
        actions={
          <>
            <button className="btn btn-ghost btn-sm" disabled title="Belum tersedia — import terapis lewat CSV belum dibangun. Tambahkan lewat Manager → Therapists & Staff."><Icon name="upload" size={14} /> Import CSV</button>
            <button className="btn btn-primary btn-sm" disabled title="Belum tersedia — master kategori dikelola Manager Outlet di menu Catalog."><Icon name="plus" size={14} /> Kategori Baru</button>
          </>
        }
      />

      <MockDataNotice>
        Seluruh isi halaman ini contoh tampilan, dan tombol <strong>Import CSV</strong>,
        <strong>Kategori Baru</strong>, serta <strong>Unduh template</strong> belum berfungsi.
        Setup katalog yang sungguhan dilakukan Manager Outlet di menu <strong>Catalog</strong>.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Kategori Layanan" value={CATEGORIES.length} icon="layers" toneKey="teal" deltaLabel="Dipakai seluruh outlet" />
        <StatCard label="Jenis Layanan" value={SERVICE_TYPES.length} icon="book-open" toneKey="sky" deltaLabel="Terhubung ke skill terapis" />
        <StatCard label="Starter Package" value={packages.length} icon="ticket" toneKey="gold" deltaLabel="Template harga awal" />
        <StatCard label="Terapis Terdaftar" value={THERAPISTS.length} icon="hand-heart" toneKey="violet" deltaLabel={`${SKILL_LIST.length} skill tersedia`} />
      </div>

      <InfoNote icon="info" title="Urutan pengisian master data">
        Kategori → Jenis Layanan → Starter Package → Import Terapis. Setelah master awal terisi, Manager Outlet
        dapat menyesuaikan harga, durasi, dan komisi per outlet melalui menu Catalog.
      </InfoNote>

      <div className="grid grid-2" style={{ alignItems: "start", margin: "20px 0" }}>
        <Card>
          <CardHead title="1 · Kategori Layanan" sub={`${CATEGORIES.length} kategori tingkat tenant`} />
          <div className="card-body stack g3">
            {CATEGORIES.map((c) => {
              const types = SERVICE_TYPES.filter((t) => t.categoryId === c.id);
              return (
                <div key={c.id} className="row g3" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}>
                    <Icon name={c.icon} size={16} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small strong" style={{ color: "var(--text-1)" }}>{c.name}</div>
                    <div className="tiny dim truncate">{c.description}</div>
                  </div>
                  <Badge tone="neutral">{types.length} jenis</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="2 · Jenis Layanan" sub="Setiap jenis mensyaratkan skill terapis tertentu" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Jenis Layanan</th><th>Kategori</th><th>Skill Wajib</th></tr></thead>
              <tbody>
                {SERVICE_TYPES.map((t) => (
                  <tr key={t.id}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{t.name}</td>
                    <td className="muted small">{CATEGORIES.find((c) => c.id === t.categoryId)?.name}</td>
                    <td><Badge tone="accent">{t.requiredSkill}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="3 · Starter Package"
          sub="Template paket awal — harga final diatur Manager per outlet"
          action={<Link href="/manager/catalog" className="btn btn-quiet btn-sm">Buka Catalog outlet</Link>}
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Paket</th><th>Jenis Layanan</th><th>Durasi</th><th>Harga Awal</th><th>Komisi</th><th>Room</th><th>Status</th></tr>
            </thead>
            <tbody>
              {starter.map((p) => (
                <tr key={p.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{p.name}</td>
                  <td className="muted small">{SERVICE_TYPES.find((t) => t.id === p.serviceTypeId)?.name}</td>
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
      </Card>

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="4 · Import Terapis"
            sub={`${THERAPISTS.length} terapis berhasil diimport`}
            action={<button className="btn btn-quiet btn-sm" disabled title="Belum tersedia — belum ada template untuk diunduh."><Icon name="download" size={13} /> Unduh template</button>}
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Terapis</th><th>Outlet</th><th>Grade</th><th>Skill</th><th>Status</th></tr></thead>
              <tbody>
                {therapists.map((t) => (
                  <tr key={t.id}>
                    <td><PersonCell name={t.name} sub={t.code} toneKey={t.avatarTone} /></td>
                    <td className="muted small">{outletName(t.outletId)}</td>
                    <td><Badge tone="neutral">{t.therapistGrade}</Badge></td>
                    <td className="muted small">{t.skills.slice(0, 2).join(", ")}{t.skills.length > 2 ? ` +${t.skills.length - 2}` : ""}</td>
                    <td><Badge tone={t.status === "ACTIVE" ? "success" : "danger"} dot>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
