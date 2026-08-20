import type { Plan, Tenant, FeatureFlag, ModuleKey, AuditLog } from "../types";
import { BACKGROUND_PRESETS } from "../brand";
import { makeRng, int, pick, chance } from "./rng";

export const MODULE_LIST: { key: ModuleKey; label: string; desc: string; owner: string }[] = [
  { key: "core", label: "Core SaaS", desc: "Tenant, outlet, user, RBAC, settings, audit", owner: "Super Admin entitlement; Admin setup" },
  { key: "hr", label: "HR", desc: "Employee, terapis, shift, time-off", owner: "Admin / Manager" },
  { key: "attendance", label: "Attendance", desc: "Absensi GPS, geofence, late, anomaly", owner: "Admin setup; Manager review" },
  { key: "operations", label: "Spa Operations", desc: "Paket Layanan, booking, room, session, extension", owner: "Manager Outlet" },
  { key: "pos", label: "POS", desc: "Cart service/produk, payment, receipt", owner: "Manager / Kasir" },
  { key: "inventory", label: "Inventory", desc: "Stock, purchase, usage, opname", owner: "Manager Outlet" },
  { key: "payroll", label: "Payroll", desc: "Komisi, gaji tetap/variabel, potongan, tabungan, THR", owner: "Owner / Admin" },
  { key: "finance", label: "Finance", desc: "Expense, petty cash, profitability", owner: "Owner / Manager" },
  { key: "crm", label: "CRM", desc: "Customer profile, membership, voucher, campaign", owner: "Manager / Owner" },
  { key: "multi_outlet", label: "Multi-Outlet", desc: "Multi outlet + consolidated report", owner: "Super Admin entitlement" },
];

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    target: "1 outlet kecil",
    pricePerOutlet: 490_000,
    maxOutlets: 1,
    maxUsers: 10,
    maxTherapists: 8,
    modules: ["core", "hr", "operations"],
    features: ["Core SaaS", "HR basic", "Operations basic", "POS opsional", "Email support"],
  },
  {
    key: "professional",
    name: "Professional",
    target: "Outlet menengah",
    pricePerOutlet: 990_000,
    maxOutlets: 2,
    maxUsers: 25,
    maxTherapists: 20,
    modules: ["core", "hr", "attendance", "operations", "pos", "inventory"],
    features: ["Semua Starter", "Attendance GPS", "POS + printer", "Room management", "Detailed reports", "Inventory opsional"],
  },
  {
    key: "business",
    name: "Business / Multi-Outlet",
    target: "Brand beberapa cabang",
    pricePerOutlet: 1_690_000,
    maxOutlets: 8,
    maxUsers: 80,
    maxTherapists: 70,
    modules: ["core", "hr", "attendance", "operations", "pos", "inventory", "payroll", "finance", "crm", "multi_outlet"],
    features: ["Semua Professional", "Multi-outlet + konsolidasi", "Owner dashboard", "Inventory transfer", "Payroll", "Custom permission"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    target: "Jaringan besar",
    pricePerOutlet: 2_890_000,
    maxOutlets: 60,
    maxUsers: 500,
    maxTherapists: 400,
    modules: ["core", "hr", "attendance", "operations", "pos", "inventory", "payroll", "finance", "crm", "multi_outlet"],
    features: ["Semua Business", "SSO + SLA", "Advanced audit", "Custom integration", "Advanced API/webhooks", "Data policy"],
  },
];

export const planOf = (key: string) => PLANS.find((p) => p.key === key)!;

function mods(list: ModuleKey[]): Record<ModuleKey, boolean> {
  const all: Record<string, boolean> = {};
  MODULE_LIST.forEach((m) => (all[m.key] = list.includes(m.key)));
  return all as Record<ModuleKey, boolean>;
}

const TENANT_SEEDS: {
  name: string; slug: string; legal: string; plan: Plan["key"]; status: Tenant["status"];
  city: string; outlets: number; users: number; therapists: number; tone: string; bg?: string;
  created: string; renewal: string; health: number; lastActive: string; extraOff?: ModuleKey[];
}[] = [
  { name: "Amethyst", slug: "amethyst", legal: "Amethyst", plan: "business", status: "ACTIVE", city: "Bandung", outlets: 3, users: 46, therapists: 28, tone: "teal", bg: "aurora", created: "2025-02-11", renewal: "2026-09-11", health: 92, lastActive: "2026-08-18" },
  { name: "Relax Massage Indonesia", slug: "relax-massage-id", legal: "CV Relax Sejahtera", plan: "professional", status: "ACTIVE", city: "Jakarta Selatan", outlets: 2, users: 22, therapists: 16, tone: "violet", created: "2025-06-02", renewal: "2026-09-02", health: 84, lastActive: "2026-08-18" },
  { name: "Bali Serenity Spa", slug: "bali-serenity", legal: "PT Serenity Bali Retreat", plan: "enterprise", status: "ACTIVE", city: "Denpasar", outlets: 6, users: 118, therapists: 82, tone: "gold", created: "2024-11-20", renewal: "2026-11-20", health: 96, lastActive: "2026-08-18" },
  { name: "Griya Sehat Kartika", slug: "griya-kartika", legal: "UD Kartika Sehat", plan: "starter", status: "TRIAL", city: "Yogyakarta", outlets: 1, users: 7, therapists: 5, tone: "lime", created: "2026-08-04", renewal: "2026-09-03", health: 61, lastActive: "2026-08-17" },
  { name: "Aroma Reflexology", slug: "aroma-reflexology", legal: "CV Aroma Nusantara", plan: "professional", status: "ACTIVE", city: "Surabaya", outlets: 2, users: 19, therapists: 14, tone: "rose", created: "2025-09-14", renewal: "2026-09-14", health: 78, lastActive: "2026-08-18" },
  { name: "Lotus Thai Spa", slug: "lotus-thai", legal: "PT Lotus Wellness Group", plan: "business", status: "GRACE", city: "Semarang", outlets: 4, users: 51, therapists: 34, tone: "amber", created: "2025-04-08", renewal: "2026-08-08", health: 48, lastActive: "2026-08-15" },
  { name: "Sentuhan Bunda Spa", slug: "sentuhan-bunda", legal: "UD Sentuhan Bunda", plan: "starter", status: "ACTIVE", city: "Malang", outlets: 1, users: 9, therapists: 6, tone: "sky", created: "2025-12-01", renewal: "2026-12-01", health: 71, lastActive: "2026-08-18" },
  { name: "Urban Reflexo Hub", slug: "urban-reflexo", legal: "PT Urban Reflexo Indonesia", plan: "professional", status: "SUSPENDED", city: "Tangerang", outlets: 2, users: 17, therapists: 11, tone: "indigo", created: "2025-07-22", renewal: "2026-07-22", health: 22, lastActive: "2026-07-30" },
  { name: "Sanur Wellness Club", slug: "sanur-wellness", legal: "PT Sanur Wellness Club", plan: "business", status: "ACTIVE", city: "Sanur", outlets: 3, users: 38, therapists: 26, tone: "cyan", created: "2025-03-19", renewal: "2026-09-19", health: 88, lastActive: "2026-08-18" },
  { name: "Prima Reflexology Center", slug: "prima-reflexo", legal: "CV Prima Sehat Mandiri", plan: "professional", status: "ACTIVE", city: "Medan", outlets: 2, users: 20, therapists: 15, tone: "emerald", created: "2025-10-30", renewal: "2026-10-30", health: 81, lastActive: "2026-08-18" },
  { name: "Harmoni Body Care", slug: "harmoni-body", legal: "UD Harmoni Body Care", plan: "starter", status: "CHURNED", city: "Solo", outlets: 1, users: 6, therapists: 4, tone: "amber", created: "2025-05-05", renewal: "2026-05-05", health: 8, lastActive: "2026-05-12" },
  { name: "Nusantara Spa Group", slug: "nusantara-spa", legal: "PT Nusantara Spa Group", plan: "enterprise", status: "ACTIVE", city: "Jakarta Pusat", outlets: 9, users: 172, therapists: 121, tone: "violet", created: "2024-08-15", renewal: "2026-08-15", health: 94, lastActive: "2026-08-18" },
];

export const TENANTS: Tenant[] = TENANT_SEEDS.map((t, i) => {
  const plan = planOf(t.plan);
  const m = mods(plan.modules);
  (t.extraOff ?? []).forEach((k) => (m[k] = false));
  if (t.plan === "professional" && i % 2 === 1) m.inventory = false;
  return {
    id: `TEN-${String(i + 1).padStart(3, "0")}`,
    name: t.name,
    slug: t.slug,
    legalName: t.legal,
    logoTone: t.tone,
    bgTone: t.bg ?? BACKGROUND_PRESETS[i % BACKGROUND_PRESETS.length].key,
    plan: t.plan,
    status: t.status,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    createdAt: t.created,
    renewalAt: t.renewal,
    mrr: plan.pricePerOutlet * t.outlets,
    outletCount: t.outlets,
    userCount: t.users,
    therapistCount: t.therapists,
    modules: m,
    maxOutlets: plan.maxOutlets,
    adminEmail: `admin@${t.slug}.id`,
    city: t.city,
    healthScore: t.health,
    lastActiveAt: t.lastActive,
  };
});

export const ACTIVE_TENANT = TENANTS[0]; // Amethyst — the demo tenant (real first-project spa)

export const FEATURE_FLAGS: FeatureFlag[] = [
  { key: "attendance.gps_enabled", label: "GPS Attendance", description: "Absensi berbasis geofence untuk terapis & karyawan.", scope: "tenant", rollout: 92, enabledTenants: ["TEN-001", "TEN-002", "TEN-003", "TEN-005", "TEN-006", "TEN-009", "TEN-010", "TEN-012"], group: "Attendance" },
  { key: "attendance.device_binding", label: "Device Binding", description: "Kunci absensi ke device terdaftar untuk mengurangi fake GPS.", scope: "tenant", rollout: 41, enabledTenants: ["TEN-003", "TEN-012"], group: "Attendance" },
  { key: "attendance.anomaly_review", label: "Anomaly Review Queue", description: "Antrian review manager untuk absensi suspicious.", scope: "tenant", rollout: 66, enabledTenants: ["TEN-001", "TEN-003", "TEN-009", "TEN-012"], group: "Attendance" },
  { key: "operations.extension_enabled", label: "Session Extension", description: "Permintaan extension +15/+30/+60 dengan recheck resource.", scope: "outlet", rollout: 88, enabledTenants: ["TEN-001", "TEN-002", "TEN-003", "TEN-005", "TEN-009", "TEN-010"], group: "Operations" },
  { key: "operations.couple_booking", label: "Couple / Linked Booking", description: "Dua terapis + satu couple room dalam booking terhubung.", scope: "outlet", rollout: 34, enabledTenants: ["TEN-003", "TEN-009"], group: "Operations" },
  { key: "operations.waiting_list", label: "Waiting List Auto-offer", description: "Menawarkan slot batal otomatis ke waiting list.", scope: "tenant", rollout: 18, enabledTenants: ["TEN-003"], group: "Operations" },
  { key: "pos.bluetooth_print", label: "Bluetooth Thermal Print", description: "Cetak receipt via Bluetooth ESC/POS melalui device bridge.", scope: "outlet", rollout: 73, enabledTenants: ["TEN-001", "TEN-002", "TEN-003", "TEN-009", "TEN-010"], group: "POS" },
  { key: "pos.split_payment", label: "Split Payment", description: "Satu tagihan dengan beberapa metode pembayaran.", scope: "tenant", rollout: 52, enabledTenants: ["TEN-001", "TEN-003", "TEN-012"], group: "POS" },
  { key: "inventory.enabled", label: "Inventory Module", description: "Stock, purchase, usage, opname per outlet.", scope: "tenant", rollout: 64, enabledTenants: ["TEN-001", "TEN-003", "TEN-006", "TEN-009", "TEN-012"], group: "Inventory" },
  { key: "inventory.transfer", label: "Cross-Outlet Transfer", description: "Transfer stok antar outlet dalam tenant.", scope: "tenant", rollout: 29, enabledTenants: ["TEN-001", "TEN-003", "TEN-012"], group: "Inventory" },
  { key: "payroll.enabled", label: "Payroll Module", description: "Gaji tetap + variabel + potongan + tabungan + THR.", scope: "tenant", rollout: 47, enabledTenants: ["TEN-001", "TEN-003", "TEN-006", "TEN-009", "TEN-012"], group: "Payroll" },
  { key: "payroll.savings_ledger", label: "Employee Savings Ledger", description: "Tabungan karyawan sebagai ledger terpisah.", scope: "tenant", rollout: 33, enabledTenants: ["TEN-001", "TEN-003", "TEN-012"], group: "Payroll" },
  { key: "crm.membership_enabled", label: "Membership & Prepaid", description: "Membership tier, prepaid package, loyalty points.", scope: "tenant", rollout: 44, enabledTenants: ["TEN-001", "TEN-003", "TEN-009", "TEN-012"], group: "CRM" },
  { key: "crm.customer_pwa", label: "Customer PWA Booking", description: "Self-service booking untuk customer tanpa install app.", scope: "tenant", rollout: 38, enabledTenants: ["TEN-001", "TEN-003", "TEN-012"], group: "CRM" },
  { key: "finance.profitability", label: "Profitability Dashboard", description: "P&L style outlet dan konsolidasi tenant.", scope: "tenant", rollout: 40, enabledTenants: ["TEN-001", "TEN-003", "TEN-009", "TEN-012"], group: "Finance" },
  { key: "platform.support_mode", label: "Support Diagnostics Mode", description: "Akses troubleshooting terbatas + time-bound + diaudit.", scope: "platform", rollout: 100, enabledTenants: [], group: "Platform" },
];

// ---- Platform analytics series -------------------------------------------
const rng = makeRng(20260818);

export const PLATFORM_MRR_SERIES = (() => {
  const months = ["Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu"];
  let base = 22_400_000;
  return months.map((m) => {
    base = Math.round(base * (1 + 0.028 + rng() * 0.05));
    return { month: m, mrr: base, tenants: Math.round(base / 1_900_000) };
  });
})();

export const PLATFORM_USAGE_SERIES = (() => {
  const days = Array.from({ length: 14 }, (_, i) => i);
  return days.map((d) => ({
    day: `${11 + d > 31 ? 11 + d - 31 : 11 + d}/8`,
    bookings: int(rng, 820, 1480),
    sessions: int(rng, 760, 1390),
    attendance: int(rng, 410, 690),
  }));
})();

export const PLAN_MIX = PLANS.map((p) => ({
  name: p.name.split(" ")[0],
  value: TENANTS.filter((t) => t.plan === p.key).length,
  mrr: TENANTS.filter((t) => t.plan === p.key).reduce((s, t) => s + t.mrr, 0),
}));

export const PLATFORM_INCIDENTS = [
  { id: "INC-4412", at: "2026-08-18T09:12", title: "Payment webhook retry spike", severity: "warning" as const, module: "POS", tenant: "Bali Serenity Spa", status: "Monitoring" },
  { id: "INC-4409", at: "2026-08-17T21:40", title: "Print bridge offline > 30 menit", severity: "warning" as const, module: "POS", tenant: "Lotus Thai Spa", status: "Resolved" },
  { id: "INC-4405", at: "2026-08-17T14:03", title: "Attendance anomaly rate di atas threshold", severity: "critical" as const, module: "Attendance", tenant: "Urban Reflexo Hub", status: "Investigating" },
  { id: "INC-4398", at: "2026-08-16T08:55", title: "Notification WA provider latency", severity: "info" as const, module: "Notifications", tenant: "Platform-wide", status: "Resolved" },
];

// ---- Audit log ------------------------------------------------------------
const AUDIT_TEMPLATES: { action: string; entity: string; role: AuditLog["actorRole"]; sev: AuditLog["severity"]; detail: string }[] = [
  { action: "entitlement.module.updated", entity: "module_entitlements", role: "super-admin", sev: "critical", detail: "Modul Inventory diaktifkan untuk tenant" },
  { action: "tenant.plan.changed", entity: "tenants", role: "super-admin", sev: "critical", detail: "Plan diubah Professional → Business" },
  { action: "outlet.created", entity: "outlets", role: "admin", sev: "info", detail: "Outlet baru dibuat dengan geofence radius 120 m" },
  { action: "outlet.geofence.updated", entity: "outlets", role: "admin", sev: "warning", detail: "Radius geofence diubah 80 m → 120 m" },
  { action: "package.price.changed", entity: "service_packages", role: "manager", sev: "warning", detail: "Harga Traditional Massage 90 diubah Rp190.000 → Rp200.000" },
  { action: "extension.approved", entity: "session_extensions", role: "manager", sev: "info", detail: "Extension +30 disetujui setelah recheck room" },
  { action: "transaction.discount.applied", entity: "transactions", role: "kasir", sev: "warning", detail: "Manual discount 15% dengan alasan 'komplain durasi'" },
  { action: "transaction.void", entity: "transactions", role: "manager", sev: "critical", detail: "Transaksi di-void, alasan salah input paket" },
  { action: "refund.created", entity: "refunds", role: "manager", sev: "critical", detail: "Refund parsial Rp120.000 + reversal komisi" },
  { action: "attendance.reviewed", entity: "attendance_reviews", role: "manager", sev: "warning", detail: "Absensi SUSPICIOUS ditandai valid setelah klarifikasi" },
  { action: "stock.adjustment.posted", entity: "stock_movements", role: "manager", sev: "warning", detail: "Adjustment -6 pcs disposable sheet (waste)" },
  { action: "payroll.approved", entity: "payroll_runs", role: "owner", sev: "critical", detail: "Payroll periode Juli 2026 disetujui" },
  { action: "expense.approved", entity: "expenses", role: "owner", sev: "info", detail: "Biaya laundry Rp3.400.000 disetujui" },
  { action: "commission.rule.updated", entity: "commission_rules", role: "owner", sev: "warning", detail: "Rule komisi 90 menit Rp50.000 → Rp55.000" },
  { action: "support.mode.opened", entity: "support_sessions", role: "super-admin", sev: "critical", detail: "Support mode dibuka 60 menit, read-only" },
  { action: "user.role.assigned", entity: "user_roles", role: "admin", sev: "warning", detail: "Role Manager Outlet diberikan ke user baru" },
  { action: "booking.rescheduled", entity: "bookings", role: "kasir", sev: "info", detail: "Booking dipindah 14:00 → 16:30 dengan recheck resource" },
  { action: "printer.profile.updated", entity: "printer_profiles", role: "manager", sev: "info", detail: "Printer 58 mm diganti ke 80 mm LAN" },
];

const ACTORS = [
  { name: "Rangga Pratama", role: "super-admin" as const },
  { name: "Dewi Anggraini", role: "admin" as const },
  { name: "Bpk. Hendra Wijaya", role: "owner" as const },
  { name: "Sinta Maharani", role: "manager" as const },
  { name: "Yoga Saputra", role: "manager" as const },
  { name: "Nurul Fadhilah", role: "kasir" as const },
  { name: "Bayu Ramadhan", role: "kasir" as const },
];

export const AUDIT_LOGS: AuditLog[] = (() => {
  const r = makeRng(90210);
  const out: AuditLog[] = [];
  for (let i = 0; i < 64; i++) {
    const tpl = pick(r, AUDIT_TEMPLATES);
    const actor = ACTORS.find((a) => a.role === tpl.role) ?? pick(r, ACTORS);
    const day = 18 - Math.floor(i / 5);
    const hh = String(int(r, 7, 21)).padStart(2, "0");
    const mm = String(int(r, 0, 59)).padStart(2, "0");
    out.push({
      id: `AUD-${9000 - i}`,
      at: `2026-08-${String(Math.max(day, 1)).padStart(2, "0")}T${hh}:${mm}`,
      actor: actor.name,
      actorRole: actor.role,
      action: tpl.action,
      entity: tpl.entity,
      entityId: `${tpl.entity.slice(0, 3).toUpperCase()}-${int(r, 1000, 9999)}`,
      scope: chance(r, 0.4) ? "Amethyst · Cikawao" : pick(r, ["Amethyst", "Amethyst · Setiabudi", "Amethyst · Pasteur", "Platform"]),
      severity: tpl.sev,
      detail: tpl.detail,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
})();

export const PLATFORM_KPI = {
  activeTenants: TENANTS.filter((t) => t.status === "ACTIVE" || t.status === "TRIAL").length,
  totalOutlets: TENANTS.reduce((s, t) => s + t.outletCount, 0),
  totalUsers: TENANTS.reduce((s, t) => s + t.userCount, 0),
  totalTherapists: TENANTS.reduce((s, t) => s + t.therapistCount, 0),
  mrr: TENANTS.filter((t) => t.status !== "CHURNED" && t.status !== "SUSPENDED").reduce((s, t) => s + t.mrr, 0),
  churnRate: 3.4,
  apiSuccessRate: 99.82,
  avgLatencyMs: 148,
  printFailureRate: 0.7,
  notificationDelivery: 97.4,
  openTickets: 11,
};
