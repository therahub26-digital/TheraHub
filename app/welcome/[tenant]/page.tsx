import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getLandingData } from "@/lib/data/landing";
import { LANDING_ASSETS } from "@/lib/landingAssets";
import { brandByKey } from "@/lib/brand";
import LandingCarousel from "@/components/LandingCarousel";
import "./landing.css";

// ---------------------------------------------------------------------
// WEBSITE PUBLIK tenant — halaman yang tampil di "/" domain tenant
// (amethystbdg.my.id → rewrite ke sini oleh middleware.ts). 2026-09-04,
// permintaan Adjie: "masing2 tenant akan punya website sebelum masuk ke
// aplikasi (landing page)". Desain mengikuti mockup lavender-nya; warna
// aksen diambil dari brand preset tenant (logo_tone), jadi tenant lain
// otomatis tampil dengan identitasnya sendiri.
//
// Prinsip isi: SEMUA yang tampil datang dari data yang admin kelola
// sendiri di aplikasi — profil outlet (tagline/deskripsi/foto/fasilitas,
// saklar published), roster terapis (nama/foto/tingkat pijatan), kontak
// tenant. Tidak ada teks karangan tentang bisnis orang: bagian yang
// datanya belum diisi admin tidak dirender, bukan diisi placeholder
// yang terdengar meyakinkan.
// ---------------------------------------------------------------------

const INTENSITY_LABEL: Record<string, string> = {
  STRONG: "Strong",
  MEDIUM: "Medium",
  MEDIUM_STRONG: "Medium Strong",
};
const INTENSITY_CLASS: Record<string, string> = {
  STRONG: "",
  MEDIUM: "medium",
  MEDIUM_STRONG: "medium-strong",
};
const INTENSITY_DESC: Record<string, string> = {
  STRONG: "Tekanan kuat, cocok untuk meredakan pegal & tegang otot.",
  MEDIUM: "Tekanan sedang, nyaman untuk relaksasi harian.",
  MEDIUM_STRONG: "Kombinasi seimbang antara tekanan sedang dan kuat.",
};

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getLandingData(tenant);
  if (!data) return { title: "TheraHub" };

  const assets = LANDING_ASSETS[tenant] ?? {};
  const title = `${data.tenantName} — Pijat & Refleksi`;
  const description = data.tagline || `${data.tenantName} — pijat & refleksi profesional.`;

  // Open Graph (revisi Adjie 2026-09-04: link yang dibagikan lewat
  // WhatsApp harus menampilkan preview foto terapis di lobby).
  // metadataBase wajib supaya og:image jadi URL absolut — tanpa itu WA
  // tidak menampilkan gambar sama sekali.
  return {
    title,
    description,
    ...(assets.baseUrl ? { metadataBase: new URL(assets.baseUrl) } : {}),
    openGraph: {
      title,
      description,
      url: "/",
      siteName: data.tenantName,
      type: "website",
      locale: "id_ID",
      ...(assets.ogImage
        ? { images: [{ url: assets.ogImage, width: 1200, height: 630, alt: assets.heroAlt ?? data.tenantName }] }
        : {}),
    },
    twitter: {
      card: assets.ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(assets.ogImage ? { images: [assets.ogImage] } : {}),
    },
  };
}

export default async function TenantLandingPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const data = await getLandingData(tenant);
  if (!data) notFound();

  // Aset foto brand resmi tenant (lib/landingAssets.ts) — revisi Adjie
  // 2026-09-04: hero memakai foto terapis di lobby, section ruangan
  // memakai foto interior asli; brandKey memaksa palet mockup (lavender
  // untuk Amethyst) tanpa menyentuh tema aplikasi.
  const assets = LANDING_ASSETS[tenant] ?? {};
  const brand = brandByKey(assets.brandKey ?? data.logoTone);
  const heroOutlet = data.outlets.find((o) => o.coverUrl) ?? data.outlets[0];
  const heroImg = assets.hero ?? heroOutlet?.coverUrl ?? "";
  // Nomor WA booking: per outlet dari landingAssets (lihat catatan di
  // sana soal kenapa terpisah dari outlets.phone), jatuh ke nomor WA
  // tenant kalau outlet itu belum punya.
  function waLink(nomor: string | undefined, sapaan: string): string | null {
    const digit = (nomor ?? "").replace(/[^0-9]/g, "");
    if (!digit) return null;
    const intl = digit.startsWith("0") ? "62" + digit.slice(1) : digit;
    return `https://wa.me/${intl}?text=${encodeURIComponent(sapaan)}`;
  }
  const waOutlet = (o: { code: string; name: string }) =>
    waLink(assets.waPerOutlet?.[o.code] ?? data.whatsapp, `Halo ${o.name}, saya mau booking pijat.`);
  const waHref =
    (heroOutlet ? waOutlet(heroOutlet) : null) ??
    waLink(data.whatsapp, `Halo ${data.tenantName}, saya mau booking pijat.`);
  const phoneShown = data.whatsapp || data.outlets.find((o) => o.phone)?.phone || "";
  const cities = Array.from(new Set(data.outlets.map((o) => o.city).filter(Boolean)));
  const intensitiesPresent = Array.from(
    new Set(data.therapists.map((t) => t.intensity).filter((v): v is NonNullable<typeof v> => v !== null)),
  );
  // Urutan tampil tetap Strong → Medium → Medium Strong seperti mockup.
  const intensityOrder = (["STRONG", "MEDIUM", "MEDIUM_STRONG"] as const).filter((k) => intensitiesPresent.includes(k));
  const gallery = data.outlets.flatMap((o) => o.gallery).slice(0, 6);
  // Foto brand resmi diutamakan; kalau tenant belum punya entri di
  // landingAssets, jatuh ke galeri foto profil outlet dari database.
  const roomCards: { src: string; label: string; desc?: string }[] =
    assets.rooms ?? gallery.map((g) => ({ src: g.src, label: g.label }));
  const tenantHighlights = Array.from(new Set(data.outlets.flatMap((o) => o.highlights)));
  const facilities = data.outlets.flatMap((o) => o.facilities);
  const seen = new Set<string>();
  const uniqueFacilities = facilities.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true))).slice(0, 6);

  return (
    <div className="lp" style={{ ["--lp-accent" as string]: brand.accent, ["--lp-accent-2" as string]: brand.accent2 }}>
      <div className="lp-wrap">
        <header className="lp-header">
          <div className="lp-logo">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt={data.tenantName} />
            ) : (
              <span className="lp-logo-mark">{data.tenantName.charAt(0).toLowerCase()}</span>
            )}
            {data.tenantName}
          </div>
          <nav className="lp-nav">
            <a href="#tentang">Tentang</a>
            {data.therapists.length > 0 && <a href="#terapis">Terapis</a>}
            {roomCards.length > 0 && <a href="#ruangan">Ruangan</a>}
            <a href="#kontak">Kontak</a>
          </nav>
          {/* Revisi Adjie 2026-09-04 ("apa bedanya ... buat siapa?"):
              pintu /login mayoritas dipakai STAF, jadi tidak pantas jadi
              tombol paling menonjol di website pemasaran. Dikecilkan
              jadi tautan teks; tombol besar milik tamu ada di hero. */}
          <Link href="/login" className="lp-staff-link">Login staf &amp; member</Link>
        </header>

        <main>
          <section className="lp-hero">
            <div>
              <h1>
                {data.tenantName.split(" ")[0]}
                {data.tenantName.includes(" ") && (
                  <>
                    <br />
                    <span className="lp-accent-text">{data.tenantName.split(" ").slice(1).join(" ")}</span>
                  </>
                )}
              </h1>
              {data.tagline && <p className="lp-hero-tagline">{data.tagline}</p>}
              {heroOutlet?.description && <p className="lp-hero-desc">{heroOutlet.description}</p>}
              {/* Satu tombol besar untuk tamu. Jalur "sudah punya akun"
                  turun jadi baris kecil di bawahnya — dulu dua tombol
                  sejajar bikin tamu tidak tahu yang mana miliknya. */}
              <div className="lp-hero-cta">
                {waHref ? (
                  <a href={waHref} className="lp-btn lp-btn-primary lp-btn-lg" target="_blank" rel="noopener noreferrer">
                    Booking via WhatsApp
                  </a>
                ) : (
                  <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">Booking Sekarang</Link>
                )}
              </div>
              <p className="lp-hero-alt">
                Belum punya akun? <Link href="/register">Daftar member</Link> · Sudah punya?{" "}
                <Link href="/login">Masuk</Link>
              </p>
              {heroOutlet && heroOutlet.highlights.length > 0 && (
                <div className="lp-hero-points">
                  {heroOutlet.highlights.slice(0, 3).map((h) => <span key={h}>{h}</span>)}
                </div>
              )}
            </div>
            <div className="lp-hero-img">
              {heroImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroImg} alt={assets.heroAlt ?? heroOutlet?.name ?? data.tenantName} />
              ) : null}
            </div>
          </section>

          <div className="lp-stats">
            <div className="lp-stat">
              <b>{data.therapists.length}</b>
              <span>Terapis Profesional</span>
            </div>
            <div className="lp-stat">
              <b>{intensityOrder.length > 0 ? intensityOrder.map((k) => INTENSITY_LABEL[k]).join(" / ") : "Pijat & Refleksi"}</b>
              <span>Pilihan Pijatan</span>
            </div>
            <div className="lp-stat">
              <b>{data.outlets.length}</b>
              <span>{data.outlets.length > 1 ? "Outlet" : "Lokasi"}</span>
            </div>
            <div className="lp-stat">
              <b>{cities.join(" · ") || "—"}</b>
              <span>Lokasi Strategis</span>
            </div>
          </div>

          <section className="lp-section" id="tentang">
            <h2 className="lp-h2">Tentang {data.tenantName}</h2>
            <p className="lp-h2-sub">Alamat, jam buka, dan kontak tiap outlet.</p>
            {/* Revisi Adjie 2026-09-04: poin unggulan berlaku umum untuk
                semua lokasi, jadi tampil SEKALI di bawah judul — bukan
                diulang di tiap kartu outlet. */}
            {tenantHighlights.length > 0 && (
              <div className="lp-highlights lp-highlights-center">
                {tenantHighlights.map((h) => <span key={h}>{h}</span>)}
              </div>
            )}
            {assets.about && (
              <div className="lp-about-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assets.about} alt={`Tampak depan ${data.tenantName}`} loading="lazy" />
              </div>
            )}
            <div className="lp-outlets">
              {data.outlets.map((o) => {
                const ekstra = assets.outletExtras?.[o.code];
                const namaPendek = o.name.replace(/^.*—\s*/, "");
                return (
                  <div className="lp-outlet-card" key={o.code || o.name}>
                    {/* Foto kecil tampak depan (asli, dari Street View) + ikon
                        peta — tamu langsung tahu bangunan mana yang dicari. */}
                    {ekstra?.photo && (
                      <div className="lp-outlet-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ekstra.photo} alt={`Tampak depan ${o.name}`} loading="lazy" />
                        {ekstra.photoCredit && <span className="lp-photo-credit">{ekstra.photoCredit}</span>}
                      </div>
                    )}
                    <div className="lp-outlet-head">
                      <h3>{o.name}</h3>
                      {ekstra?.mapsUrl && (
                        <a
                          href={ekstra.mapsUrl}
                          className="lp-maps-link"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Buka ${o.name} di Google Maps`}
                          title="Buka di Google Maps"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
                            <circle cx="12" cy="10" r="2.6" />
                          </svg>
                          Google Maps
                        </a>
                      )}
                    </div>
                    {(o.tagline || o.description) && <p>{o.tagline || o.description}</p>}
                    <div className="lp-outlet-meta">
                      {o.address && (
                        <div>
                          📍{" "}
                          {ekstra?.mapsUrl ? (
                            <a href={ekstra.mapsUrl} target="_blank" rel="noopener noreferrer"><b>{o.address}</b></a>
                          ) : (
                            <b>{o.address}</b>
                          )}
                          {o.city ? `, ${o.city}` : ""}
                        </div>
                      )}
                      {o.openHours && <div>🕐 {o.openHours}</div>}
                      {o.phone && <div>📞 {o.phone}</div>}
                    </div>
                    {/* Tombol booking per outlet — tamu memesan ke outlet
                        yang benar tanpa perlu memilih ulang di chat. */}
                    {waOutlet(o) && (
                      <a
                        href={waOutlet(o)!}
                        className="lp-btn lp-btn-primary lp-btn-sm"
                        style={{ marginTop: 14 }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Booking di {namaPendek}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {data.therapists.length > 0 && (
            <section className="lp-section" id="terapis">
              <h2 className="lp-h2">Terapis Kami</h2>
              <p className="lp-h2-sub">Terapis aktif beserta tingkat pijatannya.</p>
              <LandingCarousel>
                {data.therapists.map((t) => (
                  <div className="lp-therapist" key={t.name}>
                    <div className="lp-therapist-photo">
                      {t.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.photoUrl} alt={t.name} loading="lazy" />
                      ) : (
                        <div className="lp-initial">{t.name.charAt(0)}</div>
                      )}
                    </div>
                    <div className="lp-therapist-row">
                      <b>{t.name.split(" ")[0]}</b>
                      {t.intensity && (
                        <span className={`lp-badge ${INTENSITY_CLASS[t.intensity]}`}>{INTENSITY_LABEL[t.intensity]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </LandingCarousel>
            </section>
          )}

          {(roomCards.length > 0 || uniqueFacilities.length > 0) && (
            <section className="lp-section" id="ruangan">
              <h2 className="lp-h2">Ruangan &amp; Fasilitas</h2>
              <p className="lp-h2-sub">Suasana ruangan dan fasilitas yang tersedia.</p>
              {roomCards.length > 0 && (
                <div className="lp-gallery" style={{ marginBottom: uniqueFacilities.length > 0 ? 18 : 0 }}>
                  {roomCards.map((g) => (
                    <div className="lp-room" key={g.src}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.src} alt={g.label} loading="lazy" />
                      {(g.label || g.desc) && (
                        <div>
                          <b>{g.label}</b>
                          {g.desc && <p>{g.desc}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {uniqueFacilities.length > 0 && (
                <div className="lp-highlights" style={{ justifyContent: "center" }}>
                  {uniqueFacilities.map((f) => <span key={f.name}>{f.name}</span>)}
                </div>
              )}
            </section>
          )}

          {intensityOrder.length > 0 && (
            <section className="lp-section" id="pijatan">
              <h2 className="lp-h2">Pilihan Pijatan</h2>
              <p className="lp-h2-sub">Pilih tingkat pijatan sesuai kenyamanan dan preferensi Anda.</p>
              <div className="lp-intensities">
                {intensityOrder.map((k) => (
                  <div className="lp-intensity" key={k}>
                    <b>{INTENSITY_LABEL[k]}</b>
                    <p>{INTENSITY_DESC[k]}</p>
                  </div>
                ))}
              </div>
              <p className="lp-intensity-note">Terapis kami siap membantu memilihkan yang paling pas.</p>
            </section>
          )}

          <section
            className="lp-cta"
            id="kontak"
            style={
              assets.ctaBg
                ? {
                    backgroundImage: `linear-gradient(100deg, color-mix(in srgb, var(--lp-accent-2) 88%, transparent), color-mix(in srgb, var(--lp-accent-2) 45%, transparent)), url(${assets.ctaBg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div>
              <h2>Siap untuk relaksasi yang nyaman?</h2>
              <p>Hubungi kami lewat WhatsApp — terapis dan jam yang kosong langsung kami bantu carikan.</p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {waHref && (
                <a href={waHref} className="lp-btn lp-btn-primary" target="_blank" rel="noopener noreferrer">
                  Hubungi Kami
                </a>
              )}
            </div>
          </section>
        </main>

        <footer className="lp-footer">
          <div>
            <div className="lp-logo" style={{ marginBottom: 8 }}>
              {data.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logoUrl} alt="" />
              ) : (
                <span className="lp-logo-mark">{data.tenantName.charAt(0).toLowerCase()}</span>
              )}
              {data.tenantName}
            </div>
            {data.tagline && <p style={{ margin: 0 }}>{data.tagline}</p>}
          </div>
          <div>
            <h4>Navigasi</h4>
            <nav>
              <a href="#tentang">Tentang</a>
              {data.therapists.length > 0 && <a href="#terapis">Terapis</a>}
              {roomCards.length > 0 && <a href="#ruangan">Ruangan</a>}
              <Link href="/register">Daftar member</Link>
              <Link href="/login">Login staf &amp; member</Link>
            </nav>
          </div>
          <div>
            <h4>Kontak Kami</h4>
            <nav>
              {data.outlets.map((o) => o.address && <span key={o.name}>📍 {o.name}: {o.address}</span>)}
              {phoneShown && <span>📞 Telp / WhatsApp: {phoneShown}</span>}
              {data.instagram && (
                <a href={`https://instagram.com/${data.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                  📷 {data.instagram}
                </a>
              )}
            </nav>
          </div>
          <div className="lp-powered">Didukung TheraHub — Spa &amp; Massage Business Management.</div>
        </footer>
      </div>
    </div>
  );
}
