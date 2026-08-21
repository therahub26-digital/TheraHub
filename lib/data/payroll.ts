import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PAYROLL as MOCK_PAYROLL } from "@/lib/mock/finance";
import type { PayrollAdjustment, PayrollComponent } from "@/lib/payroll";
import type { PayrollItem, JobRole } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode read layer for payroll — the last module in the Fase 5 order.
//
// Fallback rule is the same as everywhere else and the stakes are the
// highest here: these rows are people's wages. A month with no payroll
// run yet is the normal state for most of the month; showing fabricated
// payslips instead would put invented take-home figures in front of the
// person they claim to be about.
// ---------------------------------------------------------------------

type PayrollRow = {
  id: string;
  employee_id: string;
  outlet_id: string;
  period: string;
  fixed: number | string;
  allowance: number | string;
  variable: number | string;
  bonus: number | string;
  thr: number | string;
  late_penalty: number | string;
  absence_penalty: number | string;
  savings: number | string;
  loan: number | string;
  other_deductions: number | string;
  net_pay: number | string;
  status: PayrollItem["status"];
};

export type PayrollSettings = {
  outletId: string;
  components: PayrollComponent[];
  periodType: string;
  note: string;
};

async function fetchLivePayroll(): Promise<PayrollItem[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from("payroll_items")
    .select("*")
    .order("period", { ascending: false });
  if (error) return null;
  if (!rows || rows.length === 0) return [];

  const payrollRows = rows as PayrollRow[];
  const employeeIds = [...new Set(payrollRows.map((r) => r.employee_id))];

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, name, job_role")
    .in("id", employeeIds);
  const employees = new Map((employeeRows ?? []).map((e) => [e.id, e]));

  return payrollRows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: employees.get(row.employee_id)?.name ?? "",
    jobRole: (employees.get(row.employee_id)?.job_role ?? "Terapis") as JobRole,
    outletId: row.outlet_id,
    period: row.period,
    fixed: Number(row.fixed),
    allowance: Number(row.allowance),
    variable: Number(row.variable),
    bonus: Number(row.bonus),
    thr: Number(row.thr),
    latePenalty: Number(row.late_penalty),
    absencePenalty: Number(row.absence_penalty),
    savings: Number(row.savings),
    loan: Number(row.loan),
    otherDeductions: Number(row.other_deductions),
    netPay: Number(row.net_pay),
    status: row.status,
  }));
}

const loadPayrollData = cache(async () => {
  const live = await fetchLivePayroll();
  // `!== null`, not truthy — see lib/data/bookings.ts for the landmine.
  if (live !== null) return { payroll: live, live: true };
  return { payroll: MOCK_PAYROLL, live: false };
});

export async function isLivePayrollData(): Promise<boolean> {
  return (await loadPayrollData()).live;
}

export async function getPayrollForOutlet(outletId: string, period?: string): Promise<PayrollItem[]> {
  const { payroll } = await loadPayrollData();
  return payroll.filter((p) => p.outletId === outletId && (!period || p.period === period));
}

export async function getPayrollForEmployee(employeeId: string): Promise<PayrollItem[]> {
  const { payroll } = await loadPayrollData();
  return payroll.filter((p) => p.employeeId === employeeId).sort((a, b) => (a.period < b.period ? 1 : -1));
}

/**
 * The outlet's payroll structure, or `null` when nobody has configured
 * it yet.
 *
 * The null is meaningful and must not be defaulted away: "no components
 * chosen" and "commission only" are different statements, and a payroll
 * run that guessed the second from the first would invent a wage policy
 * on the business's behalf. Callers show a setup prompt instead.
 */
export async function getPayrollSettings(outletId: string): Promise<PayrollSettings | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Demo/"Ganti Role" viewer: the mock payslips were authored around a
    // conventional full payroll, so describe that rather than pretending
    // the showcase outlet is commission-only.
    return {
      outletId,
      components: ["FIXED", "ALLOWANCE", "COMMISSION", "SAVINGS"],
      periodType: "MONTHLY",
      note: "Data demo.",
    };
  }

  const { data, error } = await supabase
    .from("payroll_settings")
    .select("*")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (error || !data) return null;

  return {
    outletId: data.outlet_id,
    components: (data.components ?? []) as PayrollComponent[],
    periodType: data.period_type ?? "MONTHLY",
    note: data.note ?? "",
  };
}

// ------------------------------------------------------------------
// Adjustment lines (migration 0006).
//
// Read separately from `payroll_items` on purpose: the item row carries
// per-component subtotals, but only these rows carry the LABEL — and the
// label is what makes a deduction accountable to the person it is taken
// from. A payslip that shows "Potongan Lain: Rp430.000" tells someone
// nothing; "Rok navy 100.000 / Seragam navy 80.000 / Latihan 250.000"
// tells them exactly what they are paying for.
// ------------------------------------------------------------------

export async function getAdjustmentsForOutlet(
  outletId: string,
  period: string
): Promise<PayrollAdjustment[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("outlet_id", outletId)
    .eq("period", period)
    .order("created_at");
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    outletId: row.outlet_id,
    period: row.period,
    label: row.label,
    kind: row.kind,
    amount: Number(row.amount),
    component: row.component ?? null,
    note: row.note ?? "",
    batchId: row.batch_id ?? null,
  }));
}

export async function getAdjustmentsForEmployee(
  employeeId: string,
  period: string
): Promise<PayrollAdjustment[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("period", period)
    .order("created_at");
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    outletId: row.outlet_id,
    period: row.period,
    label: row.label,
    kind: row.kind,
    amount: Number(row.amount),
    component: row.component ?? null,
    note: row.note ?? "",
    batchId: row.batch_id ?? null,
  }));
}
