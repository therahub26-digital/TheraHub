import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * Angka lencana di samping menu.
   *
   * ⚠️ 2026-08-26 — SELURUH lencana tetap dihapus dari file ini. Nilainya
   * dulu ditulis tangan (Approvals 8, Sessions 3, Jadwal & Job 2,
   * Notifikasi 2) dan tidak pernah dihitung dari apa pun: lencananya
   * menyala dengan angka yang sama entah ada 0 atau 50 item menunggu.
   * Di MobileShell angka itu juga menyalakan titik merah di tab bar, jadi
   * terapis melihat penanda "ada yang baru" yang tidak pernah padam.
   *
   * `lib/nav.ts` dievaluasi sekali sebagai konstanta modul — ia tidak punya
   * akses ke sesi maupun database, jadi lencana yang JUJUR tidak bisa lahir
   * di sini. Kalau nanti diperlukan, hitungannya harus diambil per-request
   * di layout (pola yang sudah dipakai `notificationCount` di Shell) lalu
   * diturunkan ke item menu — bukan dituliskan kembali sebagai angka tetap.
   */
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
      { href: "/owner/approvals", label: "Approvals", icon: "check-check", section: "Control" },
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
      { href: "/manager/sessions", label: "Sessions", icon: "timer", section: "Operasional" },
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
    // 2026-08-26 — dulu "Melati Puspita · Terapis Master · TRP-005".
    // Melati Puspita adalah persona demo fiktif yang sempat ACTIVE di
    // roster Cikawao sungguhan, bisa dipilih tamu saat booking, dan akan
    // menerima slip gaji; dia DIHAPUS PERMANEN dari database 2026-08-24
    // (Fase 13, Bug B) — tapi namanya tertinggal di sini sebagai
    // identitas cadangan. Diganti nama yang jelas-jelas contoh, supaya
    // tidak ada lagi orang fiktif yang bisa tersangka nyata.
    persona: { name: "Terapis Contoh", sub: "Mode demo \u00b7 tanpa login" },
    // UPDATE 2026-08-23 — reordered per user request:
    // 1) Jadwal Saya + Job Saya merged into one entry ("Jadwal & Job",
    //    still pointing at /therapist/shift — see that page's header
    //    comment; /therapist/jobs now just redirects there).
    // 2) Sesi Aktif moved into the main tab bar (first 4 = main tabs in
    //    MobileShell, rest overflow into "Lainnya"), swapped with
    //    Absensi GPS — attendance is already reachable from the Beranda
    //    dashboard card, so it moved into "Lainnya" instead.
    // UPDATE 2026-08-23 (later same day) — user asked for "Sesi" right
    // next to "Beranda", ahead of "Jadwal & Job" ("kolom sesi digeser
    // sebelah beranda baru jadwal") — reordered to Beranda -> Sesi Aktif
    // -> Jadwal & Job -> Notifikasi.
    // UPDATE 2026-08-23 (later still) — user: "tombol notifikasi di role
    // therapis ganti dengan absensi dan didalamnya juga ada pengajuan
    // libur/cuti, logo gps diperkecil saja". The 4th main tab
    // (MobileShell renders def.nav.slice(0,4) as the tab bar) is now
    // Absensi (attendance + the new "Ajukan Cuti" form, see
    // TherapistLeaveRequestForm) instead of Notifikasi. Notification
    // access is NOT removed — /therapist's own headerRight already
    // carries a bell icon with the unread dot (app/therapist/page.tsx),
    // which is what the user picked when asked where notifications
    // should live now that they're off the tab bar. /therapist/shift's
    // badge (2) is unrelated and untouched. Absensi GPS moved out of
    // "Lainnya" into the main 4; Komisi Saya and Payslip & Tabungan now
    // overflow into "Lainnya" alongside Notifikasi (still reachable, not
    // deleted — its route and page are untouched).
    nav: [
      { href: "/therapist", label: "Beranda", icon: "home", section: "Harian" },
      { href: "/therapist/session", label: "Sesi Aktif", icon: "timer", section: "Harian" },
      { href: "/therapist/shift", label: "Jadwal & Job", icon: "calendar-days", section: "Harian" },
      { href: "/therapist/attendance", label: "Absensi", icon: "map-pin-check", section: "Harian" },
      { href: "/therapist/notifications", label: "Notifikasi", icon: "bell", section: "Penghasilan" },
      { href: "/therapist/commission", label: "Komisi Saya", icon: "percent", section: "Penghasilan" },
      { href: "/therapist/payslip", label: "Payslip & Tabungan", icon: "wallet", section: "Penghasilan" },
      // "Profil Saya" — added 2026-08-25, user: "profil terapis baru,
      // terapis juga harus bisa edit". Overflows into "Lainnya" (8th
      // item, tab bar only shows the first 4) — same as Komisi/Payslip.
      { href: "/therapist/profile", label: "Profil Saya", icon: "user-round", section: "Penghasilan" },
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
      { href: "/customer/promo", label: "Promo", icon: "ticket" },
      { href: "/customer/membership", label: "Membership", icon: "gem" },
      { href: "/customer/profile", label: "Profil", icon: "user-round" },
    ],
  },
];

export const roleByKey = (k: string) => ROLES.find((r) => r.key === k)!;
export const roleByPath = (p: string) => ROLES.find((r) => p.startsWith(r.base))!;
