export type PerformanceScoreInput = {
  customerCount: number;
  maximumCustomerCount: number;
  customerRating: number | null;
  attendancePct: number | null;
  lateCount: number;
  expectedDays: number;
};

/**
 * Score favors customer volume while still considering service quality,
 * attendance, and punctuality. Missing dimensions are excluded and the
 * remaining weights are normalized rather than treated as zero.
 */
export function calculatePerformanceScore(input: PerformanceScoreInput): number | null {
  const dimensions: { score: number; weight: number }[] = [];

  if (input.maximumCustomerCount > 0) {
    dimensions.push({
      score: Math.min(100, Math.max(0, input.customerCount / input.maximumCustomerCount * 100)),
      weight: 40,
    });
  }
  if (input.customerRating !== null) {
    dimensions.push({ score: Math.min(100, Math.max(0, input.customerRating / 5 * 100)), weight: 25 });
  }
  if (input.attendancePct !== null) {
    dimensions.push({ score: Math.min(100, Math.max(0, input.attendancePct)), weight: 25 });
  }
  if (input.expectedDays > 0) {
    const punctuality = 100 * (1 - Math.min(input.expectedDays, input.lateCount) / input.expectedDays);
    dimensions.push({ score: Math.max(0, punctuality), weight: 10 });
  }

  const weight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (!weight) return null;
  return Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / weight);
}

/** Relative percentage change; null means there was no non-zero baseline. */
export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous) * 100;
}

export function percentagePointChange(current: number, previous: number): number {
  return current - previous;
}

/** Room occupancy percentage from occupied minutes and available room-hours. */
export function calculateRoomUtilization(
  usedMinutes: number,
  operatingHoursPerDay: number | null,
  operatingDays: number,
  activeRooms: number
): number | null {
  if (operatingHoursPerDay === null || operatingHoursPerDay <= 0 || operatingDays <= 0 || activeRooms <= 0) {
    return null;
  }
  return usedMinutes / (operatingHoursPerDay * 60 * operatingDays * activeRooms) * 100;
}

/** Salary-and-allowance cost only; excludes commission, other earnings, and take-home. */
export function calculateSalaryAllowanceCost(fixed: number, allowance: number, deductions: number): number {
  return fixed + allowance - deductions;
}

export function calculateOperatingProfit(
  revenue: number,
  commission: number,
  salaryAndAllowances: number,
  expenses: number,
  materials: number,
  costOfGoodsSold = 0
): number {
  return revenue - commission - salaryAndAllowances - expenses - materials - costOfGoodsSold;
}

export type RevenueCategoryKey = "SERVICE" | "EXTENSION" | "ADD_ON" | "FNB" | "PRODUCT";

export const REVENUE_CATEGORY_LABEL: Record<RevenueCategoryKey, string> = {
  SERVICE: "Layanan",
  EXTENSION: "Perpanjangan",
  ADD_ON: "Add-on",
  FNB: "Makanan & minuman",
  PRODUCT: "Produk retail",
};

/**
 * The cashier records every catalogue product as item_type PRODUCT —
 * snacks and drinks included (UAT 18 Okt 2026) — so F&B is recognised by
 * the product's catalogue category, with FOOD/BEVERAGE kept for safety.
 */
export function revenueCategoryOf(itemType: string, productCategory?: string | null): RevenueCategoryKey {
  if (itemType === "FOOD" || itemType === "BEVERAGE") return "FNB";
  if (itemType === "PRODUCT" && productCategory === "Food & Beverage") return "FNB";
  if (itemType === "EXTENSION" || itemType === "ADD_ON" || itemType === "PRODUCT") return itemType;
  return "SERVICE";
}

export type RevenueItemInput = { transactionId: string; itemType: string; name: string; quantity: number; amount: number };

/**
 * Splits sold items into revenue categories and summarizes food & beverage:
 * how many paid transactions included F&B (attach rate), average F&B spend
 * per transaction, and gross profit per F&B item using the product's cost
 * price when it is known (null when not — never guessed).
 */
export function summarizeRevenueItems(
  items: RevenueItemInput[],
  paidTransactionCount: number,
  costPriceByName: Map<string, number>,
  categoryByName: Map<string, string> = new Map()
) {
  const totals = new Map<RevenueCategoryKey, { quantity: number; amount: number }>();
  const fnbItems = new Map<string, { quantity: number; amount: number }>();
  const fnbTransactions = new Set<string>();
  for (const item of items) {
    const key = revenueCategoryOf(item.itemType, categoryByName.get(item.name));
    const total = totals.get(key) ?? { quantity: 0, amount: 0 };
    total.quantity += item.quantity;
    total.amount += item.amount;
    totals.set(key, total);
    if (key === "FNB") {
      fnbTransactions.add(item.transactionId);
      const row = fnbItems.get(item.name) ?? { quantity: 0, amount: 0 };
      row.quantity += item.quantity;
      row.amount += item.amount;
      fnbItems.set(item.name, row);
    }
  }
  const itemTotal = [...totals.values()].reduce((sum, row) => sum + row.amount, 0);
  const order: RevenueCategoryKey[] = ["SERVICE", "EXTENSION", "ADD_ON", "FNB", "PRODUCT"];
  const byCategory = order.map((key) => ({
    key,
    label: REVENUE_CATEGORY_LABEL[key],
    quantity: totals.get(key)?.quantity ?? 0,
    amount: totals.get(key)?.amount ?? 0,
    sharePct: itemTotal ? (totals.get(key)?.amount ?? 0) / itemTotal * 100 : 0,
  }));
  const fnbAmount = totals.get("FNB")?.amount ?? 0;
  const fnb = {
    amount: fnbAmount,
    transactionsWithFnb: fnbTransactions.size,
    attachPct: paidTransactionCount ? fnbTransactions.size / paidTransactionCount * 100 : null,
    averagePerTransaction: paidTransactionCount ? fnbAmount / paidTransactionCount : null,
    items: [...fnbItems.entries()].map(([name, row]) => {
      const cost = costPriceByName.has(name) ? costPriceByName.get(name)! * row.quantity : null;
      return { name, ...row, cost, grossProfit: cost === null ? null : row.amount - cost };
    }).sort((a, b) => b.amount - a.amount),
  };
  return { byCategory, fnb };
}

export function getCommissionTotalForPeriod(
  outletId: string,
  period: string,
  payrollRows: { outletId: string; period: string; variable: number }[],
  commissionEntries: { outletId: string; date: string; amount: number; status: string }[]
): number {
  const storedRows = payrollRows.filter((row) => row.outletId === outletId && row.period === period);
  if (storedRows.length) return storedRows.reduce((total, row) => total + row.variable, 0);
  return commissionEntries
    .filter((row) => row.outletId === outletId && row.date.slice(0, 7) === period && row.status !== "REVERSED")
    .reduce((total, row) => total + row.amount, 0);
}

/** Lazily attaches the profit property, leaving it truly absent when disabled. */
export function withOptionalProfit<T extends object, P>(
  report: T,
  includeProfit: boolean,
  getProfit: () => P
): T | (T & { profit: P }) {
  return includeProfit ? { ...report, profit: getProfit() } : report;
}

export type CashflowCostKind = "commission" | "expenses" | "materials";

export type WeeklyCashflowRow = {
  label: string;
  start: string;
  end: string;
  revenue: number;
  commission: number;
  expenses: number;
  materials: number;
  contribution: number;
  cumulativeContribution: number;
};

/**
 * Buckets a month into calendar weeks of the month (1–7, 8–14, 15–21,
 * 22–28, 29–end) and sums revenue and variable costs per bucket.
 * "Contribution" = revenue − commission − expenses − materials, i.e. before
 * fixed salary; its running total shows when the month covers fixed payroll.
 */
export function buildWeeklyCashflow(
  monthStart: string,
  days: number,
  revenueByDay: { date: string; amount: number }[],
  costs: { date: string; kind: CashflowCostKind; amount: number }[]
): WeeklyCashflowRow[] {
  const prefix = monthStart.slice(0, 8);
  const rows: WeeklyCashflowRow[] = [];
  let cumulative = 0;
  for (let first = 1; first <= days; first += 7) {
    const last = Math.min(days, first + 6);
    const start = `${prefix}${String(first).padStart(2, "0")}`;
    const end = `${prefix}${String(last).padStart(2, "0")}`;
    const inBucket = (date: string) => date.slice(0, 10) >= start && date.slice(0, 10) <= end;
    const revenue = revenueByDay.filter((row) => inBucket(row.date)).reduce((sum, row) => sum + row.amount, 0);
    const sumOf = (kind: CashflowCostKind) => costs
      .filter((row) => row.kind === kind && inBucket(row.date))
      .reduce((sum, row) => sum + row.amount, 0);
    const commission = sumOf("commission");
    const expenses = sumOf("expenses");
    const materials = sumOf("materials");
    const contribution = revenue - commission - expenses - materials;
    cumulative += contribution;
    rows.push({ label: `${first}–${last}`, start, end, revenue, commission, expenses, materials, contribution, cumulativeContribution: cumulative });
  }
  return rows;
}

export type UsageStatus = "WAJAR" | "BOROS" | "HEMAT" | "TANPA_TAKARAN";

/**
 * Compares units actually issued from the store room with the units the
 * guest count implies (visits ÷ guests-per-unit). Usage is never exact, so
 * ±tolerance (default 20%) is still "wajar".
 */
export function assessConsumableUsage(
  issuedUnits: number,
  visits: number,
  guestsPerUnit: number | null,
  tolerancePct = 20
): { expectedUnits: number | null; variancePct: number | null; status: UsageStatus } {
  if (!guestsPerUnit || guestsPerUnit <= 0) return { expectedUnits: null, variancePct: null, status: "TANPA_TAKARAN" };
  const expectedUnits = visits / guestsPerUnit;
  if (expectedUnits === 0) {
    return { expectedUnits, variancePct: null, status: issuedUnits > 0 ? "BOROS" : "WAJAR" };
  }
  const variancePct = (issuedUnits - expectedUnits) / expectedUnits * 100;
  const status: UsageStatus = variancePct > tolerancePct ? "BOROS" : variancePct < -tolerancePct ? "HEMAT" : "WAJAR";
  return { expectedUnits, variancePct, status };
}

export type WeeklyUsageRow = { label: string; start: string; end: string; visits: number; materialCost: number; costPerVisit: number | null };

/** Visits and treatment-material cost per week of the month (same buckets as the cashflow chart). */
export function buildWeeklyUsage(
  monthStart: string,
  days: number,
  visitDates: string[],
  materials: { date: string; amount: number }[]
): WeeklyUsageRow[] {
  const prefix = monthStart.slice(0, 8);
  const rows: WeeklyUsageRow[] = [];
  for (let first = 1; first <= days; first += 7) {
    const last = Math.min(days, first + 6);
    const start = `${prefix}${String(first).padStart(2, "0")}`;
    const end = `${prefix}${String(last).padStart(2, "0")}`;
    const inBucket = (date: string) => date.slice(0, 10) >= start && date.slice(0, 10) <= end;
    const visits = visitDates.filter(inBucket).length;
    const materialCost = materials.filter((row) => inBucket(row.date)).reduce((sum, row) => sum + row.amount, 0);
    rows.push({ label: `${first}–${last}`, start, end, visits, materialCost, costPerVisit: visits ? materialCost / visits : null });
  }
  return rows;
}
