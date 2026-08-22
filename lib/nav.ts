import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  section?: string;
}

export interface RoleDef {
  key: Role;
  name: string;
  scope: string;
  base: string;
  tagline: string;
  icon: string;
  tone: string;
  persona: { name: string; sub: string };
  nav: NavItem[];
}

export const ROLES: RoleDef[] = [
  {
    key: "super-admin",
    name: "Super Admin",
    scope: "Platform",
    base: "/super-admin",
    tagline: "Provisioning tenant, plan, entitlement, subscription, feature flag, dan analitik platform.",
    icon: "shield",
    tone: "violet",
    persona: { name: "Rangga Pratama", sub: "Platform Owner · TheraHub Cloud" },
    nav: [
      { href: "/super-admin", label: "Dashboard", icon: "layout-dashboard", section: "Platform" },
      { href: "/super-admin/tenants", label: "Tenants", icon: "building-2", section: "Platform" },
      { href: "/super-admin/plans", label: "Plans & Entitlements", icon: "layers", section: "Platform" },
      { href: "/super-admin/subscriptions", label: "Subscriptions & Limits", icon: "credit-card", section: "Platform" },
      { href: "/super-admin/flags", label: "Feature Flags", icon: "flag", section: "Control" },
      { href: "/super-admin/diagnostics", label: "Support Diagnostics", icon: "life-buoy", section: "Control" },
      { href: "/super-admin/analytics", label: "Platform Analytics", icon: "line-chart", section: "Insight" },
      { href: "/super-admin/audit", label: "Audit Log", icon: "scroll-text", section: "Insight" },
    ],
  },
  {
    key: "admin",
    name: "Admin Tenant",
    scope: "Tenant / assigned outlets",
    base: "/admin",
    tagline: "Setup profil bisnis, outlet, geofence, user & assignment, room, dan integrasi.",
    icon: "settings-2",
    tone: "sky",
    persona: { name: "Dewi Anggraini", sub: "Admin · Amethyst" },
    nav: [
      { href: "/admin", label: "Setup Progress", icon: "list-checks", section: "Onboarding" },
      { href: "/admin/profile", label: "Business Profile", icon: "building", section: "Onboarding" },
      { href: "/admin/outlets", label: "Outlets", icon: "map-pin", section: "Onboarding" },
      { href: "/admin/geofence", label: "Geofence & Attendance", icon: "radar", section: "Onboarding" },
      { href: "/admin/users", label: "Users & Assignment", icon: "users", section: "Access" },
      { href: "/admin/rooms", label: "Rooms", icon: "door-open", section: "Master" },
      { href: "/admin/master", label: "Master Initial", icon: "layers-3", section: "Master" },
      { href: "/admin/integrations", label: "Integrations", icon: "plug", section: "Master" },
      { href: "/admin/settings", label: "Tenant Settings", icon: "sliders-horizontal", section: "Master" },
    ],
  },
  {
    key: "owner",
    name: "Owner",
    scope: "Tenant",
    base: "/owner",
    tagline: "Dashboard konsolidasi, profitability, payroll liability, expense, dan approval.",
    icon: "crown",
    tone: "gold",
    persona: { name: "Bpk. Hendra Wijaya", sub: "Owner · Amethyst Group" },
    nav: [
      { href: "/owner", label: "All Outlets KPI", icon: "layout-dashboard", section: "Business" },
      { href: "/owner/revenue", label: "Revenue & Profitability", icon: "trending-up", section: "Business" },
      { href: "/owner/payroll", label: "Payroll Liability", icon: "wallet", section: "Finance" },
      { href: "/owner/expenses", label: "Expenses", icon: "receipt", section: "Finance" },
      { href: "/owner/inventory", label: "Inventory Summary", icon: "package", section: "Operations" },
      { href: "/owner/therapists", label: "Therapist Performance", icon: "sparkles", section: "Operations" },
      { href: "/owner/approvals", label: "Approvals", icon: "check-check", badge: 8, section: "Control" },
      { href: "/owner/audit", label: "Audit & Export", icon: "scroll-text", section: "Control" },
    ],
  },
  {
    key: "manager",
    name: "Manager Outlet",
    scope: "Outlet",
    base: "/manager",
    tagline: "Seluruh konfigurasi dan operasional outlet: katalog, booking, sesi, terapis, stok, laporan.",
    icon: "clipboard-list",
    tone: "teal",
    persona: { name: "Sinta Maharani", sub: "Manager · Amethyst Cikawao" },
    nav: [
      { href: "/manager", label: "Today", icon: "sun", section: "Operasional" },
      { href: "/manager/bookings", label: "Bookings", icon: "calendar-days", section: "Operasional" },
      { href: "/manager/schedule-check", label: "Cek Jadwal Terapis", icon: "calendar-check", section: "Operasional" },
      { href: "/manager/sessions", label: "Sessions", icon: "timer", badge: 3, section: "Operasional" },
      { href: "/manager/rooms", label: "Rooms", icon: "door-open", section: "Operasional" },
      { href: "/manager/catalog", label: "Catalog", icon: "book-open", section: "Master" },
      { href: "/manager/therapists", label: "Therapists & Staff", icon: "users", section: "Master" },
      { href: "/manager/customers", label: "Customers", icon: "heart-handshake", section: "Master" },
      { href: "/manager/promotions", label: "Promo & Membership", icon: "ticket", section: "Master" },
      { href: "/manager/pos", label: "POS / Transactions", icon: "receipt", section: "Commerce" },
      { href: "/manager/commissions", label: "Komisi Terapis", icon: "percent", section: "Commerce" },
      { href: "/manager/payroll", label: "Payroll", icon: "wallet", section: "Insight" },
      { href: "/manager/payroll-settings", label: "Pengaturan Payroll", icon: "sliders-horizontal", section: "Insight" },
      { href: "/manager/inventory", label: "Inventory", icon: "package", section: "Commerce" },
      { href: "/manager/expenses", label: "Expenses", icon: "wallet", section: "Commerce" },
      { href: "/manager/reports", label: "Reports", icon: "bar-chart-3", section: "Insight" },
      { href: "/manager/settings", label: "Outlet Settings", icon: "sliders-horizontal", section: "Insight" },
    ],
  },
  {
    key: "kasir",
    name: "Kasir",
    scope: "Outlet",
    base: "/kasir",
    tagline: "Booking harian, check-in tamu, monitor sesi, POS cart, pembayaran, dan cetak struk.",
    icon: "scan-line",
    tone: "emerald",
    persona: { name: "Nurul Fadhilah", sub: "Kasir · Amethyst Cikawao" },
    nav: [
      { href: "/kasir", label: "Today / Booking", icon: "calendar-clock", section: "Front Office" },
      { href: "/kasir/schedule-check", label: "Cek Jadwal Terapis", icon: "calendar-check", section: "Front Office" },
      { href: "/kasir/checkin", label: "Customer Check-in", icon: "user-check", section: "Front Office" },
      { href: "/kasir/sessions", label: "Session Monitor", icon: "timer", section: "Front Office" },
      { href: "/kasir/pos", label: "POS Cart", icon: "shopping-cart", section: "Transaksi" },
      { href: "/kasir/payment", label: "Payment", icon: "credit-card", section: "Transaksi" },
      { href: "/kasir/receipts", label: "Receipts & Reprint", icon: "printer", section: "Transaksi" },
      { href: "/kasir/closing", label: "Shift Closing", icon: "lock", section: "Transaksi" },
    ],
  },
  {
    key: "therapist",
    name: "Terapis",
    scope: "Self + assigned jobs",
    base: "/therapist",
    tagline: "Absensi GPS, jadwal, job, kontrol sesi, request extension, komisi, dan payslip.",
    icon: "hand-heart",
    tone: "rose",
    persona: { name: "Melati Puspita", sub: "Terapis Master · TRP-005" },
    nav: [
      { href: "/therapist", label: "Beranda", icon: "home", section: "Harian" },
      { href: "/therapist/attendance", label: "Absensi GPS", icon: "map-pin-check", section: "Harian" },
      { href: "/therapist/shift", label: "Jadwal Saya", icon: "calendar-days", section: "Harian" },
      { href: "/therapist/jobs", label: "Job Saya", icon: "list-todo", badge: 2, section: "Harian" },
      { href: "/therapist/session", label: "Sesi Aktif", icon: "timer", section: "Harian" },
      { href: "/therapist/commission", label: "Komisi Saya", icon: "percent", section: "Penghasilan" },
      { href: "/therapist/payslip", label: "Payslip & Tabungan", icon: "wallet", section: "Penghasilan" },
      { href: "/therapist/notifications", label: "Notifikasi", icon: "bell", badge: 2, section: "Penghasilan" },
    ],
  },
  {
    key: "customer",
    name: "Customer",
    scope: "Self",
    base: "/customer",
    tagline: "Pilih outlet, layanan, terapis, jadwal; kelola booking, riwayat, dan membership.",
    icon: "user-round",
    tone: "cyan",
    persona: { name: "Tamu Amethyst", sub: "Progressive Web App" },
    nav: [
      { href: "/customer", label: "Beranda", icon: "home" },
      { href: "/customer/book", label: "Booking", icon: "calendar-plus" },
      { href: "/customer/history", label: "Riwayat", icon: "history" },
      { href: "/customer/membership", label: "Membership", icon: "gem" },
      { href: "/customer/profile", label: "Profil", icon: "user-round" },
    ],
  },
];

export const roleByKey = (k: string) => ROLES.find((r) => r.key === k)!;
export const roleByPath = (p: string) => ROLES.find((r) => p.startsWith(r.base))!;
