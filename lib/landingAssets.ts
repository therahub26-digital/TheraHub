// ---------------------------------------------------------------------
// Aset visual landing per tenant (2026-09-04, revisi Adjie: "sebisa
// mungkin meniru tampilan landing page contoh ... cover background
// besarnya sebaiknya foto terapis di lobby").
//
// Foto brand resmi tenant (dikirim Adjie, dioptimalkan untuk web) hidup
// di public/img/landing/<slug>/ dan dipetakan di sini. Ini PELENGKAP
// data database, bukan pengganti: teks, kontak, roster terapis, dan
// badge tetap dari data yang dikelola admin di aplikasi. Foto section
// Ruangan memakai daftar di sini kalau ada; kalau tidak, jatuh ke
// galeri foto profil outlet dari database.
//
// brandKey: paksa palet landing tenant ini ke preset tertentu, terlepas
// dari logo_tone aplikasi — mockup Amethyst lavender, sedangkan tema
// aplikasinya sedang memakai preset lain; keduanya tidak harus sama.
//
// BUKAN file "use server" — meng-export konstanta (pelajaran 7.11/7.19).
// ---------------------------------------------------------------------

export type LandingRoomPhoto = { src: string; label: string; desc: string };

export type LandingAssets = {
  /** Override preset warna landing (kunci lib/brand.ts). */
  brandKey?: string;
  /** Foto besar hero — permintaan Adjie: foto terapis di lobby. */
  hero?: string;
  heroAlt?: string;
  /** Tiga kartu section Ruangan & Fasilitas. */
  rooms?: LandingRoomPhoto[];
  /** Foto pendamping section Tentang (mis. tampak depan ruko). */
  about?: string;
  /** Foto latar band CTA (diberi overlay gradasi brand di CSS). */
  ctaBg?: string;
  /** URL kanonik landing tenant — jadi metadataBase supaya og:image
   *  absolut dan preview link WhatsApp/socmed menampilkan foto. */
  baseUrl?: string;
  /** Gambar Open Graph 1200×630 untuk preview link (WA, socmed). */
  ogImage?: string;
};

export const LANDING_ASSETS: Record<string, LandingAssets> = {
  amethyst: {
    brandKey: "violet",
    hero: "/img/landing/amethyst/hero-terapis-lobby.jpg",
    heroAlt: "Terapis Amethyst di lobby",
    about: "/img/landing/amethyst/storefront.jpg",
    ctaBg: "/img/landing/amethyst/ambience.jpg",
    baseUrl: "https://www.amethystbdg.my.id",
    ogImage: "/img/landing/amethyst/og.jpg",
    rooms: [
      {
        src: "/img/landing/amethyst/private-room.jpg",
        label: "Private Room",
        desc: "Ruang pribadi yang tenang & nyaman untuk relaksasi maksimal.",
      },
      {
        src: "/img/landing/amethyst/cubicles.jpg",
        label: "Area Treatment",
        desc: "Bilik tirai bersih dan terjaga privasinya, memberikan kenyamanan terbaik.",
      },
      {
        src: "/img/landing/amethyst/lobby.jpg",
        label: "Ruang Tunggu Nyaman",
        desc: "Area tunggu yang nyaman dengan suasana tenang sebelum perawatan.",
      },
    ],
  },
};
