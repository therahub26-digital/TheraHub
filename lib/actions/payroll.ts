"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  AVAILABLE_COMPONENTS,
  activeComponents,
  computeNetPay,
  type PayrollAdjustment,
  type PayrollComponent,
} from "@/lib/payroll";

// ---------------------------------------------------------------------
// Server Actions for payroll — the seventh and last module in the Fase 5
// order (outlets -> employees -> booking -> sesi -> transaksi -> komisi
// -> PAYROLL).
//
// Two actions: configure the outlet's payroll structure, and run a
// period. Both run as the signed-in user, so 0005's
// `payroll_settings_manage` / 0002's `payroll_items_manage` decide who
// may actually write — payroll is the most consequential thing in this
// app and must not be guarded by UI alone.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };
export type RunPayrollResult =
  | { ok: true; employeeCount: number; totalNet: number; warning?: string }
  | { ok: false; error: string };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function savePayrollSettings(
  outletId: string,
  components: PayrollComponent[],
  note?: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!components.length) {
    return { ok: false, error: "Pilih minimal satu komponen — payroll tanpa komponen tidak menghasilkan apa-apa." };
  }

  // Every known component is selectable; an unknown key means a crafted
  // request or a stale client.
  const availableKeys = new Set(AVAILABLE_COMPONENTS.map((c) => c.key));
  const unknown = components.filter((c) => !availableKeys.has(c));
  if (unknown.length) {
    return { ok: false, error: `Komponen tidak dikenal: ${unknown.join(", ")}.` };
  }

  const { error } = await supabase.from("payroll_settings").upsert(
    {
      outlet_id: outletId,
      components,
      period_type: "MONTHLY",
      note: note?.trim() || null,
      // `updated_at` deliberately omitted — the column defaults to now()
      // in the database. Setting it from JS would mean
      // `new Date().toISOString()`, which lib/wallclock.ts forbids for
      // any timestamptz in this app.
    },
    { onConflict: "outlet_id" }
  );

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah pengaturan payroll." };
  }

  revalidatePath("/manager/payroll-settings");
  revalidatePath("/owner/payroll");
  return { ok: true };
}

/**
 * Builds (or rebuilds) the payslips for one outlet and one period.
 *
 * Idempotent by design: `payroll_items` is unique on (employee, period),
 * so re-running recomputes in place rather than appending. That matters
 * because the most likely reason to re-run is that a late transaction
 * came in after the first run — the answer should be a corrected
 * payslip, not a second one.
 */
export async function runPayroll(outletId: string, period: string): Promise<RunPayrollResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!PERIOD_RE.test(period)) {
    return { ok: false, error: "Periode harus berformat YYYY-MM." };
  }

  // ---- The outlet's payroll structure -----------------------------
  // No settings row = nobody has decided how this outlet pays people.
  // Refuse rather than assume: guessing here would mint payslips under
  // a wage policy the business never chose.
  const { data: settings } = await supabase
    .from("payroll_settings")
    .select("components")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (!settings?.components?.length) {
    return {
      ok: false,
      error: "Struktur payroll outlet ini belum diatur. Buka Pengaturan Payroll dan tentukan komponennya dulu.",
    };
  }
  const components = activeComponents(settings.components as PayrollComponent[]);
  const uses = (key: PayrollComponent) => components.some((c) => c.key === key);

  // ---- Who gets a payslip -----------------------------------------
  const { data: employeeRows, error: empErr } = await supabase
    .from("employees")
    .select(
      "id, name, base_salary, fixed_allowance, status, referred_by_employee_id, referral_fee_type, referral_fee_value"
    )
    .eq("outlet_id", outletId)
    .eq("status", "ACTIVE");
  if (empErr) return { ok: false, error: "Gagal membaca data karyawan." };
  if (!employeeRows?.length) return { ok: false, error: "Tidak ada karyawan aktif di outlet ini." };

  // ---- Commission earned in the period ----------------------------
  // Filtered by period, NOT by status: the period filter is what stops
  // a commission being counted in two different runs. Status is the
  // workflow signal (see the transition at the end of this function),
  // so a re-run of the same period must still pick up entries it has
  // already marked, or the corrected payslip would lose them.
  //
  // REVERSED entries are excluded — a reversal exists precisely to say
  // "this was not earned after all".
  const commissionByEmployee = new Map<string, number>();
  // Treatment COUNT per employee, not just the amount — the referral fee
  // below needs this when it's charged per-treatment ("Rp5.000/slot"),
  // which is a different number than the peso total.
  const commissionCountByEmployee = new Map<string, number>();
  const commissionIds: string[] = [];
  if (uses("COMMISSION")) {
    // Half-open range [first of period, first of next month). Using a
    // "-31" upper bound would be a date Postgres rejects outright in
    // February, and would silently include the 31st of a 30-day month's
    // successor if it ever parsed.
    const [y, m] = period.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    // Paginated, not a single unbounded select — see lib/supabase/paginate.ts.
    // A busy outlet (or a full demo dataset) can clear 1000 commission
    // rows for ONE period on its own; a plain select silently returns
    // only the first page in that case, and a truncated total here is
    // the worst possible place for it — it becomes the payslip.
    const { rows: commissionRows, error: commErr } = await fetchAllRows<{
      id: string;
      therapist_id: string;
      amount: number | string;
      date: string;
      status: string;
    }>(async (from, to) =>
      supabase
        .from("commission_entries")
        .select("id, therapist_id, amount, date, status")
        .eq("outlet_id", outletId)
        .gte("date", `${period}-01`)
        .lt("date", nextMonth)
        .neq("status", "REVERSED")
        .range(from, to)
    );
    if (commErr) return { ok: false, error: "Gagal membaca data komisi." };

    for (const row of commissionRows) {
      commissionByEmployee.set(
        row.therapist_id,
        (commissionByEmployee.get(row.therapist_id) ?? 0) + Number(row.amount)
      );
      commissionCountByEmployee.set(
        row.therapist_id,
        (commissionCountByEmployee.get(row.therapist_id) ?? 0) + 1
      );
      commissionIds.push(row.id);
    }
  }

  // ---- Referral fee (real case: Zahra -> Lusi, Rp5.000/sesi) ------
  //
  // Computed here, from the commission entries just counted above, and
  // written as ordinary payroll_adjustments rows BEFORE they're fetched
  // below — so they flow through the same bucket() logic as anything a
  // manager typed by hand, with no separate code path on the payslip
  // itself. See supabase/migrations/0008_referral_fee.sql for why this
  // runs here and not per-transaction or fully by hand.
  //
  // Gated on uses("COMMISSION"): without commission entries turned on
  // for this outlet there is no treatment count to charge the fee
  // against, so there is nothing correct to compute.
  if (uses("COMMISSION")) {
    const referred = employeeRows.filter(
      (e) =>
        e.referred_by_employee_id &&
        e.referral_fee_type &&
        e.referral_fee_value !== null &&
        (commissionCountByEmployee.get(e.id) ?? 0) > 0
    );

    if (referred.length) {
      // The recruiter may not be an employee of THIS outlet (rare, but
      // the UI doesn't hard-block it) — their earning line has to be
      // written under their OWN outlet, or it would never surface on
      // their payslip when their own outlet's payroll runs. Look up
      // whichever recruiters aren't already in this outlet's employeeRows.
      const localById = new Map(employeeRows.map((e) => [e.id, e]));
      const recruiterIds = Array.from(new Set(referred.map((e) => e.referred_by_employee_id as string)));
      const missingRecruiterIds = recruiterIds.filter((id) => !localById.has(id));
      let recruiterOutletById = new Map<string, string>();
      if (missingRecruiterIds.length) {
        const { data: recruiterRows } = await supabase
          .from("employees")
          .select("id, outlet_id")
          .in("id", missingRecruiterIds);
        recruiterOutletById = new Map((recruiterRows ?? []).map((r) => [r.id, r.outlet_id]));
      }

      const referralRows = referred.flatMap((e) => {
        const recruiterId = e.referred_by_employee_id as string;
        const count = commissionCountByEmployee.get(e.id) ?? 0;
        const totalCommission = commissionByEmployee.get(e.id) ?? 0;
        const fee =
          e.referral_fee_type === "percent"
            ? Math.round((totalCommission * Number(e.referral_fee_value)) / 100)
            : Number(e.referral_fee_value) * count;
        if (!(fee > 0)) return [];

        // A recruiter found in employeeRows is, by construction, active in
        // THIS outlet (that query already filtered on outlet_id) — so
        // outletId itself is their outlet_id; only a recruiter absent from
        // employeeRows needs the separate lookup above.
        const recruiterOutletId = localById.has(recruiterId) ? outletId : recruiterOutletById.get(recruiterId);
        if (!recruiterOutletId) return []; // recruiter row not found — skip rather than guess an outlet.

        return [
          {
            employee_id: e.id,
            outlet_id: outletId,
            period,
            label: "Fee Referral",
            kind: "DEDUCTION" as const,
            amount: fee,
            component: "OTHER_DEDUCTIONS" as const,
            note: `Fee referral untuk perekrut, ${count} sesi bulan ini`,
            ref: `referral-out:${period}`,
          },
          {
            employee_id: recruiterId,
            outlet_id: recruiterOutletId,
            period,
            label: `Fee Referral — ${e.name}`,
            kind: "EARNING" as const,
            amount: fee,
            component: "BONUS" as const,
            note: `${count} sesi ${e.name} bulan ini`,
            ref: `referral-in:${period}:${e.id}`,
          },
        ];
      });

      if (referralRows.length) {
        // Non-fatal like the savings/commission-flag writes below: the
        // payslip build below still runs correctly off whatever rows
        // already exist, and failing the whole run here would block a
        // payroll close over a bonus line, not a bug in the payslip
        // itself.
        await supabase.from("payroll_adjustments").upsert(referralRows, { onConflict: "employee_id,ref" });
      }
    }
  }

  // ---- Manager-entered lines for this period ----------------------
  // Seragam, latihan, tabungan, bonus — anything the outlet added by
  // hand. Fetched per period so a line entered for March never leaks
  // into April's payslip.
  const { data: adjustmentRows, error: adjErr } = await supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("outlet_id", outletId)
    .eq("period", period);
  if (adjErr) return { ok: false, error: "Gagal membaca baris penyesuaian." };

  const adjustmentsByEmployee = new Map<string, PayrollAdjustment[]>();
  for (const row of adjustmentRows ?? []) {
    const list = adjustmentsByEmployee.get(row.employee_id) ?? [];
    list.push({
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
    });
    adjustmentsByEmployee.set(row.employee_id, list);
  }

  // ---- Build one payslip per employee -----------------------------
  const rows = employeeRows.map((e) => {
    const lines = adjustmentsByEmployee.get(e.id) ?? [];
    // Adjustment totals are also written into the matching component
    // column, so a payslip read without the line detail still shows the
    // right subtotal per category. The lines themselves remain the
    // source of truth for the labels an employee actually reads.
    // Kind-aware on purpose. A component carries a fixed direction
    // (SAVINGS deducts, BONUS adds), so an EARNING line tagged with a
    // deduction component — "Pencairan Tabungan" is exactly that shape —
    // must not be added into the deduction column. The take-home maths
    // reads `kind` and would be right either way; this keeps the
    // per-column subtotals from claiming the opposite.
    const bucket = (key: PayrollComponent, kind: "EARNING" | "DEDUCTION") =>
      lines
        .filter((l) => l.component === key && l.kind === kind)
        .reduce((sum, l) => sum + l.amount, 0);
    const item = {
      fixed: uses("FIXED") ? Number(e.base_salary ?? 0) : 0,
      allowance: uses("ALLOWANCE") ? Number(e.fixed_allowance ?? 0) : 0,
      variable: commissionByEmployee.get(e.id) ?? 0,
      bonus: bucket("BONUS", "EARNING"),
      thr: bucket("THR", "EARNING"),
      latePenalty: bucket("LATE_PENALTY", "DEDUCTION"),
      absencePenalty: bucket("ABSENCE_PENALTY", "DEDUCTION"),
      savings: bucket("SAVINGS", "DEDUCTION"),
      loan: bucket("LOAN", "DEDUCTION"),
      otherDeductions: bucket("TAX", "DEDUCTION") + bucket("OTHER_DEDUCTIONS", "DEDUCTION"),
    };
    return {
      employee_id: e.id,
      outlet_id: outletId,
      period,
      fixed: item.fixed,
      allowance: item.allowance,
      variable: item.variable,
      bonus: item.bonus,
      thr: item.thr,
      late_penalty: item.latePenalty,
      absence_penalty: item.absencePenalty,
      savings: item.savings,
      loan: item.loan,
      other_deductions: item.otherDeductions,
      net_pay: computeNetPay(item, components, lines),
      status: "CALCULATED" as const,
    };
  });

  // An employee who earned nothing this period still gets a payslip
  // showing zero — that is a true statement about a month they did not
  // work, and it is different from the commission module's "no rule
  // configured" case. Suppressing them would make a therapist wonder
  // whether they were forgotten.

  const { error: upsertErr } = await supabase
    .from("payroll_items")
    .upsert(rows, { onConflict: "employee_id,period" });
  if (upsertErr) {
    return { ok: false, error: "Gagal menyimpan payslip — coba lagi." };
  }

  // ---- Record the savings deposits --------------------------------
  //
  // A Tabungan deduction is not a penalty — it is the employee's own
  // money moved into safekeeping, and it has to land somewhere they can
  // later point at. Writing it here, from the same numbers that produced
  // the payslip, is what keeps "dipotong Rp200.000 bulan ini" and "saldo
  // tabungan saya" from ever disagreeing.
  //
  // `ref` is the idempotency key (0007): re-running August updates
  // August's deposit in place instead of stacking a second one. Without
  // it, pressing Hitung Payroll twice would double what the company
  // claims to be holding for someone.
  if (uses("SAVINGS")) {
    const deposits = rows
      .filter((r) => Number(r.savings) > 0)
      .map((r) => ({
        employee_id: r.employee_id,
        outlet_id: outletId,
        date: `${period}-01`,
        type: "DEPOSIT" as const,
        amount: r.savings,
        // Historical note only — every balance shown in the app is summed
        // from the entries (see lib/data/savings.ts), never read from here.
        balance_after: 0,
        period,
        ref: `payroll:${period}`,
        note: "Setoran otomatis dari payroll",
      }));

    if (deposits.length) {
      // Non-fatal, like the commission flag below: the payslips are
      // already correct and the deduction is already recorded on them.
      // Failing the whole run would invite a re-run that fixes nothing.
      const { error: savingsErr } = await supabase
        .from("savings_entries")
        .upsert(deposits, { onConflict: "employee_id,ref" });
      if (savingsErr) {
        return {
          ok: true,
          employeeCount: rows.length,
          totalNet: rows.reduce((s, r) => s + r.net_pay, 0),
          warning:
            "Payslip tersimpan, tapi setoran tabungan gagal dicatat — saldo tabungan bisa jadi belum ikut terupdate.",
        };
      }
    }
  }

  // ---- Mark the commissions as rolled into a payslip --------------
  // Non-fatal on failure: the payslips are already correct and the
  // amounts are right. Losing this status flag costs visibility, not
  // money, and failing the whole run would tempt a re-run that changes
  // nothing.
  if (commissionIds.length) {
    await supabase
      .from("commission_entries")
      .update({ status: "INCLUDED_IN_PAYROLL" })
      .in("id", commissionIds)
      .eq("status", "PENDING");
  }

  // `/manager/payroll` first: it is the page the button lives on. Leaving
  // it out meant a successful run reported "12 payslip · total Rp…" while
  // the table behind it still showed no stored slip and kept the "data
  // berubah setelah dihitung" warning up — the run looked like it had
  // failed, inviting a re-run of something that already worked.
  revalidatePath("/manager/payroll");
  revalidatePath("/owner/payroll");
  revalidatePath("/manager/commissions");
  revalidatePath("/therapist/payslip");

  return {
    ok: true,
    employeeCount: rows.length,
    totalNet: rows.reduce((s, r) => s + r.net_pay, 0),
  };
}


// ---------------------------------------------------------------------
// Adjustment lines.
//
// The outlet manager owns these. They are per employee AND per period,
// so "seragam navy" entered in August does not silently repeat in
// September — a recurring deduction is re-entered deliberately, or it
// stops. For a one-off cost paid down over months (a Rp500.000 training
// fee taken Rp250.000 at a time) that means the manager enters the
// instalment each period and stops when it is settled; the system does
// not yet track a remaining balance, so the STOP is a human decision.
// That is a real limitation and it is written on the screen, because a
// deduction that keeps running after it is paid off is money taken from
// someone who no longer owes it.
// ---------------------------------------------------------------------

export type AddAdjustmentInput = {
  employeeId: string;
  outletId: string;
  period: string;
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amount: number;
  component?: PayrollComponent | null;
  note?: string;
};

export async function addPayrollAdjustment(input: AddAdjustmentInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Keterangan wajib diisi — potongan tanpa nama tidak bisa dipertanggungjawabkan." };
  if (!PERIOD_RE.test(input.period)) return { ok: false, error: "Periode harus berformat YYYY-MM." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Nominal harus lebih dari nol." };
  }

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("payroll_adjustments").insert({
    employee_id: input.employeeId,
    outlet_id: input.outletId,
    period: input.period,
    label,
    kind: input.kind,
    amount: input.amount,
    component: input.component ?? null,
    note: input.note?.trim() || null,
    created_by: appUser?.id ?? null,
  });

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah payroll outlet ini." };
  }

  revalidateAdjustments();
  return { ok: true };
}

export async function deletePayrollAdjustment(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase.from("payroll_adjustments").delete().eq("id", id);
  if (error) return { ok: false, error: "Gagal menghapus baris." };

  revalidateAdjustments();
  return { ok: true };
}

function revalidateAdjustments() {
  revalidatePath("/manager/payroll");
  revalidatePath("/owner/payroll");
  revalidatePath("/therapist/payslip");
}

// ---------------------------------------------------------------------
// Potongan massal.
//
// "Seragam baru, semua terapis, Rp100.000, tiga bulan" is one decision,
// and typing it twelve times invites the two mistakes that decision can
// make: a wrong amount on one person, and a person quietly skipped.
//
// This MATERIALISES rows rather than storing a rule that gets evaluated
// later. A rule would mean an edit in September silently rewrites what
// August's payslip said someone was charged — and a payslip that changes
// after it was paid is not a record, it is a guess. Frozen rows also let
// the manager exempt one person by deleting one row, which a rule cannot
// express without growing exceptions of its own.
//
// Every row created by one action shares a `batch_id` (0007), so the
// whole thing can be called off in a single click. That matters most for
// the future periods: a deduction nobody remembers to stop is money
// taken from someone who has finished paying.
// ---------------------------------------------------------------------

export type BulkTarget = "THERAPISTS" | "ALL_STAFF";

export type BulkAdjustmentInput = {
  outletId: string;
  /** First period, 'YYYY-MM'. Later ones are counted forward from here. */
  startPeriod: string;
  /** How many consecutive periods to write, including the first. */
  periodCount: number;
  target: BulkTarget;
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amount: number;
  component?: PayrollComponent | null;
  note?: string;
};

export type BulkAdjustmentResult =
  | { ok: true; rowsCreated: number; employeeCount: number; periods: string[]; skipped: number }
  | { ok: false; error: string };

/** 'YYYY-MM' plus n months, without touching Date (see lib/wallclock.ts). */
function addPeriods(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

export async function addBulkAdjustment(input: BulkAdjustmentInput): Promise<BulkAdjustmentResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const label = input.label.trim();
  if (!label) {
    return { ok: false, error: "Keterangan wajib diisi — potongan tanpa nama tidak bisa dipertanggungjawabkan." };
  }
  if (!PERIOD_RE.test(input.startPeriod)) return { ok: false, error: "Periode harus berformat YYYY-MM." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Nominal harus lebih dari nol." };
  }
  // Capped at a year. Beyond that this stops being "a few months ahead"
  // and becomes a standing order nobody will remember to cancel — and
  // there is still no balance tracking to stop it automatically.
  if (!Number.isInteger(input.periodCount) || input.periodCount < 1 || input.periodCount > 12) {
    return { ok: false, error: "Jumlah periode harus antara 1 dan 12." };
  }

  // ---- Who it applies to ------------------------------------------
  let query = supabase
    .from("employees")
    .select("id")
    .eq("outlet_id", input.outletId)
    .eq("status", "ACTIVE");
  if (input.target === "THERAPISTS") query = query.eq("is_therapist", true);

  const { data: employeeRows, error: empErr } = await query;
  if (empErr) return { ok: false, error: "Gagal membaca data karyawan." };
  if (!employeeRows?.length) {
    return { ok: false, error: "Tidak ada karyawan aktif yang cocok dengan pilihan ini." };
  }

  const periods = Array.from({ length: input.periodCount }, (_, i) => addPeriods(input.startPeriod, i));

  // ---- Skip anyone who already carries this label that period -----
  // The likeliest way to run this twice is a double click or a reload,
  // and the cost of guessing wrong is charging someone twice for one
  // uniform. Matching on (employee, period, label) is deliberately
  // conservative: it would rather refuse a legitimate second "Seragam"
  // line — which the manager can still add by hand with a clearer label —
  // than duplicate a deduction silently.
  const { data: existing } = await supabase
    .from("payroll_adjustments")
    .select("employee_id, period, label")
    .eq("outlet_id", input.outletId)
    .in("period", periods)
    .eq("label", label);
  const taken = new Set((existing ?? []).map((r) => `${r.employee_id}|${r.period}`));

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const batchId = crypto.randomUUID();
  const rows = [];
  let skipped = 0;
  for (const period of periods) {
    for (const e of employeeRows) {
      if (taken.has(`${e.id}|${period}`)) {
        skipped += 1;
        continue;
      }
      rows.push({
        employee_id: e.id,
        outlet_id: input.outletId,
        period,
        label,
        kind: input.kind,
        amount: input.amount,
        component: input.component ?? null,
        note: input.note?.trim() || null,
        created_by: appUser?.id ?? null,
        batch_id: batchId,
      });
    }
  }

  if (!rows.length) {
    return { ok: false, error: `Semua karyawan sudah punya baris "${label}" di periode tersebut — tidak ada yang ditambahkan.` };
  }

  const { error } = await supabase.from("payroll_adjustments").insert(rows);
  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah payroll outlet ini." };
  }

  revalidateAdjustments();
  return {
    ok: true,
    rowsCreated: rows.length,
    employeeCount: employeeRows.length,
    periods,
    skipped,
  };
}

/**
 * Cancels a whole bulk action.
 *
 * Only rows that have not yet been rolled into a stored payslip should
 * really be withdrawn this way, but the check is deliberately NOT made
 * here: re-running payroll for a period rebuilds it from whatever lines
 * exist, so removing a line and recalculating is the correct way to fix
 * a wrong deduction even after a run. Refusing would leave the manager
 * with no route back except editing the database by hand.
 */
export async function deleteAdjustmentBatch(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase.from("payroll_adjustments").delete().eq("batch_id", batchId);
  if (error) return { ok: false, error: "Gagal membatalkan batch." };

  revalidateAdjustments();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Pencairan tabungan.
//
// Amethyst cairkan menjelang Lebaran. Two things have to happen at once
// and neither is optional: the savings ledger has to record that the
// money left safekeeping, and the payslip has to show the employee
// receiving it. Doing only the first makes the money vanish from their
// view; doing only the second leaves the company still claiming to hold
// savings it has already paid out.
//
// The payout line is written with component = null on purpose. SAVINGS
// is a deduction component, and tagging an earning with it would file
// the payout inside the "Tabungan" deduction column — the exact opposite
// of what happened.
// ---------------------------------------------------------------------

export type WithdrawSavingsInput = {
  employeeId: string;
  outletId: string;
  period: string;
  amount: number;
  label?: string;
  note?: string;
};

export async function withdrawSavings(input: WithdrawSavingsInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!PERIOD_RE.test(input.period)) return { ok: false, error: "Periode harus berformat YYYY-MM." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Nominal harus lebih dari nol." };
  }

  // ---- Never pay out more than is actually held -------------------
  // Summed from the entries rather than read from a stored balance, for
  // the reason spelled out in lib/data/savings.ts.
  const { data: entries, error: readErr } = await supabase
    .from("savings_entries")
    .select("type, amount")
    .eq("employee_id", input.employeeId);
  if (readErr) return { ok: false, error: "Gagal membaca saldo tabungan." };

  const balance = (entries ?? []).reduce(
    (sum, e) => (e.type === "WITHDRAWAL" ? sum - Number(e.amount) : sum + Number(e.amount)),
    0
  );
  if (input.amount > balance) {
    return {
      ok: false,
      error: `Nominal melebihi saldo tabungan (saldo saat ini Rp${balance.toLocaleString("id-ID")}).`,
    };
  }

  const label = input.label?.trim() || "Pencairan Tabungan";

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Payslip line first. If the ledger write fails after this, the
  // employee sees a payout they are owed and the manager sees a balance
  // that is too high — visible, and fixable. The reverse order would
  // take the money out of the ledger with nothing on the payslip saying
  // where it went, which is the silent failure.
  const { data: inserted, error: adjErr } = await supabase
    .from("payroll_adjustments")
    .insert({
      employee_id: input.employeeId,
      outlet_id: input.outletId,
      period: input.period,
      label,
      kind: "EARNING",
      amount: input.amount,
      component: null,
      note: input.note?.trim() || null,
      created_by: appUser?.id ?? null,
    })
    .select("id")
    .single();
  if (adjErr || !inserted) {
    return { ok: false, error: "Gagal menambahkan baris pencairan ke payroll." };
  }

  const { error: savErr } = await supabase.from("savings_entries").insert({
    employee_id: input.employeeId,
    outlet_id: input.outletId,
    date: `${input.period}-01`,
    type: "WITHDRAWAL",
    amount: input.amount,
    balance_after: balance - input.amount,
    period: input.period,
    // Linked to the payslip line it paid out, so the two can always be
    // matched back up. Also unique, so this row cannot be duplicated.
    ref: `payout:${inserted.id}`,
    note: input.note?.trim() || null,
    created_by: appUser?.id ?? null,
  });
  if (savErr) {
    // Roll the payslip line back — leaving it would pay the money out
    // without ever deducting it from the savings balance.
    await supabase.from("payroll_adjustments").delete().eq("id", inserted.id);
    return { ok: false, error: "Gagal mencatat pencairan di buku tabungan — tidak ada perubahan yang disimpan." };
  }

  revalidateAdjustments();
  return { ok: true };
}
