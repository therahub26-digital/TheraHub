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

/** Lazily attaches the profit property, leaving it truly absent when disabled. */
export function withOptionalProfit<T extends object, P>(
  report: T,
  includeProfit: boolean,
  getProfit: () => P
): T | (T & { profit: P }) {
  return includeProfit ? { ...report, profit: getProfit() } : report;
}
