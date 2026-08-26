import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------
// Read layer portal Super Admin — SATU-SATUNYA tempat di aplikasi ini yang
// membaca lintas-tenant.
//
// KENAPA PAKAI SERVICE-ROLE, BUKAN RLS
// ------------------------------------
// `_is_admin_or_owner()` (0002) memang memasukkan 'super-admin', TAPI setiap
// policy menggandengkannya dengan `tenant_id = _current_tenant_id()`, dan
// `tenants_read_own` mengunci ke `id = _effective_tenant_id()`. Artinya
// **tidak ada satu pun policy yang memberi akses lintas-tenant kepada
// siapa pun** — super-admin sekalipun. Portal ini karena itu tidak bisa
// dihidupkan hanya dengan menyambungkan UI-nya.
//
// Ada dua jalan keluar. Yang TIDAK dipilih: menambahkan `or
// _is_super_admin()` ke policy read di ~39 tabel. Itu berarti 39 kesempatan
// melebarkan akses secara tidak sengaja, tersebar di seluruh skema, dan
// setiap tabel baru nanti harus ingat menambahkannya lagi — kelalaian yang
// gagal secara diam-diam dan ke arah yang salah.
//
// Yang dipilih: satu choke point service-role di file ini, memakai pola
// **validasi-lalu-eskalasi** yang sudah jadi konvensi di repo ini
// (lihat `lib/actions/inventory.ts` dan `lib/actions/customerBookings.ts`):
// peran penelepon diverifikasi lewat client sesi biasa DULU — di bawah RLS,
// lewat policy `app_users_read_self` — dan baru setelah itu client
// service-role dibuat. Kalau pemeriksaan gagal, fungsi ini mengembalikan
// `null` dan pemanggilnya menampilkan halaman contoh, bukan data.
//
// Konsekuensinya: seluruh file ini WAJIB tetap read-only dan server-only.
// Jangan pernah menambahkan operasi tulis di sini tanpa memindahkannya ke
// Server Action dengan pemeriksaan tersendiri.
//
// KENAPA BELUM ADA PROVISIONING TENANT DI SINI
// ---------------------------------------------
// Membuat tenant kedua sekarang akan langsung membocorkan data Amethyst:
// `lib/data/outlets.ts`, `employees.ts`, `catalog.ts`, dan `rooms.ts` masih
// salah menafsirkan "0 baris" sebagai "tidak ada sesi login" lalu jatuh ke
// data mock — yang isinya roster, gaji, dan harga Amethyst. Selama itu
// belum diperbaiki, menambah tombol provisioning berarti membangun jalan
// menuju kebocoran. Rinciannya di `claude/therahub-rencana-tenant-2.md`
// Fase 0.
// ---------------------------------------------------------------------

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  createdAt: string | null;
  outlets: number;
  therapists: number;
  /** Baris `app_users` yang benar-benar bisa dipakai masuk (punya `auth_user_id`). */
  staffUsers: number;
  /** Baris `app_users` TANPA akun login. Lihat catatan `hasLogin` di bawah. */
  usersWithoutLogin: number;
  customers: number;
};

export type PlatformOverview = {
  tenants: number;
  outlets: number;
  therapists: number;
  staffUsers: number;
  usersWithoutLogin: number;
  customers: number;
  rooms: number;
};

export type DiagnosticSeverity = "critical" | "warning" | "info";

export type DiagnosticFinding = {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  /** Apa akibatnya kalau dibiarkan — bukan sekadar mendeskripsikan ulang judul. */
  impact: string;
  /** Langkah konkret yang menutup temuan ini. */
  fix: string;
  subjects: string[];
};

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const bool = (v: unknown): boolean => v === true;

/**
 * Client service-role — HANYA kalau yang login benar-benar super-admin.
 *
 * Mengembalikan `null` untuk: tidak ada sesi (viewer demo "Ganti Role"),
 * sesi yang tidak punya baris `app_users`, dan peran apa pun selain
 * super-admin. Pemanggil WAJIB memperlakukan `null` sebagai "tampilkan
 * halaman contoh", bukan sebagai error.
 */
export const getPlatformAccess = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Dibaca lewat client SESI, bukan service-role — inilah bagian
  // "validasi" dari validasi-lalu-eskalasi. Policy `app_users_read_self`
  // (0002) membatasi baris yang terbaca ke milik penelepon sendiri, jadi
  // peran di sini tidak bisa dipalsukan dari sisi klien.
  const { data, error } = await supabase
    .from("app_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data || str((data as Row).role) !== "super-admin") return null;
  return createAdminClient();
});

export async function isPlatformLive(): Promise<boolean> {
  return (await getPlatformAccess()) !== null;
}

/** Semua query di bawah memakai `select("*")` dengan sengaja: baseline 0001
 *  tidak punya file migrasi di repo, jadi daftar kolom pastinya hanya bisa
 *  dipastikan dari produksi. Select eksplisit yang menyebut kolom tidak ada
 *  akan menggagalkan SELURUH query — kelas kegagalan yang sudah pernah
 *  terjadi di `lib/actions/outletProfile.ts`. */
// `app_users` adalah tabel AKUN LOGIN, bukan tabel karyawan — karyawan hidup
// di `employees`. Jadi baris tanpa `auth_user_id` bukan "akun staf": itu baris
// yang tidak bisa dipakai masuk oleh siapa pun.
//
// Dibedakan sejak 2026-08-26, setelah dua akun uji Mekarwangi dihapus dari
// `auth.users` dan barisnya tertinggal di sini — lalu tetap ikut terhitung
// sebagai "Akun Staf" di dashboard. Menghapus dua baris itu hanya menyembuhkan
// gejalanya sekali; hal yang sama akan terjadi lagi setiap kali seorang
// karyawan keluar dan akun auth-nya dicabut. Karena itu pembedaannya ditaruh
// di definisi hitungannya, bukan diserahkan ke kerapian data.
const hasLogin = (u: Row) => !!str(u.auth_user_id);

const loadPlatform = cache(async () => {
  const admin = await getPlatformAccess();
  if (!admin) return null;

  const [tenants, outlets, employees, appUsers, customers, rooms] = await Promise.all([
    admin.from("tenants").select("*"),
    admin.from("outlets").select("*"),
    admin.from("employees").select("*"),
    admin.from("app_users").select("*"),
    admin.from("customers").select("*"),
    admin.from("rooms").select("*"),
  ]);

  return {
    tenants: (tenants.data ?? []) as Row[],
    outlets: (outlets.data ?? []) as Row[],
    employees: (employees.data ?? []) as Row[],
    appUsers: (appUsers.data ?? []) as Row[],
    customers: (customers.data ?? []) as Row[],
    rooms: (rooms.data ?? []) as Row[],
  };
});

export async function getPlatformOverview(): Promise<PlatformOverview | null> {
  const d = await loadPlatform();
  if (!d) return null;
  return {
    tenants: d.tenants.length,
    outlets: d.outlets.length,
    therapists: d.employees.filter((e) => bool(e.is_therapist) && str(e.status) === "ACTIVE").length,
    staffUsers: d.appUsers.filter(hasLogin).length,
    usersWithoutLogin: d.appUsers.filter((u) => !hasLogin(u)).length,
    customers: d.customers.length,
    rooms: d.rooms.length,
  };
}

export async function getPlatformTenants(): Promise<PlatformTenant[] | null> {
  const d = await loadPlatform();
  if (!d) return null;

  const countBy = (rows: Row[], tid: string, pred?: (r: Row) => boolean) =>
    rows.filter((r) => str(r.tenant_id) === tid && (!pred || pred(r))).length;

  return d.tenants
    .map((t) => {
      const id = str(t.id);
      return {
        id,
        name: str(t.name),
        slug: str(t.slug) || null,
        city: str(t.city) || null,
        createdAt: str(t.created_at) || null,
        outlets: countBy(d.outlets, id),
        therapists: countBy(d.employees, id, (e) => bool(e.is_therapist) && str(e.status) === "ACTIVE"),
        staffUsers: countBy(d.appUsers, id, hasLogin),
        usersWithoutLogin: countBy(d.appUsers, id, (u) => !hasLogin(u)),
        customers: countBy(d.customers, id),
      };
    })
    .sort((a, b) => (a.name > b.name ? 1 : -1));
}

export type PlatformTenantDetail = {
  tenant: PlatformTenant;
  outlets: { id: string; code: string; name: string; city: string; therapists: number; rooms: number }[];
  users: { id: string; role: string; email: string; outletId: string | null; hasLogin: boolean }[];
};

export async function getPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null> {
  const [d, list] = await Promise.all([loadPlatform(), getPlatformTenants()]);
  if (!d || !list) return null;
  const tenant = list.find((t) => t.id === tenantId);
  if (!tenant) return null;

  const outlets = d.outlets
    .filter((o) => str(o.tenant_id) === tenantId)
    .map((o) => {
      const oid = str(o.id);
      return {
        id: oid,
        code: str(o.code),
        name: str(o.name),
        city: str(o.city),
        therapists: d.employees.filter(
          (e) => str(e.outlet_id) === oid && bool(e.is_therapist) && str(e.status) === "ACTIVE"
        ).length,
        rooms: d.rooms.filter((r) => str(r.outlet_id) === oid).length,
      };
    })
    .sort((a, b) => (a.code > b.code ? 1 : -1));

  const users = d.appUsers
    .filter((u) => str(u.tenant_id) === tenantId)
    .map((u) => ({
      id: str(u.id),
      role: str(u.role),
      email: str(u.email),
      outletId: str(u.outlet_id) || null,
      hasLogin: hasLogin(u),
    }))
    .sort((a, b) => (a.role > b.role ? 1 : -1));

  return { tenant, outlets, users };
}

/**
 * Pemeriksaan kesehatan lintas-tenant.
 *
 * Tiap temuan menjawab tiga hal: apa yang salah, APA AKIBATNYA kalau
 * dibiarkan, dan langkah apa yang menutupnya. Daftar "ada yang aneh" tanpa
 * akibat dan tanpa langkah cuma memindahkan pekerjaan berpikir ke pembaca.
 */
export async function getPlatformDiagnostics(): Promise<DiagnosticFinding[] | null> {
  const admin = await getPlatformAccess();
  const d = await loadPlatform();
  if (!admin || !d) return null;

  const [payroll, profiles, packages] = await Promise.all([
    admin.from("payroll_settings").select("*"),
    admin.from("outlet_profiles").select("*"),
    admin.from("service_packages").select("*"),
  ]);
  const payrollRows = (payroll.data ?? []) as Row[];
  const profileRows = (profiles.data ?? []) as Row[];
  const packageRows = (packages.data ?? []) as Row[];

  const outletLabel = (o: Row) => `${str(o.code) || "?"} · ${str(o.name)}`;
  const out: DiagnosticFinding[] = [];

  const tenantNoOutlet = d.tenants.filter((t) => !d.outlets.some((o) => str(o.tenant_id) === str(t.id)));
  if (tenantNoOutlet.length)
    out.push({
      id: "tenant-tanpa-outlet",
      severity: "critical",
      title: "Tenant belum punya outlet",
      impact:
        "Hampir seluruh aplikasi membaca data lewat outlet. Tanpa outlet, manager dan kasir tenant ini akan melihat halaman kosong atau data contoh, dan tidak ada yang bisa dikerjakan.",
      fix: "Buat outlet pertama tenant ini sebelum akunnya diserahkan.",
      subjects: tenantNoOutlet.map((t) => str(t.name)),
    });

  const outletNoPayroll = d.outlets.filter((o) => !payrollRows.some((p) => str(p.outlet_id) === str(o.id)));
  if (outletNoPayroll.length)
    out.push({
      id: "outlet-tanpa-payroll",
      severity: "critical",
      title: "Struktur payroll belum diatur",
      impact:
        "Payroll outlet ini akan MENOLAK jalan — bukan menerbitkan slip kosong. Ini disengaja: menebak komponen gaji berarti menetapkan kebijakan gaji atas nama pemilik bisnis.",
      fix: "Manager outlet membuka Pengaturan Payroll dan mencentang komponen yang berlaku.",
      subjects: outletNoPayroll.map(outletLabel),
    });

  const outletNoRoom = d.outlets.filter((o) => !d.rooms.some((r) => str(r.outlet_id) === str(o.id)));
  if (outletNoRoom.length)
    out.push({
      id: "outlet-tanpa-room",
      severity: "critical",
      title: "Outlet belum punya ruangan",
      impact:
        "Kasir tidak bisa menyelesaikan check-in — ruangan dipilih saat tamu datang, jadi tanpa ruangan alur booking berhenti di tengah jalan.",
      fix: "Tambahkan ruangan lewat menu Rooms (manager atau admin).",
      subjects: outletNoRoom.map(outletLabel),
    });

  const pkgNoCommission = packageRows.filter((p) => {
    const v = p.commission_value;
    return v === null || v === undefined || Number(v) === 0;
  });
  if (pkgNoCommission.length)
    out.push({
      id: "paket-tanpa-komisi",
      severity: "warning",
      title: "Paket belum punya tarif komisi",
      impact:
        "Setiap treatment dari paket ini dijual tanpa menghasilkan komisi untuk terapis. Sistem sengaja tidak menulis baris Rp0 — jadi ini tidak akan muncul sebagai kesalahan di mana pun, hanya sebagai penghasilan yang hilang.",
      fix: "Manager mengisi tarif komisi paket di menu Catalog.",
      subjects: pkgNoCommission.map((p) => str(p.name)).slice(0, 12),
    });

  const outletUnpublished = d.outlets.filter((o) => {
    const prof = profileRows.find((p) => str(p.outlet_id) === str(o.id));
    return !prof || !bool(prof.published);
  });
  if (outletUnpublished.length)
    out.push({
      id: "outlet-belum-publish",
      severity: "warning",
      title: "Profil outlet belum dipublikasikan",
      impact:
        "Outlet ini tidak muncul di halaman pendaftaran maupun pemilihan outlet milik tamu — jadi pendaftaran customer mandiri praktis mati untuk outlet ini.",
      fix: "Admin membuka Profil Outlet, melengkapi foto & deskripsi, lalu menyalakan saklar publikasi.",
      subjects: outletUnpublished.map(outletLabel),
    });

  const usersNoLogin = d.appUsers.filter((u) => !hasLogin(u));
  if (usersNoLogin.length)
    out.push({
      id: "akun-tanpa-login",
      severity: "warning",
      title: "Baris akun tanpa akun login",
      impact:
        "Baris ini tetap muncul di daftar user portal Admin seolah akun aktif, padahal tidak ada seorang pun yang bisa memakainya untuk masuk. Biasanya sisa dari akun auth yang dihapus tapi barisnya tertinggal.",
      fix: "Hapus barisnya kalau memang akun uji, atau buatkan akun login baru lewat Authentication kalau orangnya masih bekerja. Cek dulu apakah baris ini masih direferensikan tabel lain sebelum dihapus.",
      subjects: usersNoLogin.map((u) => str(u.email) || str(u.name) || str(u.id)).slice(0, 12),
    });

  const therapistNoContact = d.employees.filter(
    (e) => bool(e.is_therapist) && str(e.status) === "ACTIVE" && !str(e.phone) && !str(e.email)
  );
  if (therapistNoContact.length)
    out.push({
      id: "terapis-tanpa-kontak",
      severity: "warning",
      title: "Terapis aktif tanpa kontak",
      impact:
        "Tidak ada jalur untuk mengirim akun masuk maupun pemberitahuan jadwal ke orang ini.",
      fix: "Lengkapi nomor HP dan email di Therapists & Staff — dengan data asli, bukan isian sementara.",
      subjects: therapistNoContact.map((e) => str(e.name)).slice(0, 12),
    });

  if (!out.length)
    out.push({
      id: "bersih",
      severity: "info",
      title: "Tidak ada temuan",
      impact: "Semua pemeriksaan lolos untuk seluruh tenant yang terdaftar.",
      fix: "Tidak ada tindakan yang diperlukan.",
      subjects: [],
    });

  return out;
}
