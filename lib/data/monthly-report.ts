import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getTherapistPerformance, type TherapistPerformanceRow } from "@/lib/data/performance";
import {
  calculateOperatingProfit,
  calculateRoomUtilization,
  calculateSalaryAllowanceCost,
  getCommissionTotalForPeriod,
  assessConsumableUsage,
  buildWeeklyCashflow,
  buildWeeklyUsage,
  type UsageStatus,
  type WeeklyUsageRow,
  summarizeRevenueItems,
  type WeeklyCashflowRow,
  type RevenueCategoryKey,
  withOptionalProfit,
} from "@/lib/data/monthly-report-math";
import { addDaysIso, elapsedDays, previousWindow, reportWindow, reportWindowLabel, type ReportKind, type ReportWindow } from "@/lib/data/monthly-report-math";
export { reportWindow, reportWindowLabel } from "@/lib/data/monthly-report-math";
import { minutesBetween, nowIso, todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// 2026-10-23 (Adjie: "laporan harian, mingguan, bulanan"): mesin yang sama
// melayani tiga jenis periode. Semua perhitungan sudah berbasis rentang
// tanggal [start, endExcl); yang khas bulanan hanya payroll (slip payroll
// memang per bulan) — untuk harian/mingguan bagian itu diganti komisi
// periode & kehadiran, bukan ditampilkan "belum dihitung".
// ---------------------------------------------------------------------
export type { ReportKind } from "@/lib/data/monthly-report-math";
type Window = ReportWindow;

export type MonthlySummary = {
  revenue: number;
  /** Komisi terapis periode ini (payroll tersimpan bila bulanan & sudah dihitung, selain itu dari entri komisi). */
  commission: number;
  visits: number;
  averageTransaction: number;
  humanResourceCost: number | null;
  humanResourceCostPct: number | null;
  roomUtilizationPct: number | null;
  averageRating: number | null;
  returningCustomerPct: number | null;
};

export type RevenueReport = {
  byDay: { date: string; amount: number }[];
  byService: { name: string; quantity: number; amount: number; sharePct: number }[];
  addOnsAndProducts: { name: string; type: string; quantity: number; amount: number }[];
  byCategory: { key: RevenueCategoryKey; label: string; quantity: number; amount: number; sharePct: number }[];
  fnb: {
    amount: number;
    transactionsWithFnb: number;
    attachPct: number | null;
    averagePerTransaction: number | null;
    items: { name: string; quantity: number; amount: number; cost: number | null; grossProfit: number | null }[];
  };
  byPaymentMethod: { method: string; amount: number; transactions: number }[];
  promoDiscount: number;
  promoTransactions: number;
};

export type CustomerReport = {
  active: number;
  new: number;
  returning: number;
  noShow: number;
  cancelled: number;
  extendedSessions: number;
  visitHoursByWeekday: { weekday: number; hour: number; visits: number }[];
};

export type PayrollReport = {
  rows: {
    employeeId: string;
    employeeName: string;
    outletId: string;
    outletName: string;
    jobTitle: string | null;
    fixed: number;
    allowance: number;
    commission: number;
    otherEarnings: number;
    deductions: number;
    netPay: number;
    adjustments: { label: string; kind: string; amount: number }[];
  }[];
  totalEarnings: number;
  totalDeductions: number;
  totalNetPay: number;
};

export type TherapistReport = {
  employeeId: string;
  name: string;
  outletId: string;
  treatments: number;
  generatedRevenue: number;
  commission: number;
  averageRating: number | null;
  extendedSessionPct: number | null;
  lateCount: number;
  performanceScore: number | null;
  /** Hari hadir (absen GPS) / hari kerja yang seharusnya; null bila absensi belum dipakai. */
  presentDays: number;
  expectedDays: number;
  attendancePct: number | null;
  /** Jumlah ulasan pelanggan yang membentuk rating. */
  reviewCount: number;
  /** Cuti/libur/izin tercatat di periode. */
  leaveDays: number;
  /** Penilaian manajemen bulan itu (1–5), bila ada. */
  managementRating: number | null;
};

export type OperationsReport = {
  roomUtilization: { roomId: string; roomName: string; outletId: string; usedHours: number; utilizationPct: number | null }[];
  events: {
    roomAlerts: number;
    cancellationsUnderTwoHours: null;
    lowRatings: number;
    attendanceAnomalies: number;
  };
};

export type CostsReport = {
  expensesByCategory: { category: string; amount: number }[];
  pettyCash: {
    outletId: string;
    openingBalance: number | null;
    inflows: number;
    outflows: number;
    endingBalance: number | null;
  }[];
  materials: { quantity: number; cost: number | null }[];
  lowStockItems: { productId: string; name: string; outletId: string; quantity: number; minimum: number }[];
  /** Revenue vs variable costs per week of the month; fixed payroll shown separately. */
  weekly: WeeklyCashflowRow[];
  fixedPayroll: number | null;
};

export type InventoryReport = {
  /** Value (Rp) of stock movements in the period, per product category. */
  byCategory: {
    category: string;
    purchased: number;
    sold: number;
    usedInTreatment: number;
    transferNet: number;
    opnameVariance: number;
  }[];
  opnameVarianceTotal: number;
  /** Treatment consumables issued vs. what the guest count implies. */
  consumables: {
    productId: string;
    name: string;
    uom: string;
    issuedUnits: number;
    cost: number;
    guestsPerUnit: number | null;
    expectedUnits: number | null;
    variancePct: number | null;
    status: UsageStatus;
  }[];
  weeklyUsage: WeeklyUsageRow[];
  materialCostPerVisit: number | null;
  /** Value of stock on hand now (at print time), at cost price. */
  stockValueNow: number;
};

export type OutletReport = {
  outletId: string;
  outletName: string;
  revenue: number;
  visits: number;
  averageTransaction: number;
  humanResourceCostPct: number | null;
};

export type ProfitReport = {
  revenue: number;
  commission: number;
  payrollCost: number | null;
  expenses: number | null;
  materials: number | null;
  costOfGoodsSold: number | null;
  total: number | null;
  /** Pendapatan − komisi − pengeluaran − bahan − HPP (sebelum gaji tetap). Dipakai laporan harian/mingguan. */
  contributionBeforePayroll: number;
};

export type OutletProfitReport = OutletReport & {
  commission: number;
  payrollCost: number | null;
  expenses: number | null;
  materials: number | null;
  costOfGoodsSold: number | null;
  profit: number | null;
};

/** Satu titik tren: pendapatan & transaksi lunas per periode (2026-10-23). */
export type TrendPoint = {
  label: string;
  start: string;
  revenue: number;
  transactions: number;
  /** Periode yang sedang berjalan (belum tutup). */
  running: boolean;
  isCurrent: boolean;
};

export type MonthlyReport = {
  kind: ReportKind;
  /** Bulanan: 6 bulan · mingguan: 8 minggu · harian: 14 hari, terlama dulu, diakhiri periode ini. */
  trend: TrendPoint[];
  period: string;
  previousPeriod: string;
  /** "Oktober 2026" · "19–25 Okt 2026" · "Jumat, 23 Oktober 2026". */
  periodLabel: string;
  periodStart: string;
  /** Tanggal terakhir (inklusif). */
  periodEnd: string;
  status: "FINAL" | "SEMENTARA";
  /** What the comparison covers, e.g. "1–17 Sep 2026" while the month is running, else "Sep 2026". */
  comparisonLabel: string;
  /** Days 1..N compared when the current month is still running; null when whole months are compared. */
  comparisonDays: number | null;
  summary: { current: MonthlySummary; previous: MonthlySummary };
  revenue: { current: RevenueReport; previous: RevenueReport };
  customers: { current: CustomerReport; previous: CustomerReport };
  payroll: { current: PayrollReport | null; previous: PayrollReport | null };
  therapists: { current: TherapistReport[]; previous: TherapistReport[] };
  operations: { current: OperationsReport; previous: OperationsReport };
  costs: { current: CostsReport; previous: CostsReport };
  inventory: { current: InventoryReport; previous: InventoryReport };
  payrollMissingOutlets: { current: string[]; previous: string[] };
  perOutlet?: { current: OutletReport[]; previous: OutletReport[] };
  profit?: {
    current: ProfitReport;
    previous: ProfitReport;
    perOutlet: { current: OutletProfitReport[]; previous: OutletProfitReport[] };
  };
};

type OutletRow = { id: string; name: string; open_hours: string | null };
type TransactionRow = {
  id: string; outlet_id: string; booking_id: string | null; customer_id: string | null;
  discount: number | string; total: number | string; payment_method: string | null; paid_at: string | null;
};
type TransactionItemRow = {
  transaction_id: string; item_type: string; name: string; qty: number | string;
  unit_price: number | string; therapist_id: string | null;
};
type BookingRow = {
  id: string; outlet_id: string; customer_id: string; therapist_id: string | null;
  room_id: string | null; date: string; status: string;
};
type SessionRow = {
  booking_id: string; outlet_id: string; therapist_id: string | null; room_id: string | null;
  actual_start: string | null; expected_end: string | null; actual_end: string | null;
  extension_minutes: number | null; status: string;
};
type CommissionRow = { outlet_id: string; therapist_id: string; amount: number | string; status: string; date: string };
type ReviewRow = { employee_id: string; outlet_id: string; visit_date: string; rating: number };
type AttendanceRow = { employee_id: string; outlet_id: string; status: string; late_minutes: number | null };
type EmployeeRow = { id: string; outlet_id: string; name: string; job_role: string | null; is_therapist: boolean };
type RoomRow = { id: string; outlet_id: string; name: string; status: string };
type ExpenseRow = { outlet_id: string; date: string; category: string; amount: number | string; status: string };
type PayrollItemRow = {
  id: string; employee_id: string; outlet_id: string; period: string;
  fixed: number | string; allowance: number | string; variable: number | string;
  bonus: number | string; thr: number | string; late_penalty: number | string;
  absence_penalty: number | string; savings: number | string; loan: number | string;
  other_deductions: number | string; net_pay: number | string;
};
type AdjustmentRow = {
  employee_id: string; outlet_id: string; period: string; label: string; kind: string; amount: number | string;
};
type RoomAlertRow = { outlet_id: string; created_at: string };
type StockMovementRow = { outlet_id: string; product_id: string; type: string; qty: number | string; unit_cost: number | string; posted_at: string };
type ProductRow = {
  id: string; name: string; min_stock: number | string; track_stock: boolean; cost_price: number | string | null;
  category?: string; uom?: string; guests_per_unit?: number | string | null;
};
type ProductStockRow = { product_id: string; outlet_id: string; qty: number | string };
type PettyCashRow = { outlet_id: string; balance: number | string };
type PettyCashMovementRow = { outlet_id: string; amount: number | string; at: string };

type ReportData = {
  outlets: OutletRow[];
  transactions: TransactionRow[];
  items: TransactionItemRow[];
  bookings: BookingRow[];
  historicBookings: BookingRow[];
  sessions: SessionRow[];
  commissions: CommissionRow[];
  reviews: ReviewRow[];
  attendance: AttendanceRow[];
  employees: EmployeeRow[];
  rooms: RoomRow[];
  expenses: ExpenseRow[];
  payrollItems: PayrollItemRow[];
  adjustments: AdjustmentRow[];
  alerts: RoomAlertRow[];
  movements: StockMovementRow[];
  products: ProductRow[];
  stocks: ProductStockRow[];
  pettyCash: PettyCashRow[];
  pettyCashMovements: PettyCashMovementRow[];
};

type QueryResult<T> = { data: T[] | null; error: unknown };

function paged<T>(query: (from: number, to: number) => PromiseLike<QueryResult<T>>) {
  return fetchAllRows<T>(async (from, to) => await query(from, to));
}

function n(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function inWindow(date: string, window: Window): boolean {
  return date >= window.start && date < window.endExcl;
}

function parseOperatingHours(value: string | null): number | null {
  const match = value?.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return end > start ? (end - start) / 60 : null;
}

async function fetchData(outletIds: string[], windows: [Window, Window]): Promise<ReportData> {
  const empty: ReportData = {
    outlets: [], transactions: [], items: [], bookings: [], historicBookings: [], sessions: [],
    commissions: [], reviews: [], attendance: [], employees: [], rooms: [], expenses: [], payrollItems: [],
    adjustments: [], alerts: [], movements: [], products: [], stocks: [], pettyCash: [], pettyCashMovements: [],
  };
  if (!outletIds.length) return empty;

  const supabase = await createClient();
  const start = windows[1].start;
  const endExcl = windows[0].endExcl;
  const timestampStart = `${start}T00:00:00+00:00`;
  const timestampEnd = `${endExcl}T00:00:00+00:00`;
  const [outlets, transactions, bookings, sessions, commissions, reviews, attendance, employees, rooms,
    expenses, payrollItems, adjustments, alerts, movements, products, stocks, pettyCash, cashMovements] = await Promise.all([
    paged<OutletRow>((from, to) => supabase.from("outlets").select("id, name, open_hours").in("id", outletIds).range(from, to)),
    paged<TransactionRow>((from, to) => supabase.from("transactions")
      .select("id, outlet_id, booking_id, customer_id, discount, total, payment_method, paid_at")
      .in("outlet_id", outletIds).eq("status", "PAID").gte("paid_at", timestampStart).lt("paid_at", timestampEnd)
      .order("paid_at").order("id").range(from, to)),
    paged<BookingRow>((from, to) => supabase.from("bookings")
      .select("id, outlet_id, customer_id, therapist_id, room_id, date, status")
      .in("outlet_id", outletIds).gte("date", start).lt("date", endExcl).order("date").order("id").range(from, to)),
    paged<SessionRow>((from, to) => supabase.from("sessions")
      .select("booking_id, outlet_id, therapist_id, room_id, actual_start, expected_end, actual_end, extension_minutes, status")
      .in("outlet_id", outletIds).gte("actual_start", timestampStart).lt("actual_start", timestampEnd)
      .order("actual_start").order("id").range(from, to)),
    paged<CommissionRow>((from, to) => supabase.from("commission_entries")
      .select("outlet_id, therapist_id, amount, status, date").in("outlet_id", outletIds)
      .gte("date", start).lt("date", endExcl).order("date").order("id").range(from, to)),
    paged<ReviewRow>((from, to) => supabase.from("customer_reviews")
      .select("employee_id, outlet_id, visit_date, rating").in("outlet_id", outletIds)
      .gte("visit_date", start).lt("visit_date", endExcl).order("visit_date").order("id").range(from, to)),
    paged<AttendanceRow>((from, to) => supabase.from("attendance_events")
      .select("employee_id, outlet_id, status, late_minutes").in("outlet_id", outletIds)
      .gte("date", start).lt("date", endExcl).order("date").order("id").range(from, to)),
    paged<EmployeeRow>((from, to) => supabase.from("employees")
      .select("id, outlet_id, name, job_role, is_therapist").in("outlet_id", outletIds).order("id").range(from, to)),
    paged<RoomRow>((from, to) => supabase.from("rooms")
      .select("id, outlet_id, name, status").in("outlet_id", outletIds).order("id").range(from, to)),
    paged<ExpenseRow>((from, to) => supabase.from("expenses")
      .select("outlet_id, date, category, amount, status").in("outlet_id", outletIds)
      .gte("date", start).lt("date", endExcl).order("date").order("id").range(from, to)),
    paged<PayrollItemRow>((from, to) => supabase.from("payroll_items")
      .select("id, employee_id, outlet_id, period, fixed, allowance, variable, bonus, thr, late_penalty, absence_penalty, savings, loan, other_deductions, net_pay")
      .in("outlet_id", outletIds).in("period", windows.map((window) => window.period)).order("period").order("id").range(from, to)),
    paged<AdjustmentRow>((from, to) => supabase.from("payroll_adjustments")
      .select("employee_id, outlet_id, period, label, kind, amount").in("outlet_id", outletIds)
      .in("period", windows.map((window) => window.period)).order("period").order("id").range(from, to)),
    paged<RoomAlertRow>((from, to) => supabase.from("room_alerts")
      .select("outlet_id, created_at").in("outlet_id", outletIds).gte("created_at", timestampStart).lt("created_at", timestampEnd)
      .order("created_at").order("id").range(from, to)),
    paged<StockMovementRow>((from, to) => supabase.from("stock_movements")
      .select("outlet_id, product_id, type, qty, unit_cost, posted_at").in("outlet_id", outletIds)
      .gte("posted_at", timestampStart).lt("posted_at", timestampEnd)
      .order("posted_at").order("id").range(from, to)),
    paged<ProductRow>((from, to) => supabase.from("products")
      // "*" (not a column list) so the report keeps working before and after
      // migration 0041 adds products.guests_per_unit.
      .select("*").order("id").range(from, to)),
    paged<ProductStockRow>((from, to) => supabase.from("product_stocks")
      .select("product_id, outlet_id, qty").in("outlet_id", outletIds).order("outlet_id").order("product_id").range(from, to)),
    paged<PettyCashRow>((from, to) => supabase.from("petty_cash")
      .select("outlet_id, balance").in("outlet_id", outletIds).order("outlet_id").range(from, to)),
    paged<PettyCashMovementRow>((from, to) => supabase.from("petty_cash_movements")
      .select("outlet_id, amount, at").in("outlet_id", outletIds).gte("at", `${windows[1].start}T00:00:00+00:00`)
      .lte("at", nowIso()).order("at").order("id").range(from, to)),
  ]);

  const results = [outlets, transactions, bookings, sessions, commissions, reviews, attendance, employees, rooms,
    expenses, payrollItems, adjustments, alerts, movements, products, stocks, pettyCash, cashMovements];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    const message = (failed.error as { message?: string }).message ?? String(failed.error);
    throw new Error(`Laporan bulanan gagal dimuat: ${message}`);
  }

  const currentBookings = bookings.rows;
  const customerIds = [...new Set(currentBookings.map((booking) => booking.customer_id))];
  const history = await Promise.all(Array.from({ length: Math.ceil(customerIds.length / 200) }, (_, index) => {
    const ids = customerIds.slice(index * 200, (index + 1) * 200);
    return paged<BookingRow>((from, to) => supabase.from("bookings")
      .select("id, outlet_id, customer_id, therapist_id, room_id, date, status")
      .in("customer_id", ids).lt("date", endExcl).order("date").order("id").range(from, to));
  }));
  const historyError = history.find((result) => result.error)?.error;
  if (historyError) {
    const message = (historyError as { message?: string }).message ?? String(historyError);
    throw new Error(`Riwayat customer laporan bulanan gagal dimuat: ${message}`);
  }

  const txIds = transactions.rows.map((row) => row.id);
  const itemChunks = await Promise.all(Array.from({ length: Math.ceil(txIds.length / 200) }, (_, index) => {
    const ids = txIds.slice(index * 200, (index + 1) * 200);
    return paged<TransactionItemRow>((from, to) => supabase.from("transaction_items")
      .select("transaction_id, item_type, name, qty, unit_price, therapist_id")
      .in("transaction_id", ids).order("id").range(from, to));
  }));
  const itemsError = itemChunks.find((result) => result.error)?.error;
  if (itemsError) {
    const message = (itemsError as { message?: string }).message ?? String(itemsError);
    throw new Error(`Rincian transaksi laporan bulanan gagal dimuat: ${message}`);
  }

  return {
    outlets: outlets.rows,
    transactions: transactions.rows,
    items: itemChunks.flatMap((result) => result.rows),
    bookings: currentBookings,
    historicBookings: history.flatMap((result) => result.rows),
    sessions: sessions.rows,
    commissions: commissions.rows,
    reviews: reviews.rows,
    attendance: attendance.rows,
    employees: employees.rows,
    rooms: rooms.rows,
    expenses: expenses.rows,
    payrollItems: payrollItems.rows,
    adjustments: adjustments.rows,
    alerts: alerts.rows,
    movements: movements.rows,
    products: products.rows,
    stocks: stocks.rows,
    pettyCash: pettyCash.rows,
    pettyCashMovements: cashMovements.rows,
  };
}

function payrollFor(data: ReportData, window: Window): PayrollReport | null {
  const payrollItems = data.payrollItems.filter((item) => item.period === window.period);
  if (!payrollItems.length) return null;
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const outletNames = new Map(data.outlets.map((outlet) => [outlet.id, outlet.name]));
  const adjustments = data.adjustments.filter((adjustment) => adjustment.period === window.period);
  const rows = payrollItems.map((item) => {
    const fixed = n(item.fixed);
    const allowance = n(item.allowance);
    const commission = n(item.variable);
    const otherEarnings = n(item.bonus) + n(item.thr);
    const deductions = n(item.late_penalty) + n(item.absence_penalty) + n(item.savings) + n(item.loan) + n(item.other_deductions);
    return {
      employeeId: item.employee_id,
      employeeName: employeeById.get(item.employee_id)?.name ?? "",
      outletId: item.outlet_id,
      outletName: outletNames.get(item.outlet_id) ?? "",
      jobTitle: employeeById.get(item.employee_id)?.job_role ?? null,
      fixed,
      allowance,
      commission,
      otherEarnings,
      deductions,
      netPay: n(item.net_pay),
      adjustments: adjustments.filter((line) => line.employee_id === item.employee_id && line.outlet_id === item.outlet_id)
        .map((line) => ({ label: line.label, kind: line.kind, amount: n(line.amount) })),
    };
  });
  return {
    rows,
    totalEarnings: rows.reduce((sum, row) => sum + row.fixed + row.allowance + row.commission + row.otherEarnings, 0),
    totalDeductions: rows.reduce((sum, row) => sum + row.deductions, 0),
    totalNetPay: rows.reduce((sum, row) => sum + row.netPay, 0),
  };
}

type BuiltReport = {
  summary: MonthlySummary;
  revenue: RevenueReport;
  customers: CustomerReport;
  payroll: PayrollReport | null;
  therapists: TherapistReport[];
  operations: OperationsReport;
  costs: CostsReport;
  inventory: InventoryReport;
  perOutlet: OutletReport[];
  profit?: ProfitReport;
  outletProfit?: OutletProfitReport[];
};

function buildReport(
  data: ReportData,
  window: Window,
  today: string,
  performanceRows: TherapistPerformanceRow[],
  includeProfit: boolean
): BuiltReport {
  const tx = data.transactions.filter((row) => row.paid_at && inWindow(row.paid_at.slice(0, 10), window));
  const bookings = data.bookings.filter((row) => inWindow(row.date, window));
  const sessions = data.sessions.filter((row) => row.actual_start && inWindow(row.actual_start.slice(0, 10), window));
  const txIds = new Set(tx.map((row) => row.id));
  const items = data.items.filter((item) => txIds.has(item.transaction_id));
  const completedOrPaidBookings = new Set([
    ...bookings.filter((booking) => booking.status === "PAID").map((booking) => booking.id),
    ...sessions.filter((session) => session.status === "COMPLETED").map((session) => session.booking_id),
  ]);
  const visitedBookings = bookings.filter((booking) => completedOrPaidBookings.has(booking.id));
  const visitsByCustomer = new Map<string, number>();
  for (const booking of visitedBookings) visitsByCustomer.set(booking.customer_id, (visitsByCustomer.get(booking.customer_id) ?? 0) + 1);
  const historicalFirstVisit = new Map<string, string>();
  for (const booking of data.historicBookings) {
    if (booking.status !== "PAID" && booking.status !== "COMPLETED") continue;
    const first = historicalFirstVisit.get(booking.customer_id);
    if (!first || booking.date < first) historicalFirstVisit.set(booking.customer_id, booking.date);
  }
  const newCustomers = [...visitsByCustomer.keys()].filter((id) => {
    const first = historicalFirstVisit.get(id);
    return first !== undefined && inWindow(first, window);
  }).length;
  const returningCustomers = [...visitsByCustomer.values()].filter((count) => count > 1).length;
  const revenue = tx.reduce((sum, row) => sum + n(row.total), 0);
  const promoTransactions = tx.filter((row) => n(row.discount) > 0);

  const byDay = new Map<string, number>();
  const byPayment = new Map<string, { amount: number; transactions: number }>();
  for (const transaction of tx) {
    if (!transaction.paid_at) continue;
    const day = transaction.paid_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + n(transaction.total));
    const method = transaction.payment_method ?? "Tidak diketahui";
    const payment = byPayment.get(method) ?? { amount: 0, transactions: 0 };
    payment.amount += n(transaction.total);
    payment.transactions += 1;
    byPayment.set(method, payment);
  }

  const services = new Map<string, { quantity: number; amount: number }>();
  const extras = new Map<string, { type: string; quantity: number; amount: number }>();
  const therapistRevenue = new Map<string, number>();
  for (const item of items) {
    const quantity = n(item.qty);
    const amount = quantity * n(item.unit_price);
    if (item.item_type === "SERVICE") {
      const service = services.get(item.name) ?? { quantity: 0, amount: 0 };
      service.quantity += quantity;
      service.amount += amount;
      services.set(item.name, service);
      if (item.therapist_id) therapistRevenue.set(item.therapist_id, (therapistRevenue.get(item.therapist_id) ?? 0) + amount);
    } else {
      const key = `${item.item_type}\0${item.name}`;
      const extra = extras.get(key) ?? { type: item.item_type, quantity: 0, amount: 0 };
      extra.quantity += quantity;
      extra.amount += amount;
      extras.set(key, extra);
    }
  }
  const visitHours = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== "COMPLETED" || !session.actual_start) continue;
    const weekday = new Date(`${session.actual_start.slice(0, 10)}T00:00:00Z`).getUTCDay();
    const hour = Number(session.actual_start.slice(11, 13));
    const key = `${weekday}:${hour}`;
    visitHours.set(key, (visitHours.get(key) ?? 0) + 1);
  }
  const customers: CustomerReport = {
    active: visitsByCustomer.size,
    new: newCustomers,
    returning: returningCustomers,
    noShow: bookings.filter((booking) => booking.status === "NO_SHOW").length,
    cancelled: bookings.filter((booking) => booking.status === "CANCELLED").length,
    extendedSessions: sessions.filter((session) => n(session.extension_minutes) > 0).length,
    visitHoursByWeekday: [...visitHours.entries()].map(([key, count]) => {
      const [weekday, hour] = key.split(":").map(Number);
      return { weekday, hour, visits: count };
    }).sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
  };

  const payroll = payrollFor(data, window);
  const periodCommissionRows = data.commissions.filter((row) =>
    row.status !== "REVERSED" && inWindow(row.date, window));
  // A partial window (same dates last month) cannot use the stored monthly
  // payroll's commission column — that covers the whole month — so it
  // falls back to commission entries dated inside the window.
  const payrollRowsForPeriod = data.payrollItems
    .filter((row) => row.period === window.period && !window.partialDays)
    .map((row) => ({ outletId: row.outlet_id, period: row.period, variable: n(row.variable) }));
  const commissionTotalForOutlet = (outletId: string) => getCommissionTotalForPeriod(
    outletId,
    window.period,
    payrollRowsForPeriod,
    periodCommissionRows.map((row) => ({
      outletId: row.outlet_id,
      date: row.date,
      amount: n(row.amount),
      status: row.status,
    }))
  );
  const commissionByOutlet = new Map(data.outlets.map((outlet) => [outlet.id, commissionTotalForOutlet(outlet.id)]));
  const commissionTotal = [...commissionByOutlet.values()].reduce((sum, amount) => sum + amount, 0);
  const payrollOutletIds = new Set(payrollRowsForPeriod.map((row) => row.outletId));
  const payrollCost = data.outlets.length > 0 && data.outlets.every((outlet) => payrollOutletIds.has(outlet.id))
    ? data.outlets.reduce((total, outlet) => {
      const outletPayrollRows = payroll?.rows.filter((row) => row.outletId === outlet.id) ?? [];
      return total + outletPayrollRows.reduce((sum, row) => sum
        + calculateSalaryAllowanceCost(row.fixed, row.allowance, row.deductions), 0);
    }, 0)
    : null;
  const humanResourceCost = payrollCost === null ? null : payrollCost + commissionTotal;
  const reviews = data.reviews.filter((review) => inWindow(review.visit_date, window));
  const averageRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;
  const expenseRows = data.expenses.filter((expense) =>
    expense.status !== "DRAFT" && expense.status !== "REJECTED" && inWindow(expense.date, window));
  const expensesByCategory = new Map<string, number>();
  for (const expense of expenseRows) {
    expensesByCategory.set(expense.category, (expensesByCategory.get(expense.category) ?? 0) + n(expense.amount));
  }
  const periodMovements = data.movements.filter((movement) => inWindow(movement.posted_at.slice(0, 10), window));
  // Treatment consumables used on guests vs. products sold over the counter:
  // the first is an operating cost, the second is cost of goods sold.
  const movements = periodMovements.filter((movement) => movement.type === "TREATMENT_USAGE" && n(movement.qty) < 0);
  const saleMovements = periodMovements.filter((movement) => movement.type === "SALE" && n(movement.qty) < 0);
  const materialCost = movements.reduce((sum, movement) => sum + Math.abs(n(movement.qty)) * n(movement.unit_cost), 0);
  const costOfGoodsSold = saleMovements.reduce((sum, movement) => sum + Math.abs(n(movement.qty)) * n(movement.unit_cost), 0);
  const revenueItems = summarizeRevenueItems(
    items.map((item) => ({
      transactionId: item.transaction_id,
      itemType: item.item_type,
      name: item.name,
      quantity: n(item.qty),
      amount: n(item.qty) * n(item.unit_price),
    })),
    tx.length,
    new Map(data.products.filter((product) => product.cost_price !== null)
      .map((product) => [product.name, n(product.cost_price as number | string)])),
    new Map(data.products.filter((product) => product.category).map((product) => [product.name, product.category as string]))
  );

  const operatingDays = elapsedDays(window, today);
  const hoursByOutlet = new Map(data.outlets.map((outlet) => [outlet.id, parseOperatingHours(outlet.open_hours)]));
  const activeRooms = data.rooms.filter((room) => room.status === "ACTIVE");
  const minutesByRoom = new Map<string, number>();
  for (const session of sessions) {
    if (!session.room_id || !session.actual_start) continue;
    const end = session.actual_end ?? (session.status === "ACTIVE" && session.expected_end
      ? session.expected_end < nowIso() ? session.expected_end : nowIso()
      : session.expected_end);
    if (end) minutesByRoom.set(session.room_id, (minutesByRoom.get(session.room_id) ?? 0)
      + Math.max(0, minutesBetween(session.actual_start, end)));
  }
  const roomUtilization = activeRooms.map((room) => {
    const roomCount = activeRooms.filter((candidate) => candidate.outlet_id === room.outlet_id).length;
    const usedMinutes = minutesByRoom.get(room.id) ?? 0;
    return {
      roomId: room.id,
      roomName: room.name,
      outletId: room.outlet_id,
      usedHours: usedMinutes / 60,
      utilizationPct: calculateRoomUtilization(usedMinutes, hoursByOutlet.get(room.outlet_id) ?? null, operatingDays, roomCount),
    };
  });
  const roomCapacityMinutes = data.outlets.reduce((sum, outlet) => sum
    + (hoursByOutlet.get(outlet.id) ?? 0) * 60 * operatingDays
    * activeRooms.filter((room) => room.outlet_id === outlet.id).length, 0);
  const usedMinutes = roomUtilization.reduce((sum, room) => sum + room.usedHours * 60, 0);
  const roomUtilizationPct = roomCapacityMinutes > 0 ? usedMinutes / roomCapacityMinutes * 100 : null;

  const outletReports: OutletReport[] = data.outlets.map((outlet) => {
    const outletTransactions = tx.filter((row) => row.outlet_id === outlet.id);
    const outletRevenue = outletTransactions.reduce((sum, row) => sum + n(row.total), 0);
    const outletItems = data.payrollItems.filter((row) => row.outlet_id === outlet.id && row.period === window.period);
    const outletPayroll = outletItems.length ? outletItems.reduce((sum, row) => sum
      + calculateSalaryAllowanceCost(
        n(row.fixed),
        n(row.allowance),
        n(row.late_penalty) + n(row.absence_penalty) + n(row.savings) + n(row.loan) + n(row.other_deductions)
      ), 0) : null;
    const outletCommission = commissionByOutlet.get(outlet.id) ?? 0;
    const outletHrCost = outletPayroll === null ? null : outletPayroll + outletCommission;
    const outletVisits = new Set(visitedBookings.filter((booking) => booking.outlet_id === outlet.id).map((booking) => booking.id)).size;
    return {
      outletId: outlet.id,
      outletName: outlet.name,
      revenue: outletRevenue,
      visits: outletVisits,
      averageTransaction: outletTransactions.length ? outletRevenue / outletTransactions.length : 0,
      humanResourceCostPct: outletHrCost !== null && outletRevenue > 0 ? outletHrCost / outletRevenue * 100 : null,
    };
  });

  const employees = new Map(data.employees.filter((employee) => employee.is_therapist).map((employee) => [employee.id, employee]));
  const therapistRows: TherapistReport[] = performanceRows
    .filter((performance) => employees.has(performance.id))
    .map((performance) => {
      const employee = employees.get(performance.id)!;
      const therapistSessions = sessions.filter((session) => session.therapist_id === performance.id && session.status === "COMPLETED");
      const extendedSessions = therapistSessions.filter((session) => n(session.extension_minutes) > 0).length;
      return {
        employeeId: employee.id,
        name: performance.name,
        outletId: employee.outlet_id,
        treatments: therapistSessions.length,
        generatedRevenue: therapistRevenue.get(employee.id) ?? 0,
        commission: payrollRowsForPeriod.some((row) => row.outletId === employee.outlet_id)
          ? payroll?.rows.find((row) => row.employeeId === employee.id && row.outletId === employee.outlet_id)?.commission ?? 0
          : periodCommissionRows.filter((row) => row.therapist_id === employee.id)
            .reduce((sum, row) => sum + n(row.amount), 0),
        averageRating: performance.customerAvg,
        extendedSessionPct: therapistSessions.length ? extendedSessions / therapistSessions.length * 100 : null,
        lateCount: performance.lateCount,
        performanceScore: performance.performanceScore ?? null,
        presentDays: performance.presentDays,
        expectedDays: performance.expectedDays,
        attendancePct: performance.attendancePct,
        reviewCount: performance.customerCount,
        leaveDays: performance.leaveSick + performance.leaveOff,
        managementRating: performance.management?.rating ?? null,
      };
    });

  const pettyCash = data.outlets.map((outlet) => {
    const balance = data.pettyCash.find((row) => row.outlet_id === outlet.id);
    const movementsForOutlet = data.pettyCashMovements.filter((movement) => movement.outlet_id === outlet.id);
    const inWindow = movementsForOutlet.filter((movement) => inWindowDate(movement.at, window));
    const afterEnd = movementsForOutlet.filter((movement) => movement.at.slice(0, 10) >= window.endExcl);
    const endingBalance = balance
      ? n(balance.balance) - afterEnd.reduce((sum, movement) => sum + n(movement.amount), 0)
      : null;
    const netChange = inWindow.reduce((sum, movement) => sum + n(movement.amount), 0);
    return {
      outletId: outlet.id,
      openingBalance: endingBalance === null ? null : endingBalance - netChange,
      inflows: inWindow.filter((movement) => n(movement.amount) > 0).reduce((sum, movement) => sum + n(movement.amount), 0),
      outflows: Math.abs(inWindow.filter((movement) => n(movement.amount) < 0).reduce((sum, movement) => sum + n(movement.amount), 0)),
      endingBalance,
    };
  });

  const lowStockItems = data.stocks.flatMap((stock) => {
    const product = data.products.find((item) => item.id === stock.product_id);
    return product && product.track_stock && n(stock.qty) < n(product.min_stock)
      ? [{ productId: product.id, name: product.name, outletId: stock.outlet_id, quantity: n(stock.qty), minimum: n(product.min_stock) }]
      : [];
  });
  const summary: MonthlySummary = {
    revenue,
    commission: commissionTotal,
    visits: completedOrPaidBookings.size,
    averageTransaction: tx.length ? revenue / tx.length : 0,
    humanResourceCost,
    humanResourceCostPct: humanResourceCost !== null && revenue > 0 ? humanResourceCost / revenue * 100 : null,
    roomUtilizationPct,
    averageRating,
    returningCustomerPct: visitsByCustomer.size ? returningCustomers / visitsByCustomer.size * 100 : null,
  };
  const operations: OperationsReport = {
    roomUtilization,
    events: {
      roomAlerts: data.alerts.filter((alert) => inWindow(alert.created_at.slice(0, 10), window)).length,
      // bookings has no cancellation timestamp, so sub-two-hour cancellation cannot be measured accurately.
      cancellationsUnderTwoHours: null,
      lowRatings: reviews.filter((review) => review.rating <= 2).length,
      attendanceAnomalies: data.attendance.filter((row) => row.status === "SUSPICIOUS").length,
    },
  };
  const costs: CostsReport = {
    expensesByCategory: [...expensesByCategory.entries()].map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    pettyCash,
    materials: [{
      quantity: movements.reduce((sum, movement) => sum + Math.abs(n(movement.qty)), 0),
      cost: materialCost,
    }],
    lowStockItems,
    weekly: buildWeeklyCashflow(window.start, window.days, [...byDay.entries()].map(([date, amount]) => ({ date, amount })), [
      ...periodCommissionRows.map((row) => ({ date: row.date, kind: "commission" as const, amount: n(row.amount) })),
      ...expenseRows.map((row) => ({ date: row.date, kind: "expenses" as const, amount: n(row.amount) })),
      ...[...movements, ...saleMovements].map((row) => ({
        date: row.posted_at.slice(0, 10),
        kind: "materials" as const,
        amount: Math.abs(n(row.qty)) * n(row.unit_cost),
      })),
    ], window.kind === "month" ? 7 : 1).filter((row) => row.start <= today),
    fixedPayroll: payrollCost,
  };
  const result: BuiltReport = {
    summary,
    revenue: {
      byDay: Array.from({ length: window.days }, (_, index) => {
        const date = new Date(`${window.start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + index);
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        return { date: key, amount: byDay.get(key) ?? 0 };
      }).filter((row) => row.date <= today),
      byService: [...services.entries()].map(([name, detail]) => ({
        name, ...detail, sharePct: revenue ? detail.amount / revenue * 100 : 0,
      })).sort((a, b) => b.amount - a.amount),
      addOnsAndProducts: [...extras.entries()].map(([key, detail]) => ({ name: key.split("\0")[1], ...detail }))
        .sort((a, b) => b.amount - a.amount),
      byCategory: revenueItems.byCategory,
      fnb: revenueItems.fnb,
      byPaymentMethod: [...byPayment.entries()].map(([method, detail]) => ({ method, ...detail }))
        .sort((a, b) => b.amount - a.amount),
      promoDiscount: promoTransactions.reduce((sum, row) => sum + n(row.discount), 0),
      promoTransactions: promoTransactions.length,
    },
    customers: {
      ...customers,
    },
    payroll,
    therapists: therapistRows,
    operations,
    costs,
    inventory: buildInventory(data, window, periodMovements, movements, visitedBookings),
    perOutlet: outletReports,
  };

  if (includeProfit) {
    const totalExpenses = expenseRows.reduce((sum, row) => sum + n(row.amount), 0);
    const profitTotal = payrollCost === null
      ? null
      : calculateOperatingProfit(revenue, commissionTotal, payrollCost, totalExpenses, materialCost, costOfGoodsSold);
    result.profit = {
      contributionBeforePayroll: revenue - commissionTotal - totalExpenses - materialCost - costOfGoodsSold,
      revenue,
      commission: commissionTotal,
      payrollCost,
      expenses: expenseRows.length ? totalExpenses : null,
      materials: movements.length ? materialCost : null,
      costOfGoodsSold: saleMovements.length ? costOfGoodsSold : null,
      total: profitTotal,
    };
    result.outletProfit = outletReports.map((outlet) => {
      const outletPayrollItems = data.payrollItems.filter((item) => item.outlet_id === outlet.outletId && item.period === window.period);
      const outletPayrollCost = outletPayrollItems.length ? outletPayrollItems.reduce((sum, row) => sum
        + calculateSalaryAllowanceCost(
          n(row.fixed),
          n(row.allowance),
          n(row.late_penalty) + n(row.absence_penalty) + n(row.savings) + n(row.loan) + n(row.other_deductions)
        ), 0) : null;
      const outletCommission = commissionByOutlet.get(outlet.outletId) ?? 0;
      const outletExpenseRows = expenseRows.filter((row) => row.outlet_id === outlet.outletId);
      const outletExpenses = outletExpenseRows.reduce((sum, row) => sum + n(row.amount), 0);
      const outletMovementRows = movements.filter((row) => row.outlet_id === outlet.outletId);
      const outletMaterials = outletMovementRows.reduce((sum, row) => sum + Math.abs(n(row.qty)) * n(row.unit_cost), 0);
      const outletSaleRows = saleMovements.filter((row) => row.outlet_id === outlet.outletId);
      const outletCostOfGoodsSold = outletSaleRows.reduce((sum, row) => sum + Math.abs(n(row.qty)) * n(row.unit_cost), 0);
      return {
        ...outlet,
        commission: outletCommission,
        payrollCost: outletPayrollCost,
        expenses: outletExpenseRows.length ? outletExpenses : null,
        materials: outletMovementRows.length ? outletMaterials : null,
        costOfGoodsSold: outletSaleRows.length ? outletCostOfGoodsSold : null,
        profit: outletPayrollCost === null
          ? null
          : calculateOperatingProfit(outlet.revenue, outletCommission, outletPayrollCost, outletExpenses, outletMaterials, outletCostOfGoodsSold),
      };
    });
  }
  return result;
}

function buildInventory(
  data: ReportData,
  window: Window,
  periodMovements: StockMovementRow[],
  treatmentMovements: StockMovementRow[],
  visitedBookings: BookingRow[]
): InventoryReport {
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const valueOf = (row: StockMovementRow) => n(row.qty) * n(row.unit_cost);
  const categories = new Map<string, InventoryReport["byCategory"][number]>();
  for (const row of periodMovements) {
    const category = productById.get(row.product_id)?.category ?? "Lainnya";
    const entry = categories.get(category)
      ?? { category, purchased: 0, sold: 0, usedInTreatment: 0, transferNet: 0, opnameVariance: 0 };
    const value = valueOf(row);
    if (row.type === "PURCHASE_RECEIPT") entry.purchased += value;
    else if (row.type === "RETURN_TO_SUPPLIER") entry.purchased += value;
    else if (row.type === "SALE") entry.sold += -value;
    else if (row.type === "TREATMENT_USAGE" || row.type === "WASTE_DAMAGE") entry.usedInTreatment += -value;
    else if (row.type === "TRANSFER_IN" || row.type === "TRANSFER_OUT") entry.transferNet += value;
    else if (row.type === "STOCK_OPNAME" || row.type === "ADJUSTMENT") entry.opnameVariance += value;
    categories.set(category, entry);
  }

  const visits = visitedBookings.length;
  const issued = new Map<string, { units: number; cost: number }>();
  for (const row of treatmentMovements) {
    const entry = issued.get(row.product_id) ?? { units: 0, cost: 0 };
    entry.units += Math.abs(n(row.qty));
    entry.cost += Math.abs(n(row.qty)) * n(row.unit_cost);
    issued.set(row.product_id, entry);
  }
  const consumableIds = new Set([
    ...issued.keys(),
    ...data.products
      .filter((product) => product.guests_per_unit !== null && product.guests_per_unit !== undefined && n(product.guests_per_unit) > 0)
      .map((product) => product.id),
  ]);
  const consumables = [...consumableIds].flatMap((productId) => {
    const product = productById.get(productId);
    if (!product) return [];
    const guestsPerUnit = product.guests_per_unit === null || product.guests_per_unit === undefined ? null : n(product.guests_per_unit);
    const used = issued.get(productId) ?? { units: 0, cost: 0 };
    return [{
      productId,
      name: product.name,
      uom: product.uom ?? "unit",
      issuedUnits: used.units,
      cost: used.cost,
      guestsPerUnit,
      ...assessConsumableUsage(used.units, visits, guestsPerUnit),
    }];
  }).sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));

  const materialTotal = treatmentMovements.reduce((sum, row) => sum + Math.abs(n(row.qty)) * n(row.unit_cost), 0);
  const stockValueNow = data.stocks.reduce((sum, stock) => {
    const product = productById.get(stock.product_id);
    return sum + (product ? n(stock.qty) * n(product.cost_price ?? 0) : 0);
  }, 0);

  return {
    byCategory: [...categories.values()].sort((a, b) => a.category.localeCompare(b.category)),
    opnameVarianceTotal: [...categories.values()].reduce((sum, row) => sum + row.opnameVariance, 0),
    consumables,
    weeklyUsage: buildWeeklyUsage(
      window.start,
      window.days,
      visitedBookings.map((booking) => booking.date),
      treatmentMovements.map((row) => ({ date: row.posted_at.slice(0, 10), amount: Math.abs(n(row.qty)) * n(row.unit_cost) })),
      window.kind === "month" ? 7 : 1
    ).filter((row) => row.start <= todayIsoDate()),
    materialCostPerVisit: visits && treatmentMovements.length ? materialTotal / visits : null,
    stockValueNow,
  };
}

function inWindowDate(timestamp: string, window: Window): boolean {
  return inWindow(timestamp.slice(0, 10), window);
}

const TREND_LENGTH: Record<ReportKind, number> = { month: 6, week: 8, day: 14 };
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const SHORT_DAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function trendLabel(window: Window): string {
  const [year, month, day] = window.start.split("-").map(Number);
  if (window.kind === "month") return `${SHORT_MONTH[month - 1]} ${String(year).slice(2)}`;
  if (window.kind === "week") return `${day} ${SHORT_MONTH[month - 1]}`;
  return `${SHORT_DAY[new Date(`${window.start}T00:00:00Z`).getUTCDay()]} ${day}`;
}

/** Tren ringan: hanya kolom total transaksi lunas per periode, dikueri paralel. */
async function fetchTrend(outletIds: string[], current: Window, today: string): Promise<TrendPoint[]> {
  if (!outletIds.length) return [];
  const windows: Window[] = [current];
  while (windows.length < TREND_LENGTH[current.kind]) windows.unshift(previousWindow(windows[0]));
  const supabase = await createClient();
  const tomorrow = addDaysIso(today, 1);
  return Promise.all(windows.map(async (window) => {
    const endExcl = window.endExcl < tomorrow ? window.endExcl : tomorrow;
    const base = { label: trendLabel(window), start: window.start, running: today >= window.start && today < window.endExcl, isCurrent: window === current };
    if (window.start >= endExcl) return { ...base, revenue: 0, transactions: 0 };
    const { rows } = await paged<{ total: number | string }>((from, to) => supabase.from("transactions")
      .select("total")
      .in("outlet_id", outletIds).eq("status", "PAID")
      .gte("paid_at", `${window.start}T00:00:00+00:00`).lt("paid_at", `${endExcl}T00:00:00+00:00`)
      .order("paid_at").order("id").range(from, to));
    return { ...base, revenue: rows.reduce((sum, row) => sum + n(row.total), 0), transactions: rows.length };
  }));
}

export async function getPeriodReport({
  outletIds,
  kind,
  anchor,
  includeProfit,
}: {
  outletIds: string[];
  kind: ReportKind;
  /** "YYYY-MM" untuk bulanan, "YYYY-MM-DD" (tanggal mana pun di periode) untuk harian/mingguan. */
  anchor: string;
  includeProfit: boolean;
}): Promise<MonthlyReport> {
  const current = reportWindow(kind, anchor);
  const fullPrevious = previousWindow(current);
  const uniqueOutletIds = [...new Set(outletIds)];
  const today = todayIsoDate();
  const [data, trend] = await Promise.all([
    fetchData(uniqueOutletIds, [current, fullPrevious]),
    fetchTrend(uniqueOutletIds, current, today),
  ]);
  // Periode berjalan dibanding periode penuh sebelumnya terbaca seperti
  // anjlok yang hanya karena kalender. Bandingkan hari yang sama:
  // 1–17 Okt vs 1–17 Sep; Sen–Kam minggu ini vs Sen–Kam minggu lalu.
  // Harian: hari ini vs kemarin apa adanya (status SEMENTARA).
  const running = today >= current.start && today < current.endExcl;
  const comparisonDays = running && kind !== "day"
    ? Math.min(elapsedDays(current, today), fullPrevious.days)
    : null;
  const previous: Window = comparisonDays === null
    ? fullPrevious
    : { ...fullPrevious, endExcl: addDaysIso(fullPrevious.start, comparisonDays), partialDays: comparisonDays };
  const comparisonLabel = reportWindowLabel(comparisonDays === null ? fullPrevious : { ...previous, kind: "day" === kind ? "day" : "week" });
  const performance = await Promise.all([current, previous].flatMap((window) =>
    data.outlets.map(async (outlet) => ({
      period: window.period,
      outletId: outlet.id,
      rows: await getTherapistPerformance(outlet.id, window.start.slice(0, 7), today,
        window.kind === "month" && !window.partialDays ? undefined : { start: window.start, endExcl: window.endExcl }),
    }))
  ));
  const getPerfRows = (window: Window) => performance
    .filter((entry) => entry.period === window.period)
    .flatMap((entry) => entry.rows);
  const currentReport = buildReport(data, current, today, getPerfRows(current), includeProfit);
  const previousReport = buildReport(data, previous, today, getPerfRows(previous), includeProfit);
  const monthly = kind === "month";
  const reportBase: Omit<MonthlyReport, "profit"> = {
    kind,
    trend,
    period: current.period,
    previousPeriod: previous.period,
    periodLabel: reportWindowLabel(current),
    periodStart: current.start,
    periodEnd: addDaysIso(current.endExcl, -1),
    status: today >= current.endExcl ? "FINAL" : "SEMENTARA",
    comparisonLabel,
    comparisonDays,
    summary: { current: currentReport.summary, previous: previousReport.summary },
    revenue: { current: currentReport.revenue, previous: previousReport.revenue },
    customers: { current: currentReport.customers, previous: previousReport.customers },
    payroll: { current: currentReport.payroll, previous: previousReport.payroll },
    therapists: { current: currentReport.therapists, previous: previousReport.therapists },
    operations: { current: currentReport.operations, previous: previousReport.operations },
    costs: { current: currentReport.costs, previous: previousReport.costs },
    inventory: { current: currentReport.inventory, previous: previousReport.inventory },
    // Payroll hanya relevan untuk laporan bulanan; harian/mingguan tidak
    // pernah menampilkan "payroll belum dihitung".
    payrollMissingOutlets: {
      current: monthly ? data.outlets
        .filter((outlet) => !data.payrollItems.some((item) => item.outlet_id === outlet.id && item.period === current.period))
        .map((outlet) => outlet.name) : [],
      previous: monthly ? data.outlets
        .filter((outlet) => !data.payrollItems.some((item) => item.outlet_id === outlet.id && item.period === previous.period))
        .map((outlet) => outlet.name) : [],
    },
  };
  if (uniqueOutletIds.length > 1) {
    reportBase.perOutlet = { current: currentReport.perOutlet, previous: previousReport.perOutlet };
  }
  return withOptionalProfit(reportBase, includeProfit, () => ({
    current: currentReport.profit!,
    previous: previousReport.profit!,
    perOutlet: {
      current: currentReport.outletProfit ?? [],
      previous: previousReport.outletProfit ?? [],
    },
  }));
}

/** Kompatibilitas: laporan bulanan lama. */
export async function getMonthlyReport({ outletIds, period, includeProfit }: { outletIds: string[]; period: string; includeProfit: boolean }) {
  return getPeriodReport({ outletIds, kind: "month", anchor: period, includeProfit });
}
