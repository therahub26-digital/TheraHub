import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, InfoNote, Badge, PersonCell, Switch, Field } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { therapistsOf } from "@/lib/mock";
import { getOutletById, isLiveOutletsData } from "@/lib/data/outlets";
import { MEDIA_SPECS, specLine } from "@/lib/media";
import {
  OutletPublishSwitch,
  OutletCoverUploader,
  OutletCoverDropzone,
  OutletTextForm,
  OutletHighlightsEditor,
  OutletFacilitiesEditor,
  AddFacilityButton,
  OutletGalleryEditor,
  CoverSpecBadges,
  UnpublishedNote,
} from "@/components/OutletProfileEditor";

// ---------------------------------------------------------------------
// Adjie (2026-08-25): "outlet: halaman profil outlet belum berfungsi."
// Halaman ini dulunya 100% pratinjau — setiap tombol `disabled`. Sekarang
// tersambung ke lib/actions/outletProfile.ts (tabel & RLS-nya sudah ada
// sejak migrasi 0002; yang baru cuma bucket Storage di migrasi 0028).
//
// Kalau sesi ini BUKAN login sungguhan (mis. sedang dilihat lewat "Ganti
// Role"), lib/data/outlets.ts jatuh balik ke data contoh yang tidak punya
// baris database — jadi editornya sengaja tidak dirender dan halaman
// kembali jadi pratinjau jujur, bukan tombol yang diam-diam gagal.
// ---------------------------------------------------------------------

export default async function OutletProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [outlet, live] = await Promise.all([getOutletById(id), isLiveOutletsData()]);
  if (!outlet) notFound();
  const p = outlet.profile;
  const therapists = therapistsOf(outlet.id);
  const cover = MEDIA_SPECS.cover;
  const shot = MEDIA_SPECS.gallery;

  const editableFacilities = p.facilities.filter(
    (f): f is { id: string; name: string; icon: string; desc: string } => typeof f.id === "string"
  );
  const editableGallery = p.gallery.filter(
    (g): g is { id: string; label: string; src: string } => typeof g.id === "string"
  );

  return (
    <>
      <Link href="/admin/outlets" className="row g2 small muted" style={{ marginBottom: 14, width: "fit-content" }}>
        <Icon name="arrow-left" size={14} /> Kembali ke Outlets
      </Link>

      <PageHead
        title={`Profil Outlet — ${outlet.name.replace("Amethyst — ", "")}`}
        desc="Halaman ini tampil ke customer seperti halaman iklan outlet: lokasi, fasilitas, dan terapis unggulan — membantu tamu baru memilih outlet."
        actions={
          <Link href={`/customer/outlets/${outlet.id}`} className="btn btn-ghost btn-sm">
            <Icon name="eye" size={14} /> Lihat Preview
          </Link>
        }
      />

      {!live && (
        <MockDataNotice title="Sedang melihat data contoh">
          Sesi ini bukan login sungguhan (kemungkinan lewat <strong>Ganti Role</strong>), jadi outlet yang
          ditampilkan adalah data contoh dan belum punya baris di database. Kontrol penyuntingan sengaja
          disembunyikan supaya tidak ada tombol yang kelihatan aktif tapi diam-diam gagal. Login sebagai
          Admin/Owner tenant atau Manager outlet ini untuk mengeditnya.
        </MockDataNotice>
      )}

      {live && (
        <InfoNote icon="info" title="Perubahan tersimpan otomatis per bagian">
          Halaman ini tidak punya satu tombol Simpan besar. Setiap bagian punya tombol simpannya sendiri
          (tagline &amp; deskripsi), atau langsung tersimpan begitu diubah (saklar publikasi, unggah/hapus
          foto, poin unggulan, fasilitas). Klik <strong>Lihat Preview</strong> untuk melihat hasilnya
          seperti yang dilihat tamu.
        </InfoNote>
      )}

      <Card style={{ marginBottom: 20, marginTop: live ? 20 : 0 }}>
        <CardHead
          title="Status Publikasi"
          sub={p.published ? "Halaman ini aktif dan bisa dilihat customer" : "Halaman ini masih tersembunyi dari customer"}
          action={live ? <OutletPublishSwitch outletId={outlet.id} published={p.published} /> : <Switch on={p.published} />}
        />
        {!p.published && <UnpublishedNote />}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Cover Halaman Profil"
          sub={`Foto besar di bagian atas halaman — ${specLine("cover")}`}
          action={live ? <OutletCoverUploader outletId={outlet.id} hasCover={!!p.cover} /> : undefined}
        />
        <div className="card-body">
          {p.cover ? (
            <>
              <div
                style={{
                  position: "relative", width: "100%", aspectRatio: `${cover.width} / ${cover.height}`,
                  maxHeight: 260, borderRadius: "var(--r-md)", overflow: "hidden",
                  border: "1px solid var(--border)", background: "var(--bg-surface-2)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.cover}
                  alt={`Cover ${outlet.name}`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div
                  aria-hidden
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(180deg, transparent 45%, rgba(3,7,12,0.80) 100%)",
                  }}
                />
                <div style={{ position: "absolute", left: 14, right: 14, bottom: 12 }}>
                  <div className="small bold" style={{ color: "#fff", textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}>
                    {p.tagline}
                  </div>
                  <div className="tiny" style={{ color: "rgba(255,255,255,0.82)" }}>{outlet.address}</div>
                </div>
              </div>
              <CoverSpecBadges />
            </>
          ) : live ? (
            <OutletCoverDropzone outletId={outlet.id} />
          ) : (
            <div
              className="stack g2"
              style={{
                width: "100%", aspectRatio: `${cover.width} / ${cover.height}`, maxHeight: 220,
                alignItems: "center", justifyContent: "center", borderRadius: "var(--r-md)",
                border: "1.5px dashed var(--border-3)", color: "var(--text-3)",
              }}
            >
              <span className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
                <Icon name="camera" size={19} />
              </span>
              <span className="small bold" style={{ color: "var(--text-2)" }}>Belum ada foto cover</span>
              <span className="tiny dim">{specLine("cover")}</span>
            </div>
          )}
          <InfoNote icon="info" title="Kenapa ukurannya segini?">
            Cover dirender melebar penuh dengan <span className="mono">object-fit: cover</span>, jadi sisi kiri dan kanan
            terpotong di layar HP. {cover.note} Foto akan diberi lapisan gelap otomatis agar teks di atasnya tetap terbaca
            di mode terang maupun gelap.
          </InfoNote>
        </div>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card className="card-pad" style={{ gridColumn: "span 2" }}>
          <div className="row g2" style={{ marginBottom: 12 }}>
            <Icon name="megaphone" size={16} style={{ color: "var(--accent)" }} />
            <h3>Tagline &amp; Deskripsi</h3>
          </div>
          {live ? (
            <OutletTextForm outletId={outlet.id} tagline={p.tagline} description={p.description} />
          ) : (
            <div className="stack g4">
              <Field label="Tagline" hint="Satu kalimat singkat, tampil besar di bagian atas halaman">
                <input className="input" defaultValue={p.tagline} readOnly />
              </Field>
              <Field label="Deskripsi" hint="Jelaskan suasana, keunggulan, dan lokasi outlet">
                <textarea className="textarea" defaultValue={p.description} readOnly style={{ minHeight: 96 }} />
              </Field>
            </div>
          )}
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Poin Unggulan" sub="Ditampilkan sebagai chip singkat di bagian hero halaman" />
        <div className="card-body">
          {live ? (
            <OutletHighlightsEditor outletId={outlet.id} highlights={p.highlights} />
          ) : (
            <div className="row g2 wrap">
              {p.highlights.map((h, i) => (
                <span key={i} className="chip on"><Icon name="check" size={12} /> {h}</span>
              ))}
              {p.highlights.length === 0 && <span className="tiny dim">Belum ada poin unggulan.</span>}
            </div>
          )}
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Fasilitas"
          sub={`${p.facilities.length} fasilitas ditampilkan`}
          action={live ? <AddFacilityButton outletId={outlet.id} /> : undefined}
        />
        <div className="card-body">
          {live ? (
            <OutletFacilitiesEditor facilities={editableFacilities} />
          ) : (
            <div className="grid grid-3">
              {p.facilities.map((f, i) => (
                <div key={i} className="stack g2" style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                  <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                    <Icon name={f.icon} size={15} />
                  </span>
                  <div className="small strong" style={{ color: "var(--text-1)" }}>{f.name}</div>
                  <div className="tiny dim">{f.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Galeri Foto Fasilitas" sub={`${p.gallery.length} foto · ${specLine("gallery")}`} />
        <div className="card-body">
          {live ? (
            <OutletGalleryEditor outletId={outlet.id} photos={editableGallery} profilePhotoUrl={p.profilePhotoUrl} />
          ) : (
            <div className="grid grid-3">
              {p.gallery.map((g, i) => (
                <div key={i} className="stack g2">
                  <div
                    style={{
                      position: "relative", aspectRatio: `${shot.width} / ${shot.height}`,
                      borderRadius: "var(--r-md)", overflow: "hidden",
                      border: "1px solid var(--border)", background: "var(--bg-surface-2)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.src} alt={g.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div className="tiny dim">{g.label}</div>
                </div>
              ))}
              {p.gallery.length === 0 && <span className="tiny dim">Belum ada foto.</span>}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Terapis Unggulan"
          sub="Opsional — tampilkan terapis baru atau favorit tamu di halaman profil"
        />
        <div className="card-body stack g3">
          <InfoNote icon="info">
            Penandaan terapis unggulan belum tersambung ke database — masih menunggu kolomnya ditambahkan
            di tabel <span className="mono">employees</span>. Bagian ini sengaja dibiarkan lihat-saja
            supaya tidak ada saklar yang kelihatan aktif tapi tidak menyimpan apa pun.
          </InfoNote>
          {therapists.map((t) => (
            <div key={t.id} className="stack g3" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
              <div className="between">
                <PersonCell name={t.name} sub={`${t.therapistGrade} · ${t.skills.slice(0, 2).join(", ")}`} toneKey={t.avatarTone} />
                <div className="row g3">
                  {t.featured && <Badge tone="gold" icon="star">{t.featuredBadge}</Badge>}
                  <Switch on={!!t.featured} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
