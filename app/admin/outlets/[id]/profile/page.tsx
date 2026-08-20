import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Field, Switch, InfoNote, Badge, PersonCell } from "@/components/ui";
import { therapistsOf } from "@/lib/mock";
import { getOutletById } from "@/lib/data/outlets";
import { MEDIA_SPECS, specLine } from "@/lib/media";

export default async function OutletProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outlet = await getOutletById(id);
  if (!outlet) notFound();
  const p = outlet.profile;
  const therapists = therapistsOf(outlet.id);
  const cover = MEDIA_SPECS.cover;
  const shot = MEDIA_SPECS.gallery;

  return (
    <>
      <Link href="/admin/outlets" className="row g2 small muted" style={{ marginBottom: 14, width: "fit-content" }}>
        <Icon name="arrow-left" size={14} /> Kembali ke Outlets
      </Link>

      <PageHead
        title={`Profil Outlet — ${outlet.name.replace("Amethyst — ", "")}`}
        desc="Halaman ini tampil ke customer seperti halaman iklan outlet: lokasi, fasilitas, dan terapis unggulan — membantu tamu baru memilih outlet."
        actions={
          <>
            <Link href={`/customer/outlets/${outlet.id}`} className="btn btn-ghost btn-sm">
              <Icon name="eye" size={14} /> Lihat Preview
            </Link>
            <button className="btn btn-primary btn-sm">
              <Icon name="save" size={14} /> Simpan Perubahan
            </button>
          </>
        }
      />

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Status Publikasi"
          sub={p.published ? "Halaman ini aktif dan bisa dilihat customer" : "Halaman ini masih tersembunyi dari customer"}
          action={<Switch on={p.published} />}
        />
        {!p.published && (
          <div className="card-body" style={{ paddingTop: 0 }}>
            <InfoNote tone="warning" icon="alert-triangle">
              Outlet ini belum publikasikan halaman profilnya — biasanya karena masih dalam proses setup. Aktifkan
              switch di atas begitu foto dan fasilitas sudah siap ditampilkan.
            </InfoNote>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Cover Halaman Profil"
          sub={`Foto besar di bagian atas halaman — ${specLine("cover")}`}
          action={
            <div className="row g2">
              <button className="btn btn-ghost btn-sm"><Icon name="upload" size={13} /> {p.cover ? "Ganti Foto" : "Unggah Foto"}</button>
              {p.cover && <button className="btn btn-quiet btn-sm"><Icon name="trash" size={13} /> Hapus</button>}
            </div>
          }
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
              <div className="row g3 wrap" style={{ marginTop: 12 }}>
                <Badge tone="neutral" icon="images">{cover.width}×{cover.height} px</Badge>
                <Badge tone="neutral">Rasio {cover.ratio}</Badge>
                <Badge tone="neutral">Maks {cover.maxKb} KB</Badge>
                <span className="tiny dim">{cover.note}</span>
              </div>
            </>
          ) : (
            <button
              className="stack g2"
              style={{
                width: "100%", aspectRatio: `${cover.width} / ${cover.height}`, maxHeight: 220,
                alignItems: "center", justifyContent: "center", borderRadius: "var(--r-md)",
                border: "1.5px dashed var(--border-3)", background: "transparent", color: "var(--text-3)",
              }}
            >
              <span className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
                <Icon name="camera" size={19} />
              </span>
              <span className="small bold" style={{ color: "var(--text-2)" }}>Unggah foto cover</span>
              <span className="tiny dim">{specLine("cover")}</span>
            </button>
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
          <div className="stack g4">
            <Field label="Tagline" hint="Satu kalimat singkat, tampil besar di bagian atas halaman">
              <input className="input" defaultValue={p.tagline} />
            </Field>
            <Field label="Deskripsi" hint="Jelaskan suasana, keunggulan, dan lokasi outlet">
              <textarea className="textarea" defaultValue={p.description} style={{ minHeight: 96 }} />
            </Field>
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Poin Unggulan" sub="Ditampilkan sebagai chip singkat di bagian hero halaman" />
        <div className="card-body">
          <div className="row g2 wrap" style={{ marginBottom: 12 }}>
            {p.highlights.map((h, i) => (
              <span key={i} className="chip on">
                <Icon name="check" size={12} /> {h}
                <Icon name="x" size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
              </span>
            ))}
          </div>
          <div className="row g2">
            <input className="input" placeholder="Tambah poin unggulan baru…" style={{ maxWidth: 340 }} />
            <button className="btn btn-ghost btn-sm">
              <Icon name="plus" size={13} /> Tambah
            </button>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Fasilitas"
          sub={`${p.facilities.length} fasilitas ditampilkan`}
          action={<button className="btn btn-ghost btn-sm"><Icon name="plus" size={13} /> Tambah Fasilitas</button>}
        />
        <div className="card-body">
          <div className="grid grid-3">
            {p.facilities.map((f, i) => (
              <div key={i} className="stack g2" style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                <div className="between">
                  <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                    <Icon name={f.icon} size={15} />
                  </span>
                  <button className="btn btn-quiet btn-icon btn-sm"><Icon name="trash" size={13} /></button>
                </div>
                <input className="input" defaultValue={f.name} style={{ height: 32, fontSize: 12.5, fontWeight: 600 }} />
                <textarea className="textarea" defaultValue={f.desc} style={{ minHeight: 56, fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title="Galeri Foto Fasilitas"
          sub={`${p.gallery.length} foto · ${specLine("gallery")}`}
          action={<button className="btn btn-ghost btn-sm"><Icon name="upload" size={13} /> Tambah Foto</button>}
        />
        <div className="card-body">
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
                  <img
                    src={g.src}
                    alt={g.label}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <button
                    className="btn btn-quiet btn-icon btn-sm"
                    style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.42)", color: "#fff" }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>
                <input className="input" defaultValue={g.label} style={{ height: 30, fontSize: 12 }} />
              </div>
            ))}

            <button
              className="stack g2"
              style={{
                aspectRatio: `${shot.width} / ${shot.height}`, alignItems: "center", justifyContent: "center",
                borderRadius: "var(--r-md)", border: "1.5px dashed var(--border-3)",
                background: "transparent", color: "var(--text-3)",
              }}
            >
              <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
                <Icon name="camera" size={16} />
              </span>
              <span className="tiny bold" style={{ color: "var(--text-2)" }}>Tambah foto</span>
              <span className="tiny dim">{shot.width}×{shot.height}</span>
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Terapis Unggulan"
          sub="Opsional — tampilkan terapis baru atau favorit tamu di halaman profil"
        />
        <div className="card-body stack g3">
          {therapists.map((t) => (
            <div key={t.id} className="stack g3" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
              <div className="between">
                <PersonCell name={t.name} sub={`${t.therapistGrade} · ${t.skills.slice(0, 2).join(", ")}`} toneKey={t.avatarTone} />
                <div className="row g3">
                  {t.featured && <Badge tone="gold" icon="star">{t.featuredBadge}</Badge>}
                  <Switch on={!!t.featured} />
                </div>
              </div>
              {t.featured && (
                <div className="grid grid-2" style={{ paddingLeft: 44 }}>
                  <Field label="Badge Promosi">
                    <input className="input" defaultValue={t.featuredBadge} style={{ height: 34, fontSize: 12.5 }} />
                  </Field>
                  <Field label="Bio Singkat">
                    <input className="input" defaultValue={t.bio} style={{ height: 34, fontSize: 12.5 }} />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
