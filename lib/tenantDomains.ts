// ---------------------------------------------------------------------
// Peta domain → tenant untuk landing page publik (2026-09-04).
//
// Arsitektur domain (keputusan Adjie):
//   - www.therahub.web.id  → halaman platform TheraHub (root "/" yang
//     sekarang: pemilih role demo). Domain "netral" milik produk.
//   - amethystbdg.my.id    → WEBSITE PUBLIK tenant Amethyst (landing
//     page), bukan lagi pemilih role. Tamu yang membuka domain tenant
//     melihat brand tenant itu, lengkap dengan tombol Masuk ke Aplikasi.
//
// middleware.ts membaca host request dan me-rewrite "/" pada domain
// tenant ke /welcome/<slug>. Semua path lain (/login, /kasir, /admin,
// dst.) tetap berfungsi persis sama di kedua domain — RLS-lah yang
// mengunci datanya, bukan domain.
//
// SENGAJA hardcode, bukan kolom tenants.custom_domain: menambah domain
// baru toh selalu butuh langkah manual di Vercel (add domain + DNS),
// jadi satu entri di sini bukan beban ekstra — dan peta statis berarti
// middleware tidak perlu query database pada SETIAP request "/" publik.
// Naikkan ke kolom database kalau tenant sudah puluhan.
//
// BUKAN file "use server" — meng-export konstanta (pelajaran 7.11/7.19).
// ---------------------------------------------------------------------

export const TENANT_DOMAINS: Record<string, string> = {
  "amethystbdg.my.id": "amethyst",
  "www.amethystbdg.my.id": "amethyst",
};

/** Slug tenant yang sah untuk /welcome/<slug> — dipakai lib/data/landing.ts
 *  untuk memvalidasi sebelum eskalasi ke admin client (pola §6.8
 *  validasi-lalu-eskalasi). */
export const KNOWN_TENANT_SLUGS: string[] = Array.from(new Set(Object.values(TENANT_DOMAINS)));

/** Slug tenant untuk host ini, atau null kalau host bukan domain tenant
 *  (mis. therahub.web.id, *.vercel.app, localhost). Port dibuang. */
export function tenantSlugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const clean = host.split(":")[0].toLowerCase();
  return TENANT_DOMAINS[clean] ?? null;
}
