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
  /**
   * Nomor WhatsApp BOOKING per outlet, dikunci pada kode outlet
   * (mis. "AMY-CKW"). Sengaja terpisah dari `outlets.phone` di database:
   * nomor telepon outlet dan nomor yang melayani booking WA tidak selalu
   * sama — di Amethyst memang berbeda (telepon 6564/6767, booking 6565).
   * Format bebas; dinormalkan ke 62… di titik pemakaian.
   */
  waPerOutlet?: Record<string, string>;
  /**
   * Pelengkap kartu outlet, dikunci pada kode outlet: foto kecil tampak
   * depan + tautan Google Maps (Adjie 2026-09-04). Foto tampak depan
   * saat ini potongan Google Street View — atribusi "Foto: Google Street
   * View" WAJIB tetap tampil di bawahnya sesuai ketentuan Google; ganti
   * dengan foto sendiri kapan saja dengan menimpa file & menghapus
   * `photoCredit`.
   */
  outletExtras?: Record<string, { photo?: string; photoCredit?: string; mapsUrl?: string }>;
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
    // Adjie 2026-09-04: kedua outlet sementara memakai satu nomor
    // booking yang sama. Dibuat per outlet supaya Mekarwangi tinggal
    // diganti satu baris begitu punya nomornya sendiri.
    waPerOutlet: {
      "AMY-CKW": "087788116565",
      "AMY-MKW": "087788116565",
    },
    outletExtras: {
      "AMY-CKW": {
        photo: "/img/landing/amethyst/outlet-ckw.jpg",
        photoCredit: "Foto: Google Street View",
        mapsUrl: "https://maps.app.goo.gl/WHeLF3Bf9aDF1eTH8",
      },
      "AMY-MKW": {
        photo: "/img/landing/amethyst/outlet-mkw.jpg",
        photoCredit: "Foto: Google Street View",
        mapsUrl: "https://maps.app.goo.gl/A4a3zpwQ5LKDTq9V9",
      },
    },
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
