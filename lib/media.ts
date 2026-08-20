// ============================================================
// Spesifikasi media yang diunggah admin (cover outlet, foto
// fasilitas, logo). Dipakai bersama oleh UI unggah dan teks
// bantuan supaya angka yang ditampilkan ke admin selalu sama
// dengan yang divalidasi backend nanti.
// ============================================================

export interface MediaSpec {
  label: string;
  width: number;
  height: number;
  ratio: string;
  maxKb: number;
  note: string;
}

export const MEDIA_SPECS = {
  /**
   * Hero/banner halaman profil outlet. Dirender penuh selebar layar dengan
   * `object-fit: cover`, jadi sisi kiri-kanan bisa terpotong di layar sempit —
   * subjek utama sebaiknya di tengah.
   */
  cover: {
    label: "Cover Halaman Profil",
    width: 1920,
    height: 800,
    ratio: "12:5",
    maxKb: 300,
    note: "Taruh subjek utama di tengah — tepi kiri/kanan terpotong di layar HP.",
  },
  /** Foto fasilitas di galeri profil outlet. */
  gallery: {
    label: "Foto Fasilitas",
    width: 1200,
    height: 900,
    ratio: "4:3",
    maxKb: 250,
    note: "Foto ruangan/fasilitas. Hindari teks di dalam foto.",
  },
  /**
   * Foto latar aplikasi (opsional) — dipilih di Background Aplikasi, mengganti
   * lapisan gradient ambient dengan foto. Dirender full-bleed di belakang
   * seluruh layar dengan lapisan gelap otomatis di atasnya, jadi teks & kartu
   * tetap terbaca meski fotonya ramai.
   */
  appBackground: {
    label: "Background Aplikasi (Foto)",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    maxKb: 400,
    note: "Foto akan diberi lapisan gelap otomatis di seluruh halaman — pilih foto yang tetap enak dilihat meski agak digelapkan.",
  },
  /** Logo bisnis (sudah ada di BrandPicker). */
  logo: {
    label: "Logo Bisnis",
    width: 512,
    height: 512,
    ratio: "1:1",
    maxKb: 2048,
    note: "PNG/SVG dengan latar transparan memberi hasil terbaik.",
  },
} as const satisfies Record<string, MediaSpec>;

export type MediaKind = keyof typeof MEDIA_SPECS;

/** Baris ringkas untuk hint di bawah tombol unggah. */
export function specLine(kind: MediaKind): string {
  const s = MEDIA_SPECS[kind];
  const fmt = kind === "logo" ? "PNG/SVG" : "JPG/WebP";
  return `${s.width}×${s.height} px (${s.ratio}) · ${fmt} · maks ${s.maxKb} KB`;
}
