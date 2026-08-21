import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// The commission rule, in one place.
//
// A rule is a (type, value) pair: either a flat rupiah amount per sale,
// or a percentage of the item's price. The outlet admin sets both when
// entering the catalog — "setiap harga layanan diinput dan komisi juga
// sudah ditentukan, termasuk extend waktu. nilainya bisa rupiah atau
// persenan" (user, 2026-08-21).
//
// Why this file exists rather than inlining the arithmetic: the SAME
// rule has to be rendered on the catalog screen and paid out at the till,
// and those two must never disagree. Before this, /manager/catalog
// formatted every commission with rp() unconditionally, so a 25% rule
// rendered as "Rp25" — a display that is off by a factor of ~1800 from
// what the therapist would actually be owed. Keeping the interpretation
// in one module makes that class of drift impossible: whoever adds the
// next surface calls commissionAmount() instead of re-deriving it.
// ---------------------------------------------------------------------

export type CommissionType = "fixed" | "percent";

export type CommissionRule = {
  type: CommissionType;
  /** Rupiah when type is "fixed"; a 0..100 percentage when type is "percent". */
  value: number;
};

/**
 * What the therapist actually earns on one sale of `basisAmount`.
 *
 * Rounded to whole rupiah — Indonesian payroll is not paid in fractions
 * of a rupiah, and letting a repeating decimal (e.g. 33% of 180.000)
 * flow into `commission_entries.amount` would make every downstream
 * payroll total end in noise that never reconciles against the till.
 */
export function commissionAmount(rule: CommissionRule, basisAmount: number): number {
  if (!Number.isFinite(rule.value) || rule.value <= 0) return 0;
  if (rule.type === "percent") return Math.round((basisAmount * rule.value) / 100);
  return Math.round(rule.value);
}

/** How the rule reads on screen: "Rp45.000" or "25%". */
export function formatCommissionRule(rule: CommissionRule): string {
  if (rule.type === "percent") return `${rule.value}%`;
  return rp(rule.value);
}

/**
 * A human-readable, self-contained description of the rule as it stood
 * at the moment of sale — stored verbatim in
 * `commission_entries.rule_snapshot`.
 *
 * This is deliberately a frozen STRING, not a foreign key to the package.
 * If the admin later changes the package from 25% to 30%, every
 * commission already earned must keep showing the rule it was actually
 * computed under; a live join would silently rewrite history and make
 * past payslips stop reconciling with the payments that produced them.
 */
export function commissionRuleSnapshot(rule: CommissionRule, label: string): string {
  return `${label}: ${formatCommissionRule(rule)}`;
}

/** True when no real rule has been configured yet (the seeded placeholder). */
export function isCommissionUnset(rule: CommissionRule): boolean {
  return !Number.isFinite(rule.value) || rule.value <= 0;
}
