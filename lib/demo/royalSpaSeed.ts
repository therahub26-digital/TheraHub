import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { wallClockIso, plusMinutes, todayIsoDate, nowHHMM, plusDays } from "@/lib/wallclock";
import { commissionAmount, commissionRuleSnapshot, type CommissionRule } from "@/lib/commission";
import { DEMO_TENANT_SLUG, DEMO_OUTLET_CODE, DEMO_ROLES } from "./config";

// ---------------------------------------------------------------------
// SEED TENANT DEMO "ROYAL SPA" (2026-10-20)
//
// Dipakai oleh /api/demo/seed (manual pertama kali + cron 03.00 WIB) dan
// refreshToday() oleh /api/demo/login. Semua nama, alamat, nomor, dan foto
// fiktif (foto = hasil AI milik Adjie).
//
// Urutan seedRoyalSpa():
//   A. Master — upsert by kunci alami, aman diulang: tenant, outlet,
//      14 kamar, katalog, produk & stok, promo, profil outlet, karyawan
//      (20 terapis + manager + 2 kasir), 6 akun peran, 60 customer.
//      Setiap run MENIMPA KEMBALI nilai yang mungkin diubah pengunjung.
//   B. Reset — public.demo_reset_activity('royal-spa') (migrasi 0043):
//      hapus semua aktivitas tenant ini saja.
//   C. Aktivitas — riwayat HISTORY_DAYS hari lewat kolom & rumus yang sama
//      dengan payForSession, absensi, cuti, pengeluaran, shift kasir, lalu
//      jadwal hari ini relatif terhadap jam sekarang.
//
// Payroll SENGAJA tidak di-seed (sama seperti Amet Spa): "Manager →
// Payroll → Jalankan" justru bagian demo yang menarik.
// ---------------------------------------------------------------------

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
export type SeedLog = string[];

const MARK = "[royal-demo]";
const HISTORY_DAYS = 60;
// Jam buka 07.00 (revisi 21 Okt): demo pagi tetap tampil dengan jam nyata.
const OPEN_MIN = 7 * 60;
const CLOSE_MIN = 23 * 60;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)];
function wpick<T>(r: Rng, items: T[], w: (x: T) => number): T {
  let s = 0;
  for (const i of items) s += w(i);
  let x = r() * s;
  for (const i of items) {
    x -= w(i);
    if (x <= 0) return i;
  }
  return items[items.length - 1];
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const code4 = (r: Rng) => Math.floor(r() * 36 ** 4).toString(36).padStart(4, "0").toUpperCase();
const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

class SeedError extends Error {}
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new SeedError(`${what}: ${res.error.message}`);
  return res.data as T;
}

// ---------------------------------------------------------------- master
const PACKAGES = [
  { cat: "Pijat Tradisional", name: "Royal Balinese Massage", dur: 90, price: 295000, kom: 60000, skill: "Pijat Tradisional", room: "Massage", w: 22 },
  { cat: "Pijat Tradisional", name: "Urut Jawa Tradisional", dur: 60, price: 225000, kom: 45000, skill: "Pijat Tradisional", room: "Massage", w: 16 },
  { cat: "Pijat Tradisional", name: "Royal Signature Massage", dur: 120, price: 395000, kom: 80000, skill: "Pijat Tradisional", room: "Massage", w: 9 },
  { cat: "Terapi", name: "Deep Tissue Massage", dur: 90, price: 325000, kom: 65000, skill: "Deep Tissue", room: "Massage", w: 10 },
  { cat: "Terapi", name: "Hot Stone Therapy", dur: 90, price: 355000, kom: 70000, skill: "Hot Stone", room: "Massage", w: 7 },
  { cat: "Terapi", name: "Aromatherapy Massage", dur: 60, price: 250000, kom: 50000, skill: "Aromaterapi", room: "Massage", w: 11 },
  { cat: "Wajah & Kaki", name: "Refleksi Kaki", dur: 60, price: 175000, kom: 35000, skill: "Refleksi", room: "Massage", w: 9 },
  { cat: "Wajah & Kaki", name: "Totok Wajah Royal", dur: 45, price: 165000, kom: 32000, skill: "Totok Wajah", room: "Massage", w: 5 },
  { cat: "Ritual & Paket", name: "Lulur Putri Keraton", dur: 120, price: 425000, kom: 85000, skill: "Lulur", room: "VIP", w: 5 },
  { cat: "Ritual & Paket", name: "Couple Royal Retreat (per orang)", dur: 120, price: 475000, kom: 45000, skill: "Pijat Tradisional", room: "Couple", w: 6 },
] as const;
const CAT_ICON: Record<string, string> = { "Pijat Tradisional": "hand", Terapi: "sparkles", "Wajah & Kaki": "footprints", "Ritual & Paket": "gem" };

const ROOMS: { code: string; name: string; type: "Massage" | "Couple" | "VIP"; cap: number; status: "ACTIVE" | "MAINTENANCE" }[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ code: `RM-${String(i + 1).padStart(2, "0")}`, name: `Private ${String(i + 1).padStart(2, "0")}`, type: "Massage" as const, cap: 1, status: (i === 6 ? "MAINTENANCE" : "ACTIVE") as "ACTIVE" | "MAINTENANCE" })),
  ...Array.from({ length: 4 }, (_, i) => ({ code: `CP-${String(i + 1).padStart(2, "0")}`, name: `Couple Suite ${String(i + 1).padStart(2, "0")}`, type: "Couple" as const, cap: 2, status: "ACTIVE" as const })),
  ...Array.from({ length: 2 }, (_, i) => ({ code: `RS-${String(i + 1).padStart(2, "0")}`, name: `Royal Suite ${i + 1}`, type: "VIP" as const, cap: 1, status: "ACTIVE" as const })),
];

const THERAPISTS: { name: string; extra: string[]; intensity: "MEDIUM" | "STRONG" | "MEDIUM_STRONG"; grade: "Junior" | "Senior" | "Master" }[] = [
  { name: "Ayu Lestari", extra: ["Hot Stone", "Aromaterapi"], intensity: "MEDIUM", grade: "Master" },
  { name: "Dewi Anggraini", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Senior" },
  { name: "Sari Kusumawati", extra: ["Aromaterapi", "Totok Wajah"], intensity: "MEDIUM", grade: "Senior" },
  { name: "Nining Rahayu", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Senior" },
  { name: "Wulan Permatasari", extra: ["Lulur"], intensity: "MEDIUM_STRONG", grade: "Senior" },
  { name: "Ratna Sukmawati", extra: ["Deep Tissue", "Hot Stone"], intensity: "STRONG", grade: "Master" },
  { name: "Intan Puspita", extra: ["Aromaterapi", "Hot Stone"], intensity: "MEDIUM", grade: "Junior" },
  { name: "Maya Andriani", extra: ["Hot Stone"], intensity: "MEDIUM_STRONG", grade: "Senior" },
  { name: "Lina Marlina", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Junior" },
  { name: "Dian Novita", extra: ["Lulur", "Totok Wajah"], intensity: "MEDIUM", grade: "Junior" },
  { name: "Rini Hartati", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Senior" },
  { name: "Yuni Astuti", extra: ["Aromaterapi"], intensity: "MEDIUM_STRONG", grade: "Junior" },
  { name: "Nurul Hidayah", extra: ["Totok Wajah"], intensity: "MEDIUM_STRONG", grade: "Junior" },
  { name: "Fitri Rahmawati", extra: ["Hot Stone", "Lulur"], intensity: "MEDIUM", grade: "Senior" },
  { name: "Tika Septiani", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Junior" },
  { name: "Siti Aminah", extra: ["Lulur", "Aromaterapi"], intensity: "MEDIUM", grade: "Junior" },
  { name: "Eka Wulandari", extra: ["Deep Tissue"], intensity: "STRONG", grade: "Junior" },
  { name: "Putri Ramadhani", extra: ["Aromaterapi"], intensity: "MEDIUM_STRONG", grade: "Junior" },
  { name: "Anisa Fitriani", extra: ["Hot Stone"], intensity: "MEDIUM_STRONG", grade: "Junior" },
  { name: "Rosa Melinda", extra: ["Lulur"], intensity: "MEDIUM", grade: "Junior" },
];
const OFF_DOW = (i: number) => (i * 3 + 1) % 7; // libur mingguan bergilir

const STAFF = [
  { code: "STF-MGR", name: "Melinda Sari", job: "Manager", salary: 7500000 },
  { code: "STF-KSR-1", name: "Rizky Amelia", job: "Kasir", salary: 4200000 },
  { code: "STF-KSR-2", name: "Bagus Saputra", job: "Kasir", salary: 4200000 },
] as const;

const FN = ["Andini", "Rahma", "Clara", "Vina", "Meiliana", "Kartika", "Dinda", "Laura", "Bella", "Grace", "Yohana", "Sinta", "Raisa", "Tiara", "Hana", "Olivia", "Feby", "Jessica", "Budi", "Arif", "Rangga", "Kevin", "Yusuf", "Teddy", "Hans", "Rudi", "Galih", "Aldo", "Bimo", "Fajar", "Irfan", "Anton", "Sherly", "Monica", "Agnes", "Vania"];
const LN = ["Halim", "Santoso", "Gunawan", "Susanto", "Wibisono", "Hartono", "Pratama", "Kurniawan", "Setiawan", "Tanoto", "Hidayat", "Nugraha", "Lim", "Siregar", "Tambunan", "Wijaya", "Saragih", "Lubis", "Hakim"];

const PRODUCTS = [
  { sku: "RS-FB-01", name: "Wedang Jahe Sereh", category: "Food & Beverage", uom: "gelas", cost: 8000, sell: 28000, min: 20, qty: 60 },
  { sku: "RS-FB-02", name: "Jamu Kunyit Asam", category: "Food & Beverage", uom: "botol", cost: 9000, sell: 25000, min: 24, qty: 40 },
  { sku: "RS-FB-03", name: "Teh Melati Panas", category: "Food & Beverage", uom: "gelas", cost: 4000, sell: 20000, min: 20, qty: 80 },
  { sku: "RS-FB-04", name: "Air Mineral 600 ml", category: "Food & Beverage", uom: "botol", cost: 3500, sell: 10000, min: 48, qty: 84 },
  { sku: "RS-RT-01", name: "Royal Spa Oil · Relax 100 ml", category: "Retail Product", uom: "botol", cost: 70000, sell: 185000, min: 6, qty: 9 },
  { sku: "RS-RT-02", name: "Royal Spa Oil · Balance 100 ml", category: "Retail Product", uom: "botol", cost: 70000, sell: 185000, min: 6, qty: 11 },
  { sku: "RS-RT-03", name: "Royal Spa Oil · Revitalize 100 ml", category: "Retail Product", uom: "botol", cost: 70000, sell: 185000, min: 6, qty: 4 },
  { sku: "RS-TC-01", name: "Minyak pijat kelapa murni", category: "Treatment Consumable", uom: "liter", cost: 65000, sell: null, min: 10, qty: 14 },
  { sku: "RS-TC-02", name: "Essential oil frangipani", category: "Treatment Consumable", uom: "botol", cost: 95000, sell: null, min: 6, qty: 3 },
  { sku: "RS-TC-03", name: "Lulur kunyit-beras", category: "Treatment Consumable", uom: "kg", cost: 120000, sell: null, min: 3, qty: 5 },
  { sku: "RS-TC-04", name: "Masker susu", category: "Treatment Consumable", uom: "kg", cost: 150000, sell: null, min: 2, qty: 1 },
  { sku: "RS-OS-01", name: "Celana sekali pakai", category: "Operational Supply", uom: "pcs", cost: 2500, sell: null, min: 200, qty: 310 },
  { sku: "RS-OS-02", name: "Lilin aromaterapi", category: "Operational Supply", uom: "pcs", cost: 12000, sell: null, min: 30, qty: 36 },
  { sku: "RS-RA-01", name: "Handuk besar ungu", category: "Reusable Asset", uom: "pcs", cost: 85000, sell: null, min: 80, qty: 96 },
  { sku: "RS-RA-02", name: "Sarung batik", category: "Reusable Asset", uom: "pcs", cost: 60000, sell: null, min: 60, qty: 54 },
] as const;

type Ctx = {
  tenantId: string;
  outletId: string;
  receiptPrefix: string;
  packages: { id: string; name: string; dur: number; price: number; rule: CommissionRule; skill: string; room: string; w: number }[];
  extension: { id: string; name: string; price: number; rule: CommissionRule } | null;
  rooms: { id: string; type: string; status: string }[];
  therapists: { id: string; idx: number; skills: string[] }[];
  customers: string[];
  kasir1: string; // employee id
  kasir2: string;
  kasirUser: string | null; // app_users id
  managerEmp: string;
  managerUser: string | null;
  products: { id: string; name: string; sell: number | null; category: string }[];
};

async function upsertBy(admin: Admin, table: string, match: Row, fields: Row, what: string): Promise<string> {
  let q = admin.from(table).select("id");
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
  const found = must(await q.maybeSingle(), `cari ${what}`) as { id: string } | null;
  if (found) {
    must(await admin.from(table).update(fields).eq("id", found.id), `update ${what}`);
    return found.id;
  }
  const ins = must(await admin.from(table).insert({ ...match, ...fields }).select("id").single(), `insert ${what}`) as { id: string };
  return ins.id;
}

async function findAuthUserId(admin: Admin, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new SeedError(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureAuth(admin: Admin, email: string, password: string, name: string): Promise<string> {
  let id = await findAuthUserId(admin, email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, demo: true } });
    if (error || !data.user) throw new SeedError(`createUser ${email}: ${error?.message ?? "?"}`);
    id = data.user.id;
  } else {
    // Selaraskan dengan env setiap run — mengganti DEMO_ACCOUNT_PASSWORD
    // cukup di Vercel lalu seed ulang.
    const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (error) throw new SeedError(`updateUser ${email}: ${error.message}`);
  }
  return id;
}

async function seedMasters(admin: Admin, log: SeedLog): Promise<Ctx> {
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!password || password.length < 12) throw new SeedError("DEMO_ACCOUNT_PASSWORD belum diatur (minimal 12 karakter).");

  await admin.from("plans").upsert(
    { key: "business", name: "Business", target: "Multi-outlet spa", price_per_outlet: 750000, max_outlets: 5, max_users: 50, max_therapists: 60 },
    { onConflict: "key" }
  );

  const tenantId = await upsertBy(admin, "tenants", { slug: DEMO_TENANT_SLUG }, {
    name: "Royal Spa",
    legal_name: "Royal Spa (Tenant Demo)",
    plan: "business",
    status: "ACTIVE",
    city: "Bandung",
    admin_email: DEMO_ROLES.find((r) => r.role === "admin")!.email,
    tagline: "Relaksasi dalam sentuhan kemewahan.",
    whatsapp: "081200002026",
    instagram: "royalspa.bdg",
    logo_tone: "violet",
  }, "tenant");
  log.push(`tenant royal-spa ${tenantId}`);

  const outletId = await upsertBy(admin, "outlets", { tenant_id: tenantId, code: DEMO_OUTLET_CODE }, {
    name: "Royal Spa — Bandung",
    address: "Jl. Cendana Raya No. 12, Bandung (alamat demo)",
    city: "Bandung",
    phone: "0812-0000-2026",
    lat: -6.9024,
    lng: 107.6188,
    geofence_radius: 100,
    accuracy_threshold: 50,
    open_hours: "Setiap hari · 07:00–23:00",
    work_start_time: "07:00",
    work_end_time: "23:00",
    status: "ACTIVE",
    manager_name: "Melinda Sari",
    tax_pct: 0,
    service_charge_pct: 0,
    tax_enabled: false,
    service_charge_enabled: false,
    receipt_prefix: "RSB",
    deposit_enabled: false,
  }, "outlet");

  // Katalog
  const pkgOut: Ctx["packages"] = [];
  const typeNamesByRoom: Record<string, string[]> = { Massage: [], Couple: [], VIP: [] };
  for (const cat of [...new Set(PACKAGES.map((p) => p.cat))]) {
    const catId = await upsertBy(admin, "service_categories", { tenant_id: tenantId, name: cat }, { icon: CAT_ICON[cat] ?? "sparkles", description: `Kategori ${cat} Royal Spa.` }, `kategori ${cat}`);
    for (const p of PACKAGES.filter((x) => x.cat === cat)) {
      const typeId = await upsertBy(admin, "service_types", { category_id: catId, name: p.name }, { required_skill: p.skill, description: `${p.name} ${p.dur} menit.` }, `jenis ${p.name}`);
      const rule: CommissionRule = { type: "fixed", value: p.kom };
      const pkgId = await upsertBy(admin, "service_packages", { outlet_id: outletId, service_type_id: typeId }, {
        name: `${p.name} ${p.dur}'`,
        duration_min: p.dur,
        list_price: p.price,
        member_price: Math.round(p.price * 0.9),
        weekend_price: p.price,
        room_type: p.room,
        required_skill: p.skill,
        buffer_before_min: 0,
        buffer_after_min: 10,
        extension_allowed: true,
        status: "ACTIVE",
        materials: [],
        commission_type: "fixed",
        commission_value: p.kom,
      }, `paket ${p.name}`);
      pkgOut.push({ id: pkgId, name: `${p.name} ${p.dur}'`, dur: p.dur, price: p.price, rule, skill: p.skill, room: p.room, w: p.w });
      typeNamesByRoom[p.room].push(p.name);
      if (p.room === "Massage") { typeNamesByRoom.Couple.push(p.name); typeNamesByRoom.VIP.push(p.name); }
    }
  }
  const extId = await upsertBy(admin, "extension_options", { outlet_id: outletId, name: "Perpanjangan 30 Menit" }, { duration_min: 30, price: 95000, active: true, commission_type: "fixed", commission: 20000 }, "extension");
  for (const p of pkgOut) {
    must(await admin.from("service_package_allowed_extensions").upsert({ package_id: p.id, extension_id: extId }, { onConflict: "package_id,extension_id" }), "link extension");
  }
  log.push(`katalog: ${pkgOut.length} paket + extension`);

  // Kamar
  must(await admin.from("rooms").upsert(ROOMS.map((r) => ({
    outlet_id: outletId, code: r.code, name: r.name, type: r.type, capacity: r.cap,
    supported_services: typeNamesByRoom[r.type], status: r.status, cleanup_buffer_min: 10,
  })), { onConflict: "outlet_id,code" }), "rooms");
  const rooms = must(await admin.from("rooms").select("id, type, status, code").eq("outlet_id", outletId), "baca rooms") as { id: string; type: string; status: string; code: string }[];
  log.push(`kamar: ${rooms.length}`);

  // Profil outlet (landing)
  must(await admin.from("outlet_profiles").upsert({
    outlet_id: outletId,
    published: true,
    tagline: "Relaksasi dalam sentuhan kemewahan.",
    description: "Royal Spa adalah day spa di Bandung dengan 14 ruang perawatan pribadi: 8 kamar private, 4 couple suite, dan 2 royal suite. Pijat tradisional Nusantara dan terapi modern oleh 20 terapis bersertifikat, buka setiap hari pukul 07.00–23.00.",
    cover_url: "/img/landing/royal-spa/hero-terapis-lobby.jpg",
    highlights: ["20 terapis bersertifikat", "14 ruang perawatan pribadi", "Couple suite & royal suite", "Buka setiap hari 07.00–23.00"],
  }, { onConflict: "outlet_id" }), "outlet_profiles");
  await admin.from("outlet_facilities").delete().eq("outlet_id", outletId);
  must(await admin.from("outlet_facilities").insert([
    { name: "Resepsionis & Lounge", icon: "sparkles", description: "Teh jahe sambutan sebelum perawatan." },
    { name: "Kamar Private", icon: "gem", description: "8 kamar pribadi dengan wastafel." },
    { name: "Couple Suite", icon: "hand", description: "4 suite berdua dengan shower." },
    { name: "Royal Suite", icon: "waves", description: "Bathtub bunga dan lounge pribadi." },
    { name: "Refleksi", icon: "footprints", description: "Rendam kaki rempah hangat." },
    { name: "Parkir Basement", icon: "car", description: "Kapasitas 20 mobil." },
  ].map((f, i) => ({ outlet_id: outletId, ...f, sort_order: i }))), "facilities");
  await admin.from("outlet_gallery_photos").delete().eq("outlet_id", outletId);
  must(await admin.from("outlet_gallery_photos").insert(
    [["Resepsionis", "resepsionis"], ["Kamar Private", "private-room"], ["Couple Suite", "couple-suite"], ["Lounge", "lounge"], ["Shower", "shower"], ["Aromaterapi", "aromaterapi"]]
      .map(([label, f], i) => ({ outlet_id: outletId, label, url: `/img/landing/royal-spa/${f}.jpg`, sort_order: i }))
  ), "gallery");

  // Karyawan
  const staffIds: Record<string, string> = {};
  for (const s of STAFF) {
    staffIds[s.code] = await upsertBy(admin, "employees", { tenant_id: tenantId, code: s.code }, {
      outlet_id: outletId, name: s.name, job_role: s.job, join_date: "2024-03-01", status: "ACTIVE",
      contract_type: "Tetap", base_salary: s.salary, fixed_allowance: 500000, is_therapist: false, skills: [],
      phone: "0800-0000-0000", email: null,
    }, `staf ${s.name}`);
  }
  const therapists: Ctx["therapists"] = [];
  for (let i = 0; i < THERAPISTS.length; i++) {
    const t = THERAPISTS[i];
    const n = String(i + 1).padStart(2, "0");
    const skills = ["Pijat Tradisional", "Refleksi", ...t.extra];
    const id = await upsertBy(admin, "employees", { tenant_id: tenantId, code: `TRP-RS-${n}` }, {
      outlet_id: outletId, name: t.name, job_role: "Terapis", join_date: `${2022 + (i % 4)}-${String((i * 5) % 12 + 1).padStart(2, "0")}-01`,
      status: "ACTIVE", contract_type: "Tetap", base_salary: t.grade === "Junior" ? 1800000 : 2100000, fixed_allowance: 300000,
      is_therapist: true, skills, therapist_grade: t.grade, massage_intensity: t.intensity,
      phone: `0800-0000-${String(100 + i)}`, email: null, photo_url: `/img/therapists/RSB/rs-${n}.jpg`,
    }, `terapis ${t.name}`);
    therapists.push({ id, idx: i, skills });
  }
  log.push(`karyawan: ${therapists.length} terapis + ${STAFF.length} staf`);

  // Customer seed
  const r = mulberry32(4242);
  const custRows: Row[] = [];
  const used = new Set<string>(["Nadia Prameswari"]);
  custRows.push({ name: "Nadia Prameswari", phone: "0811-0000-0001", segment: "VIP", membership: "Gold", loyalty_points: 840 });
  while (custRows.length < 60) {
    const name = `${pick(r, FN)} ${pick(r, LN)}`;
    if (used.has(name)) continue;
    used.add(name);
    const k = custRows.length;
    const tier = r() < 0.1 ? "Platinum" : r() < 0.3 ? "Gold" : r() < 0.55 ? "Silver" : "None";
    custRows.push({ name, phone: `0811-0000-${String(1000 + k).slice(-4)}`, segment: tier === "None" ? (r() < 0.3 ? "New" : "Active") : tier === "Platinum" ? "VIP" : "Active", membership: tier, loyalty_points: Math.floor(r() * 1500) });
  }
  const customers: string[] = [];
  for (const c of custRows) {
    const id = await upsertBy(admin, "customers", { tenant_id: tenantId, phone: c.phone as string }, {
      name: c.name, segment: c.segment, membership: c.membership, prepaid_balance: 0, loyalty_points: c.loyalty_points,
      marketing_consent: false, avatar_tone: "violet", notes: MARK,
    }, `customer ${c.name}`);
    customers.push(id);
  }
  log.push(`customer: ${customers.length}`);

  // Akun peran (6) — password dari env, tidak pernah dikirim ke browser.
  let kasirUser: string | null = null;
  let managerUser: string | null = null;
  for (const role of DEMO_ROLES) {
    const authId = await ensureAuth(admin, role.email, password, role.person);
    if (role.role === "customer") {
      must(await admin.from("customers").update({ auth_user_id: authId, email: role.email }).eq("id", customers[0]), "tautkan customer demo");
      continue;
    }
    const employeeId =
      role.role === "manager" ? staffIds["STF-MGR"] : role.role === "kasir" ? staffIds["STF-KSR-1"] : role.role === "therapist" ? therapists[0].id : null;
    const appId = await upsertBy(admin, "app_users", { email: role.email }, {
      auth_user_id: authId, tenant_id: tenantId, outlet_id: outletId, role: role.role, name: role.person, employee_id: employeeId,
    }, `app_user ${role.role}`);
    if (role.role === "kasir") kasirUser = appId;
    if (role.role === "manager") managerUser = appId;
  }
  log.push("6 akun peran siap");

  // Produk & stok
  const products: Ctx["products"] = [];
  for (const p of PRODUCTS) {
    const id = await upsertBy(admin, "products", { tenant_id: tenantId, sku: p.sku }, {
      name: p.name, category: p.category, uom: p.uom, cost_price: p.cost, sell_price: p.sell, track_stock: true, min_stock: p.min,
    }, `produk ${p.sku}`);
    must(await admin.from("product_stocks").upsert({ outlet_id: outletId, product_id: id, qty: p.qty }, { onConflict: "outlet_id,product_id" }), `stok ${p.sku}`);
    products.push({ id, name: p.name, sell: p.sell, category: p.category });
  }
  // Promo
  await upsertBy(admin, "promotions", { outlet_id: outletId, code: "AJAKTEMAN50" }, {
    name: "Ajak Teman", type: "Voucher", value: "Rp50.000 untuk teman baru", discount_amount: 50000, new_customers_only: true,
    valid_from: "2026-01-01", valid_to: "2030-12-31", usage_count: 0, max_usage: null, status: "ACTIVE",
  }, "promo");
  // Payroll settings — seed menjamin baris ADA, isinya default database.
  {
    const { data } = await admin.from("payroll_settings").select("outlet_id").eq("outlet_id", outletId).maybeSingle();
    if (!data) {
      const { error } = await admin.from("payroll_settings").insert({
        outlet_id: outletId,
        period_type: "MONTHLY",
        components: ["FIXED", "ALLOWANCE", "COMMISSION", "LATE_PENALTY", "ABSENCE_PENALTY", "LOAN"],
        note: "Terapis Royal Spa karyawan tetap: gaji pokok + tunjangan + komisi per treatment (data demo).",
      });
      if (error) log.push(`⚠️ payroll_settings tidak dibuat (${error.message}) — atur dari Manager → Pengaturan Payroll`);
    }
  }

  const outlet = must(await admin.from("outlets").select("receipt_prefix").eq("id", outletId).single(), "outlet prefix") as { receipt_prefix: string };
  return {
    tenantId, outletId, receiptPrefix: outlet.receipt_prefix ?? "RSB",
    packages: pkgOut,
    extension: { id: extId, name: "Perpanjangan 30 Menit", price: 95000, rule: { type: "fixed", value: 20000 } },
    rooms: rooms.map((x) => ({ id: x.id, type: x.type, status: x.status })),
    therapists, customers,
    kasir1: staffIds["STF-KSR-1"], kasir2: staffIds["STF-KSR-2"], kasirUser,
    managerEmp: staffIds["STF-MGR"], managerUser,
    products,
  };
}

// ------------------------------------------------------------ activity
type Acc = { bookings: Row[]; sessions: Row[]; transactions: Row[]; items: Row[]; commissions: Row[] };
const newAcc = (): Acc => ({ bookings: [], sessions: [], transactions: [], items: [], commissions: [] });

async function flush(admin: Admin, acc: Acc) {
  for (const [table, rows] of [
    ["bookings", acc.bookings], ["sessions", acc.sessions], ["transactions", acc.transactions],
    ["transaction_items", acc.items], ["commission_entries", acc.commissions],
  ] as const) {
    for (const part of chunks(rows, 400)) must(await admin.from(table).insert(part), `insert ${table}`);
  }
}

type Busy = Map<string, [number, number][]>;
const isFree = (m: Busy, id: string, s: number, e: number) => !(m.get(id) ?? []).some(([a, b]) => s < b && e > a);
const occupy = (m: Busy, id: string, s: number, e: number) => m.set(id, [...(m.get(id) ?? []), [s, e]]);

/**
 * Isi satu hari. nowMin = null → hari lampau (semua selesai & lunas).
 * nowMin = angka → hari ini relatif jam itu. existing = booking hari itu
 * yang sudah ada (tidak disentuh, hanya dihormati jadwalnya).
 */
function fillDay(ctx: Ctx, acc: Acc, date: string, nowMin: number | null, rng: Rng, existing: { therapist_id: string; room_id: string | null; start: number; end: number }[] = []) {
  const dow = dowOf(date);
  const weekend = dow === 0 || dow === 5 || dow === 6;
  const target = Math.round((26 + rng() * 10) * (weekend ? 1.35 : 1));
  const avail = ctx.therapists.filter((t) => OFF_DOW(t.idx) !== dow);
  const activeRooms = ctx.rooms.filter((r) => r.status === "ACTIVE");
  const busyT: Busy = new Map(), busyR: Busy = new Map(), busyC: Busy = new Map();
  for (const e of existing) {
    occupy(busyT, e.therapist_id, e.start, e.end + 15);
    if (e.room_id) occupy(busyR, e.room_id, e.start, e.end + 10);
  }
  const slotW = (t: number) => 0.5 + 1.2 * Math.exp(-((t - 900) ** 2) / (2 * 90 ** 2)) + 1.6 * Math.exp(-((t - 1170) ** 2) / (2 * 80 ** 2));
  let made = existing.length;
  let tries = 0;
  let inSession = 0, awaitingPay = 0;
  type St = "PAID" | "COMPLETED" | "IN_SESSION" | "ARRIVED" | "CONFIRMED" | "BOOKED" | "CANCELLED" | "NO_SHOW";

  // Hari ini: kondisi "hidup" yang DIJAMIN ada saat reset, relatif jam
  // sekarang — 6 tamu sedang dipijat (mulai 8–72 menit lalu), 2 selesai
  // menunggu bayar, 2 sudah datang & menunggu di lounge (jadwal 10–20
  // menit lagi, kamar dipilih kasir saat check-in). Sisanya acak.
  const r5 = (x: number) => Math.round(x / 5) * 5;
  const forced: { status: St; at: (dur: number) => number }[] = [];
  if (nowMin !== null) {
    for (const off of [8, 20, 32, 45, 58, 72]) forced.push({ status: "IN_SESSION", at: () => r5(nowMin - off) });
    for (const back of [6, 16]) forced.push({ status: "COMPLETED", at: (dur) => r5(nowMin - back - dur) });
    for (const ahead of [10, 20]) forced.push({ status: "ARRIVED", at: () => r5(nowMin + ahead) });
  }
  let forcedTries = 0;

  while ((made < target || forced.length) && tries < target * 12) {
    tries++;
    const f = forced[0];
    if (f && ++forcedTries > 25) { forced.shift(); forcedTries = 0; continue; }
    const pkg = wpick(rng, ctx.packages, (p) => p.w);
    let st: number;
    if (f) {
      st = f.at(pkg.dur);
      if (st < OPEN_MIN || st + pkg.dur > CLOSE_MIN) continue;
      if (f.status === "IN_SESSION" && st + pkg.dur <= (nowMin as number) + 10) continue;
    } else {
      const slots: number[] = [];
      for (let t = OPEN_MIN; t + pkg.dur <= CLOSE_MIN; t += 30) slots.push(t);
      st = wpick(rng, slots, slotW);
    }
    const en = st + pkg.dur;
    const pax = pkg.room === "Couple" ? 2 : 1;
    const cand = avail.filter((t) => t.skills.includes(pkg.skill) && isFree(busyT, t.id, st, en + 15)).sort(() => rng() - 0.5);
    if (cand.length < pax) continue;
    const roomTypes = pkg.room === "Couple" ? ["Couple"] : pkg.room === "VIP" ? ["VIP"] : ["Massage", "VIP"];
    const room = activeRooms.find((r) => roomTypes.includes(r.type) && isFree(busyR, r.id, st, en + 10));
    if (!room) continue;

    // Status relatif jam sekarang.
    let status: St = "PAID";
    if (f) status = f.status;
    else if (nowMin === null) {
      const x = rng();
      status = x < 0.03 ? "CANCELLED" : x < 0.05 ? "NO_SHOW" : "PAID";
    } else if (en <= nowMin - 25) status = "PAID";
    else if (en <= nowMin) status = awaitingPay < 2 ? "COMPLETED" : "PAID";
    else if (st <= nowMin) status = inSession < 7 ? "IN_SESSION" : "PAID";
    else status = st - nowMin <= 120 ? "CONFIRMED" : "BOOKED";
    if (status === "PAID" && nowMin !== null && st <= nowMin && en > nowMin) continue; // sesi berjalan sudah cukup
    if (status === "COMPLETED") awaitingPay++;
    if (status === "IN_SESSION") inSession++;
    if (f) { forced.shift(); forcedTries = 0; }
    occupy(busyR, room.id, st, en + 10);

    // Satu customer tidak boleh punya dua kunjungan yang bentrok.
    let customerId = rng() < 0.08 ? ctx.customers[0] : pick(rng, ctx.customers);
    // Jeda 3 jam: tamu yang sama tidak datang lagi tepat setelah selesai.
    for (let k = 0; k < 8 && !isFree(busyC, customerId, st - 180, en + 180); k++) customerId = pick(rng, ctx.customers);
    occupy(busyC, customerId, st, en);
    for (let k = 0; k < pax; k++) {
      const th = cand[k];
      occupy(busyT, th.id, st, en + 15);
      const startIso = wallClockIso(date, hhmm(st));
      const endIso = plusMinutes(startIso, pkg.dur);
      const bookingId = randomUUID();
      const hasRoom = !["BOOKED", "CONFIRMED", "ARRIVED", "CANCELLED", "NO_SHOW"].includes(status);
      acc.bookings.push({
        id: bookingId, code: `BK-${date.replace(/-/g, "")}-${code4(rng)}`, outlet_id: ctx.outletId, customer_id: customerId,
        therapist_id: th.id, room_id: hasRoom ? room.id : null, package_id: pkg.id, duration_min: pkg.dur, price: pkg.price,
        date, scheduled_start: startIso, scheduled_end: endIso, status,
        source: pick(rng, ["Walk-in", "WhatsApp", "WhatsApp", "Customer App", "Phone", "Kasir"]), notes: MARK, add_on_ids: [],
      });
      if (!hasRoom) continue;

      const ext = status === "PAID" && ctx.extension && rng() < 0.1;
      const sessionEnd = ext ? plusMinutes(endIso, 30) : endIso;
      acc.sessions.push({
        id: randomUUID(), booking_id: bookingId, outlet_id: ctx.outletId, therapist_id: th.id, room_id: room.id,
        purchased_duration_min: pkg.dur, actual_start: startIso, expected_end: sessionEnd,
        ...(status === "IN_SESSION" ? {} : { actual_end: sessionEnd }),
        extension_minutes: ext ? 30 : 0, status: status === "IN_SESSION" ? "ACTIVE" : "COMPLETED",
      });
      if (status !== "PAID") continue;

      const txId = randomUUID();
      const items: Row[] = [{ transaction_id: txId, item_type: "SERVICE", name: pkg.name, qty: 1, unit_price: pkg.price, therapist_id: th.id }];
      let subtotal = pkg.price;
      if (ext && ctx.extension) {
        items.push({ transaction_id: txId, item_type: "EXTENSION", name: ctx.extension.name, qty: 1, unit_price: ctx.extension.price, therapist_id: th.id });
        subtotal += ctx.extension.price;
      }
      if (rng() < 0.3) {
        const sellable = ctx.products.filter((p) => p.sell !== null && (p.category === "Food & Beverage" || rng() < 0.15));
        const p = sellable.length ? pick(rng, sellable) : null;
        if (p && p.sell) {
          items.push({ transaction_id: txId, item_type: "PRODUCT", name: p.name, qty: 1, unit_price: p.sell, therapist_id: null });
          subtotal += p.sell;
        }
      }
      const paidAt = plusMinutes(sessionEnd, 4 + Math.floor(rng() * 10));
      const late = (ext ? en + 30 : en) >= 16 * 60 + 30;
      acc.transactions.push({
        id: txId, receipt_no: `${ctx.receiptPrefix}-${date.replace(/-/g, "")}-${code4(rng)}`, outlet_id: ctx.outletId,
        booking_id: bookingId, customer_id: customerId, cashier_id: late ? ctx.kasir2 : ctx.kasir1,
        subtotal, discount: 0, tax: 0, service_charge: 0, total: subtotal,
        payment_method: wpick(rng, ["QRIS", "Cash", "Debit Card", "Transfer"] as const, (m) => ({ QRIS: 45, Cash: 23, "Debit Card": 20, Transfer: 12 })[m]),
        status: "PAID", paid_at: paidAt, printed_count: 1,
      });
      acc.items.push(...items);
      const earned = commissionAmount(pkg.rule, pkg.price);
      if (earned > 0) acc.commissions.push({
        therapist_id: th.id, outlet_id: ctx.outletId, date, booking_id: bookingId, package_name: pkg.name,
        rule_snapshot: commissionRuleSnapshot(pkg.rule, pkg.name), basis_amount: pkg.price, amount: earned, status: "PENDING",
      });
      if (ext && ctx.extension) {
        const ee = commissionAmount(ctx.extension.rule, ctx.extension.price);
        if (ee > 0) acc.commissions.push({
          therapist_id: th.id, outlet_id: ctx.outletId, date, booking_id: bookingId, package_name: ctx.extension.name,
          rule_snapshot: commissionRuleSnapshot(ctx.extension.rule, ctx.extension.name), basis_amount: ctx.extension.price, amount: ee, status: "PENDING",
        });
      }
    }
    made += pax;
  }
}

function attendanceRows(ctx: Ctx, date: string, rng: Rng, closed: boolean): Row[] {
  const dow = dowOf(date);
  const rows: Row[] = [];
  for (const t of ctx.therapists) {
    if (OFF_DOW(t.idx) === dow) continue;
    const late = rng() < 0.08;
    const inMin = late ? OPEN_MIN + 5 + Math.floor(rng() * 20) : OPEN_MIN - 30 + Math.floor(rng() * 28);
    const checkIn = wallClockIso(date, hhmm(inMin));
    rows.push({
      employee_id: t.id, outlet_id: ctx.outletId, date, shift: "Setiap hari · 07:00–23:00",
      check_in_at: checkIn, check_out_at: closed ? wallClockIso(date, hhmm(1380 + Math.floor(rng() * 20))) : null,
      lat: -6.9024 + (rng() - 0.5) * 0.0006, lng: 107.6188 + (rng() - 0.5) * 0.0006, accuracy: 8 + Math.round(rng() * 20),
      distance_from_geofence: Math.round(5 + rng() * 60), device_id: "WEB-BROWSER", app_version: "web",
      location_status: "VALID", late_minutes: late ? inMin - OPEN_MIN : 0, status: closed ? "CHECKED_OUT" : late ? "LATE" : "CHECKED_IN", note: null,
    });
  }
  return rows;
}

async function seedActivity(admin: Admin, ctx: Ctx, log: SeedLog) {
  const today = todayIsoDate();
  const rng = mulberry32(20261020);
  let acc = newAcc();
  let n = 0;
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    fillDay(ctx, acc, plusDays(today, -d), null, rng);
    if (acc.bookings.length > 1200) { n += acc.bookings.length; await flush(admin, acc); acc = newAcc(); }
  }
  n += acc.bookings.length;
  await flush(admin, acc);
  log.push(`riwayat ${HISTORY_DAYS} hari: ${n} booking`);

  // Absensi 21 hari terakhir (lampau = sudah check-out).
  const att: Row[] = [];
  for (let d = 21; d >= 1; d--) att.push(...attendanceRows(ctx, plusDays(today, -d), rng, true));
  for (const part of chunks(att, 400)) {
    const { error } = await admin.from("attendance_events").insert(part);
    if (error) { log.push(`⚠️ absensi: ${error.message}`); break; }
  }

  // Cuti: 3 menunggu keputusan + 2 riwayat.
  const leaves = [
    { i: 8, date: plusDays(today, 4), type: "LEAVE", note: "Acara keluarga di Garut", status: "PENDING" },
    { i: 16, date: plusDays(today, 1), type: "LEAVE", note: "Kontrol ke dokter gigi", status: "PENDING" },
    { i: 4, date: plusDays(today, 3), type: "OFF", note: "Tukar libur dengan Eka W.", status: "PENDING" },
    { i: 1, date: plusDays(today, -12), type: "LEAVE", note: "Urusan administrasi", status: "APPROVED" },
    { i: 18, date: plusDays(today, -19), type: "LEAVE", note: "Liburan", status: "REJECTED" },
  ];
  for (const l of leaves) {
    const { error } = await admin.from("employee_leave_requests").insert({
      employee_id: ctx.therapists[l.i].id, outlet_id: ctx.outletId, date: l.date, type: l.type, note: l.note, status: l.status,
      requested_at: wallClockIso(plusDays(l.date, -5), "13:20"),
      ...(l.status === "PENDING" ? {} : { decided_by: ctx.managerEmp, decided_at: wallClockIso(plusDays(l.date, -4), "09:10") }),
    });
    if (error) { log.push(`⚠️ cuti: ${error.message}`); break; }
  }

  // Pengeluaran bulan lalu + bulan berjalan.
  const ym = today.slice(0, 7);
  const prev = plusDays(`${ym}-01`, -1).slice(0, 7);
  const dayNow = Number(today.slice(8, 10));
  const exp = [
    [1, "Sewa", "PT Graha Cendana", "Sewa gedung 3 lantai", 45000000],
    [2, "Gaji Staf", "Internal", "Gaji kasir, admin, kebersihan", 21500000],
    [3, "Utilitas", "PLN", "Listrik", 9850000],
    [3, "Utilitas", "PDAM", "Air", 1920000],
    [4, "Utilitas", "IndiHome", "Internet & telepon", 950000],
    [6, "Laundry", "Bersih Laundry", "Laundry linen minggu 1", 1850000],
    [9, "Bahan", "Toko Minyak Bali", "Minyak pijat & essential oil", 4300000],
    [11, "Marketing", "Meta Ads", "Iklan Instagram", 3500000],
    [13, "Laundry", "Bersih Laundry", "Laundry linen minggu 2", 1910000],
    [15, "Perawatan", "CV Sejuk", "Servis AC Private 07", 1250000],
    [17, "Bahan", "Rempah Nusantara", "Lulur, masker, rempah", 2150000],
    [20, "Laundry", "Bersih Laundry", "Laundry linen minggu 3", 1880000],
    [24, "F&B", "Pasar Kosambi", "Belanja minuman tamu", 1680000],
    [27, "Laundry", "Bersih Laundry", "Laundry linen minggu 4", 1900000],
  ] as const;
  const expRows: Row[] = [];
  for (const [m, isPrev] of [[prev, true], [ym, false]] as const) {
    for (const [d, category, vendor, description, amount] of exp) {
      if (!isPrev && d > dayNow) continue;
      expRows.push({
        outlet_id: ctx.outletId, date: `${m}-${String(d).padStart(2, "0")}`, category, vendor, amount, tax: 0,
        payment_method: amount > 5000000 ? "Bank Transfer" : "Cash", description,
        status: isPrev ? "PAID" : d >= dayNow - 2 ? "SUBMITTED" : "APPROVED", submitted_by: ctx.managerUser,
      });
    }
  }
  {
    const { error } = await admin.from("expenses").insert(expRows);
    if (error) log.push(`⚠️ pengeluaran: ${error.message}`);
  }
  log.push(`absensi ${att.length}, cuti ${leaves.length}, pengeluaran ${expRows.length}`);
}

/** Jadwal & kondisi "hari ini" relatif jam sekarang. Aman diulang. */
export async function refreshToday(admin: Admin, log: SeedLog = []): Promise<SeedLog> {
  const { data: tenant } = await admin.from("tenants").select("id").eq("slug", DEMO_TENANT_SLUG).maybeSingle();
  if (!tenant) { log.push("tenant royal-spa belum ada"); return log; }
  const ctx = await loadCtx(admin, tenant.id as string);
  const today = todayIsoDate();
  const [h, m] = nowHHMM().split(":").map(Number);
  // Di luar jam buka, tampilkan kondisi sore yang ramai supaya demo hidup.
  // Jam nyata kalau di dalam jam buka; di luar itu kondisi sore yang ramai
  // (catatan: di luar jam buka timer sesi akan tampak lewat waktu).
  let nowMin = h * 60 + m;
  if (nowMin < 8 * 60 + 15 || nowMin > 22 * 60 + 45) nowMin = 15 * 60 + 40;

  // Booking hari ini yang masih utuh dari seed (belum disentuh pengunjung)
  // dibuang lalu dibuat ulang relatif jam sekarang.
  const untouched = must(await admin.from("bookings").select("id").eq("outlet_id", ctx.outletId).eq("date", today)
    .eq("notes", MARK).in("status", ["BOOKED", "CONFIRMED"]), "booking hari ini") as { id: string }[];
  for (const part of chunks(untouched.map((b) => b.id), 200)) {
    must(await admin.from("bookings").delete().in("id", part), "hapus booking hari ini");
  }
  const kept = must(await admin.from("bookings").select("therapist_id, room_id, scheduled_start, scheduled_end")
    .eq("outlet_id", ctx.outletId).eq("date", today).not("status", "in", "(CANCELLED,NO_SHOW)"), "booking tersisa") as
    { therapist_id: string; room_id: string | null; scheduled_start: string; scheduled_end: string }[];
  const toMin = (iso: string) => { const [hh, mm] = iso.slice(11, 16).split(":").map(Number); return hh * 60 + mm; };
  const existing = kept.map((b) => ({ therapist_id: b.therapist_id, room_id: b.room_id, start: toMin(b.scheduled_start), end: toMin(b.scheduled_end) }));

  const acc = newAcc();
  fillDay(ctx, acc, today, nowMin, mulberry32(Date.now() % 100000), existing);
  await flush(admin, acc);

  // Absensi hari ini (kalau belum ada).
  const { count } = await admin.from("attendance_events").select("id", { count: "exact", head: true }).eq("outlet_id", ctx.outletId).eq("date", today);
  if (!count) {
    const rows = attendanceRows(ctx, today, mulberry32(7), false).filter((_, i) => i !== 3); // satu terapis belum absen
    const { error } = await admin.from("attendance_events").insert(rows);
    if (error) log.push(`⚠️ absensi hari ini: ${error.message}`);
  }
  // Shift kasir pagi terbuka.
  const { count: shiftCount } = await admin.from("cashier_shifts").select("id", { count: "exact", head: true }).eq("outlet_id", ctx.outletId).eq("business_date", today);
  if (!shiftCount && ctx.kasirUser) {
    const { error } = await admin.from("cashier_shifts").insert({
      outlet_id: ctx.outletId, business_date: today, shift_no: 1, status: "OPEN",
      opened_at: wallClockIso(today, "09:30"), opened_by: ctx.kasirUser, opened_by_name: "Rizky Amelia", opening_float: 500000,
    });
    if (error) log.push(`⚠️ shift kasir: ${error.message}`);
  }
  log.push(`hari ini (posisi ${hhmm(nowMin)}): +${acc.bookings.length} booking, ${acc.sessions.filter((s) => s.status === "ACTIVE").length} sesi berjalan`);
  return log;
}

async function loadCtx(admin: Admin, tenantId: string): Promise<Ctx> {
  const outlet = must(await admin.from("outlets").select("id, receipt_prefix").eq("tenant_id", tenantId).eq("code", DEMO_OUTLET_CODE).single(), "outlet") as { id: string; receipt_prefix: string };
  const pk = must(await admin.from("service_packages").select("id, name, duration_min, list_price, required_skill, room_type, commission_type, commission_value").eq("outlet_id", outlet.id).eq("status", "ACTIVE"), "paket") as
    { id: string; name: string; duration_min: number; list_price: number; required_skill: string; room_type: string; commission_type: string; commission_value: number }[];
  const ext = must(await admin.from("extension_options").select("id, name, price, commission_type, commission").eq("outlet_id", outlet.id).eq("active", true).limit(1).maybeSingle(), "extension") as
    { id: string; name: string; price: number; commission_type: string; commission: number } | null;
  const rooms = must(await admin.from("rooms").select("id, type, status").eq("outlet_id", outlet.id), "rooms") as Ctx["rooms"];
  const emps = must(await admin.from("employees").select("id, code, skills, is_therapist").eq("tenant_id", tenantId).eq("status", "ACTIVE"), "karyawan") as { id: string; code: string; skills: string[]; is_therapist: boolean }[];
  const custs = must(await admin.from("customers").select("id, phone").eq("tenant_id", tenantId).eq("notes", MARK).order("phone"), "customer") as { id: string; phone: string }[];
  const users = must(await admin.from("app_users").select("id, role").eq("tenant_id", tenantId), "app_users") as { id: string; role: string }[];
  const prods = must(await admin.from("products").select("id, name, sell_price, category").eq("tenant_id", tenantId), "produk") as { id: string; name: string; sell_price: number | null; category: string }[];
  const w = Object.fromEntries(PACKAGES.map((p) => [p.name, p.w]));
  return {
    tenantId, outletId: outlet.id, receiptPrefix: outlet.receipt_prefix ?? "RSB",
    packages: pk.map((p) => ({
      id: p.id, name: p.name, dur: p.duration_min, price: Number(p.list_price), skill: p.required_skill, room: p.room_type,
      rule: { type: (p.commission_type ?? "fixed") as CommissionRule["type"], value: Number(p.commission_value ?? 0) },
      w: w[p.name.replace(/ \d+'$/, "")] ?? 5,
    })),
    extension: ext ? { id: ext.id, name: ext.name, price: Number(ext.price), rule: { type: (ext.commission_type ?? "fixed") as CommissionRule["type"], value: Number(ext.commission ?? 0) } } : null,
    rooms,
    therapists: emps.filter((e) => e.is_therapist && e.code.startsWith("TRP-RS-")).map((e) => ({ id: e.id, idx: Number(e.code.slice(-2)) - 1, skills: e.skills ?? [] })),
    customers: custs.map((c) => c.id),
    kasir1: emps.find((e) => e.code === "STF-KSR-1")?.id ?? "",
    kasir2: emps.find((e) => e.code === "STF-KSR-2")?.id ?? emps.find((e) => e.code === "STF-KSR-1")?.id ?? "",
    kasirUser: users.find((u) => u.role === "kasir")?.id ?? null,
    managerEmp: emps.find((e) => e.code === "STF-MGR")?.id ?? "",
    managerUser: users.find((u) => u.role === "manager")?.id ?? null,
    products: prods.map((p) => ({ id: p.id, name: p.name, sell: p.sell_price === null ? null : Number(p.sell_price), category: p.category })),
  };
}

/** Seed penuh: master → reset aktivitas → riwayat → hari ini. */
export async function seedRoyalSpa(admin: Admin): Promise<{ ok: boolean; log: SeedLog }> {
  const log: SeedLog = [];
  try {
    const ctx0 = await seedMasters(admin, log);
    const { data: reset, error: resetErr } = await admin.rpc("demo_reset_activity", { p_tenant_slug: DEMO_TENANT_SLUG });
    if (resetErr) throw new SeedError(`reset aktivitas (sudah jalankan migrasi 0043?): ${resetErr.message}`);
    log.push(`reset: ${JSON.stringify(reset)}`);
    const ctx = await loadCtx(admin, ctx0.tenantId);
    await seedActivity(admin, ctx, log);
    await refreshToday(admin, log);
    return { ok: true, log };
  } catch (e) {
    log.push(`❌ ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, log };
  }
}
