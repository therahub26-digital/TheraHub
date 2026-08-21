import type { PayrollItem } from "@/lib/types";

// ---------------------------------------------------------------------
// The payroll component model.
//
// `payroll_items` carries ten components, but no business uses all ten,
// and which ones apply differs per spa. So the set is per-outlet
// configuration (`payroll_settings`, migration 0005) rather than a
// constant in code — Amethyst pays commission plus deductions, another
// tenant may pay a base wage and withhold tax.
//
// WHERE EACH NUMBER COMES FROM is the important part. Three components
// derive themselves (employee record, commission entries). The rest are
// filled by adjustment lines the outlet manager enters per period
// (migration 0006).
//
// An earlier version of this file marked those seven as "blocked — no
// data source" and refused to let an admin select them. That was wrong:
// the answer to a missing source is to give it one, not to withhold the
// component. Real payslips carry items nobody could name at
// schema-design time — "rok navy", "seragam navy", "latihan" — so the
// manual path is not a stopgap, it is the only design that survives
// contact with an actual payroll.
// ---------------------------------------------------------------------

export type PayrollComponent =
  | "FIXED"
  | "ALLOWANCE"
  | "COMMISSION"
  | "BONUS"
  | "THR"
  | "LATE_PENALTY"
  | "ABSENCE_PENALTY"
  | "SAVINGS"
  | "LOAN"
  | "TAX"
  | "OTHER_DEDUCTIONS";

export type ComponentSource =
  /** Read from a column on the employee record. */
  | "EMPLOYEE"
  /** Summed from commission_entries for the period. */
  | "COMMISSION_ENTRIES"
  /** Entered by the outlet manager as adjustment lines. */
  | "MANUAL";

export type ComponentSpec = {
  key: PayrollComponent;
  label: string;
  /** Earnings add to take-home pay; deductions subtract from it. */
  kind: "earning" | "deduction";
  /** The `PayrollItem` field this component aggregates into. */
  field: keyof Pick<
    PayrollItem,
    | "fixed"
    | "allowance"
    | "variable"
    | "bonus"
    | "thr"
    | "latePenalty"
    | "absencePenalty"
    | "savings"
    | "loan"
    | "otherDeductions"
  >;
  source: ComponentSource;
  /** Shown beside the checkbox so an admin knows what to expect. */
  hint: string;
};

/** Canonical display order — earnings first, then deductions. */
export const PAYROLL_COMPONENTS: ComponentSpec[] = [
  {
    key: "FIXED", label: "Gaji Pokok", kind: "earning", field: "fixed",
    source: "EMPLOYEE",
    hint: "Otomatis dari gaji pokok di data karyawan.",
  },
  {
    key: "ALLOWANCE", label: "Tunjangan Tetap", kind: "earning", field: "allowance",
    source: "EMPLOYEE",
    hint: "Otomatis dari tunjangan tetap di data karyawan.",
  },
  {
    key: "COMMISSION", label: "Komisi Treatment", kind: "earning", field: "variable",
    source: "COMMISSION_ENTRIES",
    hint: "Otomatis dari komisi treatment yang sudah dibayar periode ini.",
  },
  {
    key: "BONUS", label: "Bonus", kind: "earning", field: "bonus",
    source: "MANUAL",
    hint: "Diinput manager per karyawan tiap periode.",
  },
  {
    key: "THR", label: "THR", kind: "earning", field: "thr",
    source: "MANUAL",
    hint: "Diinput manager saat periode THR.",
  },
  {
    key: "LATE_PENALTY", label: "Potongan Terlambat", kind: "deduction", field: "latePenalty",
    source: "MANUAL",
    hint: "Diinput manager. Bisa otomatis setelah modul absensi live.",
  },
  {
    key: "ABSENCE_PENALTY", label: "Potongan Absen", kind: "deduction", field: "absencePenalty",
    source: "MANUAL",
    hint: "Diinput manager. Bisa otomatis setelah modul absensi live.",
  },
  {
    key: "SAVINGS", label: "Tabungan", kind: "deduction", field: "savings",
    source: "MANUAL",
    hint: "Nominal bisa berbeda tiap orang — diinput manager per karyawan.",
  },
  {
    key: "LOAN", label: "Cicilan / Pinjaman", kind: "deduction", field: "loan",
    source: "MANUAL",
    hint: "Mis. cicilan seragam atau biaya pelatihan.",
  },
  {
    key: "TAX", label: "Pajak (PPh 21)", kind: "deduction", field: "otherDeductions",
    source: "MANUAL",
    hint: "Untuk outlet yang memotong pajak penghasilan.",
  },
  {
    key: "OTHER_DEDUCTIONS", label: "Potongan Lain", kind: "deduction", field: "otherDeductions",
    source: "MANUAL",
    hint: "Potongan yang tidak masuk kategori di atas.",
  },
];

/** Components a payroll run can derive without anyone typing a number. */
export const AUTO_COMPONENTS = PAYROLL_COMPONENTS.filter((c) => c.source !== "MANUAL");

/** Every component is selectable — manual entry gives each one a source. */
export const AVAILABLE_COMPONENTS = PAYROLL_COMPONENTS;

export function componentSpec(key: PayrollComponent): ComponentSpec | undefined {
  return PAYROLL_COMPONENTS.find((c) => c.key === key);
}

/**
 * The components an outlet uses, in canonical order. Unrecognised keys
 * are skipped so a component retired from the product cannot crash a
 * payslip that still references it.
 */
export function activeComponents(keys: PayrollComponent[]): ComponentSpec[] {
  const set = new Set(keys);
  return PAYROLL_COMPONENTS.filter((c) => set.has(c.key));
}

// ------------------------------------------------------------------
// Adjustment lines — the free-form part of a payslip.
// ------------------------------------------------------------------

export type PayrollAdjustment = {
  id: string;
  employeeId: string;
  outletId: string;
  period: string;
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amount: number;
  component: PayrollComponent | null;
  note: string;
  /** Set when the row was created by a bulk action, so the whole batch can be cancelled together. */
  batchId: string | null;
};

export function sumAdjustments(lines: PayrollAdjustment[], kind: "EARNING" | "DEDUCTION"): number {
  return lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0);
}

/**
 * Take-home pay: active auto-sourced components, plus every adjustment
 * line, minus every deduction.
 *
 * Only ACTIVE components count. A component the outlet no longer uses is
 * skipped even if its column still holds a number, so a value left
 * behind by a previous configuration cannot keep changing someone's pay
 * after the policy that justified it was removed.
 *
 * Adjustment lines are always counted regardless of component, because a
 * manager entered them deliberately for this person and this period —
 * that is a stronger signal of intent than a settings checkbox.
 */
export function computeNetPay(
  item: Partial<PayrollItem>,
  components: ComponentSpec[],
  adjustments: PayrollAdjustment[] = []
): number {
  let net = 0;
  for (const c of components) {
    if (c.source === "MANUAL") continue; // carried by adjustment lines instead
    const value = Number(item[c.field] ?? 0);
    if (!Number.isFinite(value)) continue;
    net += c.kind === "earning" ? value : -value;
  }
  net += sumAdjustments(adjustments, "EARNING");
  net -= sumAdjustments(adjustments, "DEDUCTION");
  return Math.round(net);
}

/** Splits active components for rendering an earnings/deductions payslip. */
export function splitComponents(components: ComponentSpec[]) {
  return {
    earnings: components.filter((c) => c.kind === "earning"),
    deductions: components.filter((c) => c.kind === "deduction"),
  };
}
