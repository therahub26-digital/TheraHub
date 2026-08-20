import type {
  ExpenseRec,
  CommissionEntry,
  PayrollItem,
  SavingsEntry,
  Approval,
  NotificationRec,
} from "../types";
import { makeRng, int, pick, chance, TODAY, CURRENT_PERIOD } from "./rng";
import { addDays } from "../format";
import { OUTLETS } from "./org";
import { EMPLOYEES, THERAPISTS } from "./people";
import { BOOKINGS } from "./ops";
import { packageById } from "./catalog";

export const EXPENSE_CATEGORIES = [
  { key: "rent", label: "Rent", example: "Sewa outlet", icon: "building" },
  { key: "utilities", label: "Utilities", example: "Listrik, air, internet", icon: "zap" },
  { key: "payroll", label: "Payroll", example: "Gaji dan allowance", icon: "wallet" },
  { key: "commission", label: "Commission", example: "Komisi terapis", icon: "percent" },
  { key: "consumables", label: "Consumables", example: "Oil, soap, tissue", icon: "droplet" },
  { key: "laundry", label: "Laundry", example: "Laundry linen/towel", icon: "shirt" },
  { key: "marketing", label: "Marketing", example: "Ads, promo, influencer", icon: "megaphone" },
  { key: "maintenance", label: "Maintenance", example: "Repair room/equipment", icon: "wrench" },
  { key: "petty", label: "Petty Cash", example: "Transport, ATK", icon: "coins" },
  { key: "other", label: "Other", example: "Kategori custom tenant", icon: "circle-ellipsis" },
];

const VENDORS: Record<string, string[]> = {
  rent: ["PT Properti Dago Utama", "CV Sewa Gedung Setiabudi"],
  utilities: ["PLN", "PDAM Tirtawening", "Biznet Home"],
  payroll: ["Internal Payroll"],
  commission: ["Internal Commission"],
  consumables: ["PT Aroma Nusantara", "CV Herbal Sejahtera"],
  laundry: ["Laundry Bersih Jaya", "CV Linen Bersih"],
  marketing: ["Meta Ads", "Influencer @bandungfoodies", "Percetakan Kreatif"],
  maintenance: ["CV Teknik Mandiri", "Service AC Sejuk"],
  petty: ["Kas Kecil Outlet"],
  other: ["Lain-lain"],
};

const AMOUNTS: Record<string, [number, number]> = {
  rent: [18_000_000, 32_000_000],
  utilities: [2_400_000, 6_800_000],
  payroll: [42_000_000, 78_000_000],
  commission: [18_000_000, 36_000_000],
  consumables: [1_200_000, 5_400_000],
  laundry: [2_100_000, 4_900_000],
  marketing: [1_500_000, 9_000_000],
  maintenance: [450_000, 6_200_000],
  petty: [80_000, 750_000],
  other: [300_000, 2_800_000],
};

export const EXPENSES: ExpenseRec[] = (() => {
  const r = makeRng(120_120);
  const out: ExpenseRec[] = [];
  for (let i = 0; i < 96; i++) {
    const cat = pick(r, EXPENSE_CATEGORIES);
    const o = pick(r, OUTLETS);
    const [lo, hi] = AMOUNTS[cat.key];
    const amount = Math.round(int(r, lo, hi) / 1000) * 1000;
    const date = addDays(TODAY, -int(r, 0, 46));
    const roll = r();
    out.push({
      id: `EXP-${3000 + i}`,
      outletId: o.id,
      date,
      category: cat.label,
      vendor: pick(r, VENDORS[cat.key]),
      amount,
      tax: Math.round(amount * 0.11),
      paymentMethod: cat.key === "petty" ? "Petty Cash" : pick(r, ["Cash", "Bank Transfer", "Card"] as const),
      description: `${cat.example} — periode ${date.slice(0, 7)}`,
      status: roll < 0.12 ? "SUBMITTED" : roll < 0.18 ? "DRAFT" : roll < 0.22 ? "REJECTED" : roll < 0.6 ? "APPROVED" : "PAID",
      submittedBy: pick(r, ["Sinta Maharani", "Yoga Saputra", "Ratna Kusumawati", "Sri Mulyani"]),
      attachment: chance(r, 0.72),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
})();

export const expensesOf = (outletId?: string) =>
  outletId ? EXPENSES.filter((e) => e.outletId === outletId) : EXPENSES;

export function expenseByCategory(outletId?: string, period = CURRENT_PERIOD) {
  const list = expensesOf(outletId).filter((e) => e.date.startsWith(period) && e.status !== "REJECTED" && e.status !== "DRAFT");
  const map: Record<string, number> = {};
  list.forEach((e) => (map[e.category] = (map[e.category] ?? 0) + e.amount));
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export const PETTY_CASH = [
  { id: "PC-001", outletId: "OUT-001", name: "Kas Kecil Dago", balance: 1_840_000, limit: 3_000_000, custodian: "Nurul Fadhilah", lastTopUp: "2026-08-12" },
  { id: "PC-002", outletId: "OUT-002", name: "Kas Kecil Setiabudi", balance: 620_000, limit: 2_000_000, custodian: "Citra Ayuningtyas", lastTopUp: "2026-08-05" },
  { id: "PC-003", outletId: "OUT-003", name: "Kas Kecil Pasteur", balance: 1_260_000, limit: 2_000_000, custodian: "Dimas Aryo", lastTopUp: "2026-08-15" },
];

// ------------------------------------------------------------- commission
export const COMMISSIONS: CommissionEntry[] = BOOKINGS.filter(
  (b) => b.status === "PAID" && b.date >= addDays(TODAY, -30),
).map((b, i) => {
  const r = makeRng(150_000 + i * 19);
  const pkg = packageById(b.packageId);
  const amount = pkg?.commissionValue ?? 40_000;
  const past = b.date < TODAY;
  return {
    id: `CMS-${20_000 + i}`,
    therapistId: b.therapistId,
    therapistName: b.therapistName,
    outletId: b.outletId,
    date: b.date,
    bookingCode: b.code,
    packageName: b.packageName,
    ruleSnapshot: `Fixed ${pkg?.durationMin ?? 60}m`,
    basisAmount: b.price,
    amount,
    status: !past
      ? "PENDING"
      : b.date < addDays(TODAY, -18)
        ? "PAID"
        : chance(r, 0.7)
          ? "APPROVED"
          : chance(r, 0.5)
            ? "INCLUDED_IN_PAYROLL"
            : "PENDING",
  };
});

export const commissionsOf = (therapistId: string) =>
  COMMISSIONS.filter((c) => c.therapistId === therapistId).sort((a, b) => (a.date < b.date ? 1 : -1));

export const commissionsOfOutlet = (outletId: string) => COMMISSIONS.filter((c) => c.outletId === outletId);

export const commissionLiability = (outletId?: string) =>
  COMMISSIONS.filter(
    (c) => (!outletId || c.outletId === outletId) && ["PENDING", "APPROVED", "INCLUDED_IN_PAYROLL"].includes(c.status),
  ).reduce((s, c) => s + c.amount, 0);

// ---------------------------------------------------------------- payroll
export const PAYROLL_PERIODS = ["2026-08", "2026-07", "2026-06", "2026-05"];

export const PAYROLL: PayrollItem[] = PAYROLL_PERIODS.flatMap((period, pi) =>
  EMPLOYEES.map((e, i) => {
    const r = makeRng(200_000 + pi * 977 + i * 31);
    const variable = e.isTherapist ? Math.round(int(r, 1_800_000, 5_600_000) / 1000) * 1000 : 0;
    const bonus = chance(r, 0.28) ? 500_000 : 0;
    const thr = period === "2026-05" ? e.baseSalary : 0;
    const latePenalty = Math.round(int(r, 0, 8) * 25_000);
    const absence = chance(r, 0.12) ? Math.round(e.baseSalary / 26) : 0;
    const savings = Math.round(int(r, 0, 4) * 125_000);
    const loan = chance(r, 0.14) ? int(r, 2, 8) * 250_000 : 0;
    const other = chance(r, 0.1) ? int(r, 1, 3) * 50_000 : 0;
    const net = e.baseSalary + e.fixedAllowance + variable + bonus + thr - latePenalty - absence - savings - loan - other;
    return {
      id: `PRI-${period}-${e.id}`,
      employeeId: e.id,
      employeeName: e.name,
      jobRole: e.jobRole,
      outletId: e.outletId,
      period,
      fixed: e.baseSalary,
      allowance: e.fixedAllowance,
      variable,
      bonus,
      thr,
      latePenalty,
      absencePenalty: absence,
      savings,
      loan,
      otherDeductions: other,
      netPay: net,
      status: pi === 0 ? "CALCULATED" : pi === 1 ? "APPROVED" : "PAID",
    };
  }),
);

export const payrollOf = (period: string, outletId?: string) =>
  PAYROLL.filter((p) => p.period === period && (!outletId || p.outletId === outletId));

export const payrollOfEmployee = (employeeId: string) =>
  PAYROLL.filter((p) => p.employeeId === employeeId).sort((a, b) => (a.period < b.period ? 1 : -1));

export const PAYROLL_RUNS = PAYROLL_PERIODS.map((period, i) => {
  const items = payrollOf(period);
  return {
    id: `RUN-${period}`,
    period,
    employees: items.length,
    gross: items.reduce((s, p) => s + p.fixed + p.allowance + p.variable + p.bonus + p.thr, 0),
    deductions: items.reduce((s, p) => s + p.latePenalty + p.absencePenalty + p.savings + p.loan + p.otherDeductions, 0),
    net: items.reduce((s, p) => s + p.netPay, 0),
    status: i === 0 ? "CALCULATED" : i === 1 ? "APPROVED" : "PAID",
    calculatedAt: `${period}-26T18:20`,
    approvedBy: i === 0 ? null : "Bpk. Hendra Wijaya",
  };
});

export const LATE_PENALTY_RULES = [
  { id: "LP-1", range: "1–15 menit", penalty: 25_000, note: "Potongan ringan" },
  { id: "LP-2", range: "16–30 menit", penalty: 50_000, note: "Potongan sedang" },
  { id: "LP-3", range: "> 30 menit", penalty: 100_000, note: "Potongan berat + catatan HR" },
];

export const SAVINGS: SavingsEntry[] = EMPLOYEES.flatMap((e, ei) => {
  const r = makeRng(300_000 + ei * 71);
  let balance = 0;
  const rows: SavingsEntry[] = [];
  for (let m = 0; m < 10; m++) {
    const amount = int(r, 1, 4) * 125_000;
    balance += amount;
    rows.push({
      id: `SVG-${ei}-${m}`,
      employeeId: e.id,
      date: `2026-${String(Math.max(1, 8 - m)).padStart(2, "0")}-26`,
      type: "DEPOSIT",
      amount,
      balanceAfter: balance,
      ref: `Payroll ${String(Math.max(1, 8 - m)).padStart(2, "0")}/2026`,
    });
    if (chance(r, 0.18)) {
      const w = int(r, 1, 3) * 250_000;
      balance = Math.max(0, balance - w);
      rows.push({
        id: `SVG-${ei}-${m}-w`,
        employeeId: e.id,
        date: `2026-${String(Math.max(1, 8 - m)).padStart(2, "0")}-28`,
        type: "WITHDRAWAL",
        amount: -w,
        balanceAfter: balance,
        ref: "Penarikan disetujui Owner",
      });
    }
  }
  return rows.reverse();
});

export const savingsOf = (employeeId: string) => SAVINGS.filter((s) => s.employeeId === employeeId);

export const savingsLiability = SAVINGS.reduce((acc, s) => {
  acc[s.employeeId] = s.balanceAfter;
  return acc;
}, {} as Record<string, number>);

export const THR_ACCRUALS = EMPLOYEES.slice(0, 24).map((e, i) => {
  const r = makeRng(400_000 + i * 13);
  const months = int(r, 6, 12);
  return {
    id: `THR-${e.id}`,
    employeeId: e.id,
    employeeName: e.name,
    outletId: e.outletId,
    eligibleMonths: months,
    basis: e.baseSalary,
    accrued: Math.round((e.baseSalary * months) / 12),
    effectiveDate: "2027-03-20",
    status: months >= 12 ? "ELIGIBLE_FULL" : "PRORATA",
  };
});

// ---------------------------------------------------------------- approvals
export const APPROVALS: Approval[] = [
  { id: "APV-1201", type: "Payroll", title: "Payroll Agustus 2026 — 39 karyawan", amount: 214_800_000, requestedBy: "Sistem Payroll", outletId: "OUT-001", requestedAt: "2026-08-18T09:00", priority: "high", detail: "Gross Rp268,4jt · potongan Rp53,6jt. Menunggu review Owner sebelum publish payslip." },
  { id: "APV-1202", type: "Expense", title: "Sewa outlet Dago — Agustus", amount: 28_500_000, requestedBy: "Sinta Maharani", outletId: "OUT-001", requestedAt: "2026-08-17T16:22", priority: "high", detail: "Invoice PT Properti Dago Utama, jatuh tempo 25 Agustus." },
  { id: "APV-1203", type: "Refund", title: "Refund parsial DGO/2608/1021", amount: 120_000, requestedBy: "Nurul Fadhilah", outletId: "OUT-001", requestedAt: "2026-08-18T13:40", priority: "medium", detail: "Komplain durasi treatment kurang 12 menit. Reversal komisi terapis otomatis." },
  { id: "APV-1204", type: "Stock Adjustment", title: "Adjustment -6 disposable sheet", amount: null, requestedBy: "Sinta Maharani", outletId: "OUT-001", requestedAt: "2026-08-18T11:05", priority: "low", detail: "Selisih opname 15 Agustus, kategori Treatment Consumable." },
  { id: "APV-1205", type: "Attendance", title: "Review absensi SUSPICIOUS — 3 event", amount: null, requestedBy: "Sistem Attendance", outletId: "OUT-002", requestedAt: "2026-08-18T08:12", priority: "high", detail: "Mock location indicator terdeteksi pada 2 terapis, 1 akurasi GPS di atas threshold." },
  { id: "APV-1206", type: "Discount", title: "Manual discount 20% di atas policy", amount: 84_000, requestedBy: "Bayu Ramadhan", outletId: "OUT-001", requestedAt: "2026-08-18T14:33", priority: "medium", detail: "Alasan: kompensasi keterlambatan terapis 25 menit." },
  { id: "APV-1207", type: "Expense", title: "Marketing — Meta Ads Agustus", amount: 7_500_000, requestedBy: "Yoga Saputra", outletId: "OUT-002", requestedAt: "2026-08-16T10:44", priority: "medium", detail: "Campaign akuisisi customer baru, target 320 booking." },
  { id: "APV-1208", type: "Extension", title: "Extension +60 dengan room conflict", amount: 120_000, requestedBy: "Ayu Lestari", outletId: "OUT-001", requestedAt: "2026-08-18T15:02", priority: "high", detail: "Room Couple Suite A punya booking pukul 16:05. Perlu keputusan reassign." },
];

// ------------------------------------------------------------ notifications
export const NOTIFICATIONS: NotificationRec[] = [
  { id: "NTF-01", at: "2026-08-18T15:18", type: "session.ending_soon", title: "Sesi akan berakhir 10 menit lagi", body: "DGO-4231 · Ayu Lestari · Massage Room 02 · selesai 15:28.", channel: "Push", read: false, severity: "warning" },
  { id: "NTF-02", at: "2026-08-18T15:02", type: "extension.requested", title: "Permintaan extension +60", body: "Ayu Lestari meminta extension untuk DGO-4231. Terdeteksi room conflict.", channel: "In-app", read: false, severity: "danger" },
  { id: "NTF-03", at: "2026-08-18T14:47", type: "stock.low", title: "Stok menipis: Disposable Sheet", body: "Sisa 74 pcs dari minimum 200 pcs di outlet Dago.", channel: "In-app", read: false, severity: "warning" },
  { id: "NTF-04", at: "2026-08-18T14:12", type: "payment.received", title: "Pembayaran QRIS berhasil", body: "DGO/2608/1036 · Rp341.000 · Nurul Fadhilah.", channel: "Push", read: true, severity: "success" },
  { id: "NTF-05", at: "2026-08-18T13:38", type: "print.failed", title: "Print job gagal", body: "DGO/2608/1033 gagal dicetak — printer tidak merespons. Retry berhasil.", channel: "In-app", read: true, severity: "danger" },
  { id: "NTF-06", at: "2026-08-18T11:26", type: "booking.created", title: "Booking baru dari Customer App", body: "Traditional Massage 90 · 18 Agu 17:00 · Melati Puspita.", channel: "WA", read: true, severity: "info" },
  { id: "NTF-07", at: "2026-08-18T10:05", type: "attendance.suspicious", title: "Absensi mencurigakan", body: "2 event di outlet Setiabudi menunggu review manager.", channel: "In-app", read: true, severity: "warning" },
  { id: "NTF-08", at: "2026-08-18T09:00", type: "payroll.calculated", title: "Payroll Agustus selesai dihitung", body: "39 karyawan · net Rp214,8jt · menunggu approval Owner.", channel: "In-app", read: true, severity: "info" },
  { id: "NTF-09", at: "2026-08-17T22:10", type: "cashier.closing", title: "Closing kasir variance -Rp15.000", body: "Bayu Ramadhan · shift 17 Agustus · perlu konfirmasi.", channel: "In-app", read: true, severity: "warning" },
  { id: "NTF-10", at: "2026-08-17T18:33", type: "membership.upgraded", title: "Customer naik ke Gold", body: "Andini Kusuma mencapai 30 kunjungan.", channel: "In-app", read: true, severity: "success" },
];

export const THERAPIST_NOTIFICATIONS: NotificationRec[] = [
  { id: "TNF-01", at: "2026-08-18T15:10", type: "job.assigned", title: "Job baru ditugaskan", body: "Traditional Massage 90 · 16:00 · Massage Room 02 · Rani Halim.", channel: "Push", read: false, severity: "info" },
  { id: "TNF-02", at: "2026-08-18T15:05", type: "extension.approved", title: "Extension +30 disetujui", body: "Sesi DGO-4231 diperpanjang. Selesai baru: 15:55.", channel: "Push", read: false, severity: "success" },
  { id: "TNF-03", at: "2026-08-18T09:58", type: "attendance.ok", title: "Check-in tercatat", body: "09:58 · GPS valid · 12 m dari titik outlet.", channel: "In-app", read: true, severity: "success" },
  { id: "TNF-04", at: "2026-08-17T20:15", type: "commission.approved", title: "Komisi disetujui", body: "6 entri komisi periode 11–17 Agustus disetujui manager.", channel: "In-app", read: true, severity: "success" },
  { id: "TNF-05", at: "2026-08-16T08:00", type: "shift.changed", title: "Perubahan shift", body: "Shift 20 Agustus berubah menjadi 12:00–20:00.", channel: "Push", read: true, severity: "warning" },
];

// ------------------------------------------------------------ profitability
export function outletPnl(outletId: string, period = CURRENT_PERIOD) {
  const r = makeRng(500_000 + outletId.charCodeAt(6));
  const idx = OUTLETS.findIndex((o) => o.id === outletId);
  const revenue = [486_400_000, 331_200_000, 254_900_000][idx] ?? 300_000_000;
  const cogs = Math.round(revenue * (0.082 + r() * 0.02));
  const commission = Math.round(revenue * (0.19 + r() * 0.03));
  const payrollCost = Math.round(revenue * (0.21 + r() * 0.03));
  const opex = expensesOf(outletId)
    .filter((e) => e.date.startsWith(period) && !["Payroll", "Commission"].includes(e.category) && e.status !== "REJECTED" && e.status !== "DRAFT")
    .reduce((s, e) => s + e.amount, 0);
  const grossMargin = revenue - cogs;
  const operatingProfit = grossMargin - commission - payrollCost - opex;
  return {
    outletId,
    revenue,
    cogs,
    grossMargin,
    commission,
    payroll: payrollCost,
    opex,
    operatingProfit,
    margin: (operatingProfit / revenue) * 100,
  };
}

export const CONSOLIDATED_PNL = OUTLETS.map((o) => outletPnl(o.id));

export const TENANT_PNL = CONSOLIDATED_PNL.reduce(
  (acc, p) => ({
    revenue: acc.revenue + p.revenue,
    cogs: acc.cogs + p.cogs,
    grossMargin: acc.grossMargin + p.grossMargin,
    commission: acc.commission + p.commission,
    payroll: acc.payroll + p.payroll,
    opex: acc.opex + p.opex,
    operatingProfit: acc.operatingProfit + p.operatingProfit,
  }),
  { revenue: 0, cogs: 0, grossMargin: 0, commission: 0, payroll: 0, opex: 0, operatingProfit: 0 },
);

export const MONTHLY_TREND = (() => {
  const r = makeRng(600_000);
  const months = ["Mar", "Apr", "Mei", "Jun", "Jul", "Agu"];
  let rev = 820_000_000;
  return months.map((m) => {
    rev = Math.round(rev * (1 + 0.015 + r() * 0.055));
    const profit = Math.round(rev * (0.17 + r() * 0.09));
    return { month: m, revenue: rev, profit, expense: rev - profit };
  });
})();

export const THERAPIST_RANKING = THERAPISTS.map((t) => ({
  id: t.id,
  name: t.name,
  outletId: t.outletId,
  grade: t.therapistGrade!,
  guests: t.guestCount!,
  minutes: t.treatmentMinutes!,
  revenue: t.revenueGenerated!,
  commission: t.commissionMTD!,
  utilization: t.utilization!,
  rating: t.rating!,
  requested: t.requestedCount!,
  avatarTone: t.avatarTone,
})).sort((a, b) => b.revenue - a.revenue);
