// ---------------------------------------------------------------------
// Tenant demo marketing "Royal Spa" (2026-10-20).
//
// Arsitektur (keputusan Adjie): kode & database SAMA dengan produksi,
// deploy Vercel TERPISAH (demo.therahub.biz.id) yang menyalakan
// DEMO_MODE=1. Semua jalur demo — gerbang login marketing, ganti peran
// tanpa password, reset malam — mati total kalau DEMO_MODE bukan "1",
// jadi deploy produksi (amethystbdg.my.id, therahub.web.id) tidak pernah
// membuka satu pun pintu ini walau kodenya ikut ter-deploy.
//
// Satu "akun demo" di mata marketing = enam akun Supabase Auth sungguhan
// (satu per peran) di tenant royal-spa. Peran di TheraHub melekat pada
// akun (app_users.role), jadi "ganti peran" = server menukar sesi ke akun
// peran lain memakai DEMO_ACCOUNT_PASSWORD yang hanya ada di env server.
// Pengunjung tidak pernah melihat atau mengetik password akun-akun itu.
//
// BUKAN file "use server" — meng-export konstanta (pelajaran 7.11/7.19).
// ---------------------------------------------------------------------

export const DEMO_TENANT_SLUG = "royal-spa";
export const DEMO_OUTLET_CODE = "RSB-BDG";
export const DEMO_GATE_COOKIE = "th_demo_gate";
/** Lama sesi gerbang marketing. */
export const DEMO_GATE_TTL_SEC = 60 * 60 * 12;

export type DemoRole = "owner" | "admin" | "manager" | "kasir" | "therapist" | "customer";

export const DEMO_ROLES: { role: DemoRole; label: string; person: string; desc: string; email: string; home: string }[] = [
  { role: "owner", label: "Owner", person: "Hendra Wijaya", desc: "Laporan, laba rugi, kinerja terapis", email: "owner.royalspa@demo.therahub.biz.id", home: "/owner" },
  { role: "admin", label: "Admin", person: "Dimas Prakoso", desc: "Profil bisnis, pengguna, outlet, katalog", email: "admin.royalspa@demo.therahub.biz.id", home: "/admin" },
  { role: "manager", label: "Manager", person: "Melinda Sari", desc: "Operasional harian, jadwal, payroll", email: "manager.royalspa@demo.therahub.biz.id", home: "/manager" },
  { role: "kasir", label: "Kasir", person: "Rizky Amelia", desc: "Booking, check-in, POS, tutup shift", email: "kasir.royalspa@demo.therahub.biz.id", home: "/kasir" },
  { role: "therapist", label: "Terapis", person: "Ayu Lestari", desc: "Absensi GPS, jadwal, komisi, slip gaji", email: "terapis.royalspa@demo.therahub.biz.id", home: "/therapist" },
  { role: "customer", label: "Customer", person: "Nadia Prameswari", desc: "Booking online, riwayat, member", email: "customer.royalspa@demo.therahub.biz.id", home: "/customer" },
];

export const DEMO_EMAILS = new Set(DEMO_ROLES.map((r) => r.email));

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

export function demoRole(role: string): (typeof DEMO_ROLES)[number] | undefined {
  return DEMO_ROLES.find((r) => r.role === role);
}
