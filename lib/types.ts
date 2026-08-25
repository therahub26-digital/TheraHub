// ============================================================
// TheraHub — Domain Types (Blueprint V2.0)
// ============================================================

export type Role =
  | "super-admin"
  | "admin"
  | "owner"
  | "manager"
  | "kasir"
  | "therapist"
  | "customer";

export type PlanKey = "starter" | "professional" | "business" | "enterprise";

export type ModuleKey =
  | "core"
  | "hr"
  | "attendance"
  | "operations"
  | "pos"
  | "inventory"
  | "payroll"
  | "finance"
  | "crm"
  | "multi_outlet";

export interface Plan {
  key: PlanKey;
  name: string;
  target: string;
  pricePerOutlet: number;
  maxOutlets: number;
  maxUsers: number;
  maxTherapists: number;
  modules: ModuleKey[];
  features: string[];
}

export type SubscriptionStatus = "ACTIVE" | "TRIAL" | "GRACE" | "SUSPENDED" | "CHURNED";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalName: string;
  /** Brand accent preset key — dipilih tenant saat setup awal. */
  logoTone: string;
  /** Background preset key — juga dipilih tenant saat setup awal. */
  bgTone: string;
  plan: PlanKey;
  status: SubscriptionStatus;
  timezone: string;
  currency: string;
  createdAt: string;
  renewalAt: string;
  mrr: number;
  outletCount: number;
  userCount: number;
  therapistCount: number;
  modules: Record<ModuleKey, boolean>;
  maxOutlets: number;
  adminEmail: string;
  city: string;
  healthScore: number;
  lastActiveAt: string;
}

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  scope: "platform" | "tenant" | "outlet";
  rollout: number;
  enabledTenants: string[];
  group: string;
}

export interface Outlet {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  lat: number;
  lng: number;
  geofenceRadius: number;
  accuracyThreshold: number;
  openHours: string;
  status: "ACTIVE" | "SETUP" | "INACTIVE";
  roomCount: number;
  therapistCount: number;
  managerName: string;
  /** "NONE" = kebijakan keterlambatan dimatikan — added 2026-08-24, user: kebijakan ini "sifatnya optional bisa on/off". */
  latePolicy: "FULL_DURATION" | "FIXED_SLOT" | "GRACE_PERIOD" | "NONE";
  gracePeriodMin: number;
  taxPct: number;
  serviceChargePct: number;
  /**
   * On/off per outlet — added 2026-08-24, user: "untuk kebijakan pajak,
   * service charge ... sifatnya optional bisa on/off tergantung masing2
   * outlet". Optional (defaults to true at every read site) so mock data
   * (lib/mock/org.ts) and any pre-migration outlet row don't need to change.
   */
  taxEnabled?: boolean;
  serviceChargeEnabled?: boolean;
  receiptPrefix: string;
  /** Deposit booking — dikonfigurasi per outlet. */
  deposit: DepositPolicy;
  /** Halaman profil publik outlet — dikonfigurasi Admin Tenant, dilihat calon tamu. */
  profile: OutletProfile;
  /**
   * URL suara alarm kustom yang diunggah manager outlet ini (Supabase
   * Storage bucket `alarm-sounds`) — dipakai components/SessionAlarm.tsx
   * di halaman sesi terapis saat waktu sesi habis. `null`/`undefined`
   * berarti pakai bunyi default (Web Audio beep bawaan). Optional supaya
   * data mock (lib/mock/org.ts) tidak perlu diubah — field ini cuma
   * relevan untuk outlet sungguhan.
   */
  alarmSoundUrl?: string | null;
  /**
   * Berapa hari ke depan (dari hari ini) tamu boleh booking lewat
   * Customer App — 0 = hanya hari-H (default, sama seperti perilaku
   * sebelum fitur ini ada), maksimal 3. Dikonfigurasi manager/admin di
   * Outlet Settings. Optional supaya data mock (lib/mock/org.ts) tidak
   * perlu diubah — default ke 0 lewat `?? 0` di titik pemakaian.
   */
  bookingWindowDays?: number;
}

/**
 * Halaman "profil" per outlet: lokasi, foto fasilitas, dan (opsional) profil
 * terapis unggulan. Dikonfigurasi oleh Admin Tenant di /admin/outlets, dan
 * ditampilkan ke customer sebagai halaman semacam "iklan" outlet — terutama
 * membantu tamu baru yang masih bingung memilih outlet.
 */
export interface OutletProfile {
  /** Ditampilkan/disembunyikan dari Customer App tanpa menghapus datanya. */
  published: boolean;
  tagline: string;
  description: string;
  /**
   * Foto hero/banner halaman profil, diunggah admin outlet.
   * Spesifikasi ukuran ada di `MEDIA_SPECS.cover` (lib/media.ts).
   * String kosong = belum ada foto; UI jatuh ke gradient brand.
   */
  cover: string;
  /**
   * Foto yang dipakai khusus untuk kartu ringkas outlet (mis. "Pilih
   * Outlet Favorit Anda" di beranda customer) — dipilih admin dari salah
   * satu foto yang sudah ada di Galeri Foto Fasilitas, terpisah dari
   * `cover`. String kosong = belum dipilih; titik pemakaian jatuh balik
   * ke `cover`. Kolom baru migrasi 0029.
   */
  profilePhotoUrl: string;
  /** Poin-poin singkat, mis. "Free parkir luas", "Ruang tunggu ber-AC". */
  highlights: string[];
  /**
   * `id` = primary key baris `outlet_facilities` di database. Optional
   * karena data mock (lib/mock/org.ts) tidak punya baris database sama
   * sekali — editor di /admin/outlets/[id]/profile hanya aktif kalau
   * datanya live (lihat isLiveOutletsData()), jadi ketiadaan id di mode
   * demo memang benar, bukan celah.
   */
  facilities: { id?: string; name: string; icon: string; desc: string }[];
  /** Foto fasilitas — spesifikasi di `MEDIA_SPECS.gallery` (lib/media.ts). `id` sama seperti di atas. */
  gallery: { id?: string; label: string; src: string }[];
}

/**
 * Kebijakan deposit booking. Setiap outlet menentukan sendiri apakah
 * deposit diwajibkan dan berapa nilainya (nominal rupiah atau persentase).
 */
export interface DepositPolicy {
  enabled: boolean;
  /** FIXED = nominal rupiah, PERCENT = persen dari harga layanan. */
  type: "FIXED" | "PERCENT";
  /** Rupiah bila FIXED, angka persen bila PERCENT. */
  value: number;
  /** Deposit hanya diminta bila estimasi total >= nilai ini (0 = selalu). */
  minTicket: number;
  /** Batas waktu bayar deposit sebelum booking otomatis batal (menit). */
  expiryMin: number;
  /** Deposit dikembalikan bila tamu batal sesuai kebijakan. */
  refundable: boolean;
  /** Sumber booking yang diwajibkan deposit. */
  appliesTo: ("Customer App" | "WhatsApp" | "Phone" | "Walk-in" | "Kasir")[];
  note: string;
}

export interface Room {
  id: string;
  outletId: string;
  code: string;
  name: string;
  type: "Massage" | "Couple" | "Reflexology Chair" | "VIP" | "Wet Room";
  capacity: number;
  supportedServices: string[];
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  cleanupBuffer: number;
}

export type JobRole = "Terapis" | "Kasir" | "Manager" | "Office Boy" | "Admin Umum" | "Supervisor";

export interface Employee {
  id: string;
  tenantId: string;
  outletId: string;
  code: string;
  name: string;
  jobRole: JobRole;
  grade: string;
  phone: string;
  email: string;
  joinDate: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  contractType: "Tetap" | "Kontrak" | "Harian";
  baseSalary: number;
  fixedAllowance: number;
  avatarTone: string;
  // therapist profile
  isTherapist: boolean;
  skills: string[];
  therapistGrade?: "Junior" | "Senior" | "Master";
  /** Real staff headshot path (e.g. "/img/therapists/CKW/amelia.jpg"). Undefined for mock/demo employees — UI falls back to the initials avatar. */
  photoUrl?: string;
  /**
   * Small photo album (max 3) shown on the therapist profile popup —
   * separate from `photoUrl` (the single avatar/headshot used everywhere
   * else). Empty array for mock/demo employees and real employees who
   * haven't had photos uploaded yet (components/EmployeePhotoGallery.tsx).
   */
  galleryUrls: string[];
  maxSessionsPerDay?: number;
  rating?: number;
  requestedCount?: number;
  utilization?: number;
  guestCount?: number;
  treatmentMinutes?: number;
  revenueGenerated?: number;
  commissionMTD?: number;
  savingsBalance?: number;
  shiftToday?: string;
  presence?: "AVAILABLE" | "IN_SESSION" | "BREAK" | "OFF" | "LATE" | "ABSENT";
  /** Dipromosikan Admin/Manager di halaman profil outlet — terapis baru/unggulan. */
  featured?: boolean;
  /** Badge singkat saat featured, mis. "Baru Bergabung", "Rating Tertinggi". */
  featuredBadge?: string;
  /** Bio singkat ditampilkan di halaman profil outlet saat featured. */
  bio?: string;
  /**
   * Referral: who recruited this employee, and the fee owed to that person
   * per treatment this employee does. Undefined/null = no referral
   * relationship configured — "belum diatur ≠ nol" — never read as a fee
   * of zero. Same fixed/percent shape as commission everywhere else in
   * this app. See supabase/migrations/0008_referral_fee.sql and
   * runPayroll() (lib/actions/payroll.ts) for how this turns into an
   * actual payslip line.
   */
  referredByEmployeeId?: string;
  referralFeeType?: "fixed" | "percent";
  referralFeeValue?: number;
}

export type AttendanceStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "LATE"
  | "ABSENT"
  | "SUSPICIOUS"
  | "VERIFIED";

export interface AttendanceEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  outletId: string;
  date: string;
  shift: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  distanceFromGeofence: number;
  deviceId: string;
  appVersion: string;
  locationStatus: "VALID" | "OUTSIDE" | "LOW_ACCURACY" | "SUSPICIOUS";
  lateMinutes: number;
  status: AttendanceStatus;
  note?: string;
}

export interface ServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  icon: string;
  description: string;
}

export interface ServiceType {
  id: string;
  categoryId: string;
  name: string;
  requiredSkill: string;
  description: string;
}

export interface ServicePackage {
  id: string;
  outletId: string;
  serviceTypeId: string;
  name: string;
  durationMin: number;
  listPrice: number;
  memberPrice: number;
  weekendPrice: number;
  roomType: string;
  requiredSkill: string;
  bufferBefore: number;
  bufferAfter: number;
  extensionAllowed: boolean;
  allowedExtensionIds: string[];
  commissionType: "fixed" | "percent";
  commissionValue: number;
  status: "ACTIVE" | "INACTIVE";
  popularity: number;
  materials: { name: string; qty: string }[];
}

export interface ExtensionOption {
  id: string;
  outletId: string;
  name: string;
  durationMin: number;
  price: number;
  /** Unit of `commission`: a rupiah amount, or a percentage of `price`. */
  commissionType: "fixed" | "percent";
  commission: number;
  active: boolean;
}

export interface AddOn {
  id: string;
  outletId: string;
  name: string;
  price: number;
  /** Unit of `commission`: a rupiah amount, or a percentage of `price`. */
  commissionType: "fixed" | "percent";
  commission: number;
  durationMin: number;
  active: boolean;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string;
  segment: "New" | "Active" | "VIP" | "Dormant";
  membership: "None" | "Silver" | "Gold" | "Platinum";
  visitCount: number;
  lifetimeSpend: number;
  avgTicket: number;
  firstVisit: string;
  lastVisit: string;
  favoriteTherapist: string;
  favoriteService: string;
  prepaidBalance: number;
  loyaltyPoints: number;
  marketingConsent: boolean;
  notes: string;
  avatarTone: string;
}

export type BookingStatus =
  | "DRAFT"
  | "BOOKED"
  | "CONFIRMED"
  | "ARRIVED"
  | "CHECKED_IN"
  | "IN_SESSION"
  | "COMPLETED"
  | "PAID"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

export interface Booking {
  id: string;
  code: string;
  outletId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  therapistId: string;
  therapistName: string;
  roomId: string;
  roomName: string;
  packageId: string;
  packageName: string;
  durationMin: number;
  price: number;
  date: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: BookingStatus;
  source: "Walk-in" | "Customer App" | "Kasir" | "WhatsApp" | "Phone";
  notes?: string;
  addOns: string[];
  createdAt: string;
}

export type SessionStatus = "NOT_STARTED" | "ACTIVE" | "ENDING_SOON" | "COMPLETED" | "VOID";

export interface SessionRec {
  id: string;
  bookingId: string;
  bookingCode: string;
  outletId: string;
  customerName: string;
  therapistId: string;
  therapistName: string;
  roomName: string;
  packageName: string;
  purchasedDurationMin: number;
  /**
   * Calendar day the treatment happened ("YYYY-MM-DD"). Needed because
   * `actualStart` is only a time-of-day string — without this, a
   * "sesi selesai hari ini" list would keep counting every completed
   * session ever recorded, growing forever. Mock data is all one day, so
   * this was previously implicit.
   */
  date: string;
  actualStart: string;
  expectedEnd: string;
  /**
   * Raw `expected_end` timestamp (this app's wall-clock-as-UTC convention,
   * see lib/wallclock.ts), unformatted — unlike `expectedEnd` above which
   * is already sliced down to "HH:mm" for display. components/SessionAlarm.tsx
   * needs the full timestamp client-side to run its own independent
   * countdown (the server-rendered `minutesRemaining` below is only a
   * snapshot as of page render, it doesn't tick). `null`/`undefined` for
   * the mock/demo viewer, which never wires up the alarm.
   */
  expectedEndIso?: string | null;
  actualEnd: string | null;
  extensionMinutes: number;
  /**
   * Whether the treatment has already been billed (its booking reached
   * PAID). A session's own status stays COMPLETED forever once the
   * therapist finishes — it says nothing about money — so the cashier's
   * "ready to bill" queue needs this separate flag, or an already-paid
   * guest keeps reappearing in the payment list after every refresh.
   */
  isPaid: boolean;
  status: SessionStatus;
  /**
   * Minutes remaining until expected_end, clamped to 0 — never negative.
   * Once a session runs past its expected end, this reads 0 forever and
   * can no longer tell "just wrapping up" apart from "forgotten for an
   * hour". Use overdueMin below for that distinction.
   */
  minutesRemaining: number;
  progressPct: number;
  /**
   * Minutes PAST expected_end for a still-ACTIVE session, unclamped —
   * 0 while on time or not yet due, growing without bound after that.
   * Session overrun rule (2026-08-23, user: "kalau tidak diclose
   * menggantung terus... kalau sudah lewat 10 menit alert ke kasir...
   * lewat 15 menit otomatis closed kalau tidak ada extend"): the kasir
   * screens use this to show an overdue banner at 10+, and
   * lib/data/sessionOverrunSweep.ts auto-completes the session at 15+
   * (unless a PENDING extension request exists — see that file's
   * header). By the time a page ever reads overdueMin >= 15 without a
   * pending request, the sweep that just ran ahead of this mapping
   * should already have closed it — a lingering high value here means
   * exactly that: a PENDING request is holding the session open.
   */
  overdueMin: number;
}

export interface ExtensionRequest {
  id: string;
  sessionId: string;
  bookingCode: string;
  therapistName: string;
  customerName: string;
  roomName: string;
  extensionId: string;
  extensionName: string;
  durationMin: number;
  price: number;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  conflictCheck: "CLEAR" | "ROOM_CONFLICT" | "THERAPIST_CONFLICT";
  reason?: string;
}

export type ItemType = "SERVICE" | "EXTENSION" | "ADD_ON" | "PRODUCT" | "FOOD" | "BEVERAGE";

/**
 * One treatment sitting in the cashier's "ready to bill" queue, with the
 * amount already owed for it (locked-in booking price + every approved
 * extension). Built by lib/data/pos.ts.
 *
 * Lives HERE rather than next to its query on purpose: components/PosCart.tsx
 * is a "use client" component and needs this shape, and lib/data/pos.ts pulls
 * in lib/supabase/server -> next/headers, which is server-only. Next bundles a
 * client component's whole import graph for the browser, so importing the type
 * from there would risk dragging a server module into the client build — the
 * same failure that took /manager/expenses down entirely in babak ketiga belas
 * (fixed then by splitting the shared constant into a client-safe file).
 * A type-only import is erased today, but keeping the shape in a file that has
 * no server imports at all means this can never regress into that bug.
 */
export type PayableExtension = { name: string; price: number };

export interface PayableSession {
  sessionId: string;
  bookingId: string;
  customerName: string;
  therapistName: string;
  roomName: string;
  packageName: string;
  packagePrice: number;
  extensions: PayableExtension[];
  /** packagePrice + every approved extension. Pre-discount, pre-tax. */
  baseTotal: number;
}

export interface TransactionItem {
  id: string;
  itemType: ItemType;
  name: string;
  qty: number;
  unitPrice: number;
  therapistName?: string;
}

export type PaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOID";

export interface Transaction {
  id: string;
  receiptNo: string;
  outletId: string;
  bookingCode: string | null;
  customerName: string;
  cashierName: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  discountReason?: string;
  tax: number;
  serviceCharge: number;
  total: number;
  paymentMethod: "Cash" | "QRIS" | "Debit Card" | "Credit Card" | "Transfer" | "E-Wallet" | "Split";
  status: PaymentStatus;
  paidAt: string;
  printedCount: number;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  category: "Retail Product" | "Food & Beverage" | "Treatment Consumable" | "Operational Supply" | "Reusable Asset";
  uom: string;
  costPrice: number;
  sellPrice: number | null;
  trackStock: boolean;
  stocks: Record<string, number>;
  minStock: number;
  usedThisMonth: number;
}

export type StockMovementType =
  | "PURCHASE_RECEIPT"
  | "SALE"
  | "TREATMENT_USAGE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "ADJUSTMENT"
  | "STOCK_OPNAME"
  | "RETURN_TO_SUPPLIER"
  | "WASTE_DAMAGE";

export interface StockMovement {
  id: string;
  outletId: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  qty: number;
  unitCost: number;
  refType: string;
  refId: string;
  postedAt: string;
  by: string;
}

export interface ExpenseRec {
  id: string;
  outletId: string;
  date: string;
  category: string;
  vendor: string;
  amount: number;
  tax: number;
  paymentMethod: "Cash" | "Bank Transfer" | "Petty Cash" | "Card";
  description: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  submittedBy: string;
  attachment: boolean;
}

export interface CommissionEntry {
  id: string;
  therapistId: string;
  therapistName: string;
  outletId: string;
  date: string;
  bookingCode: string;
  packageName: string;
  ruleSnapshot: string;
  basisAmount: number;
  amount: number;
  status: "PENDING" | "APPROVED" | "INCLUDED_IN_PAYROLL" | "PAID" | "ADJUSTED" | "REVERSED";
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  employeeName: string;
  jobRole: JobRole;
  outletId: string;
  period: string;
  fixed: number;
  allowance: number;
  variable: number;
  bonus: number;
  thr: number;
  latePenalty: number;
  absencePenalty: number;
  savings: number;
  loan: number;
  otherDeductions: number;
  netPay: number;
  status: "DRAFT" | "CALCULATED" | "REVIEWED" | "APPROVED" | "PUBLISHED" | "PAID";
}

export interface SavingsEntry {
  id: string;
  employeeId: string;
  date: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
  amount: number;
  balanceAfter: number;
  ref: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  scope: string;
  severity: "info" | "warning" | "critical";
  detail: string;
}

export interface NotificationRec {
  id: string;
  at: string;
  type: string;
  title: string;
  body: string;
  channel: "WA" | "Push" | "In-app" | "Email";
  read: boolean;
  severity: "info" | "success" | "warning" | "danger";
}

export interface Promotion {
  id: string;
  outletId: string;
  name: string;
  type: "Promo" | "Voucher" | "Prepaid Package" | "Membership" | "Loyalty";
  code?: string;
  value: string;
  /**
   * Structured rupiah discount, distinct from `value` (which is free-text
   * for display, e.g. "Rp30.000 untuk teman baru"). Undefined/null means
   * this promo has no programmatic redemption yet — it's catalog-only,
   * same "belum diatur ≠ nol" rule as commission fields. See
   * supabase/migrations/0009_referral_promo_and_extension_sale.sql and
   * payForSession() (lib/actions/transactions.ts).
   */
  discountAmount?: number;
  /** Redeemable only by a customer with zero prior PAID transactions. */
  newCustomersOnly: boolean;
  validFrom: string;
  validTo: string;
  usageCount: number;
  maxUsage: number | null;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
}

export interface Approval {
  id: string;
  type: "Expense" | "Payroll" | "Refund" | "Discount" | "Stock Adjustment" | "Extension" | "Attendance";
  title: string;
  amount: number | null;
  requestedBy: string;
  outletId: string;
  requestedAt: string;
  priority: "high" | "medium" | "low";
  detail: string;
}
