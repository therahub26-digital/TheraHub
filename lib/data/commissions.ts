import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { COMMISSIONS as MOCK_COMMISSIONS } from "@/lib/mock/finance";
import { todayIsoDate } from "@/lib/wallclock";
import type { CommissionEntry } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode read layer for "commission_entries" — the sixth module in
// the Fase 5 order (outlets -> employees -> booking -> sesi -> transaksi
// -> KOMISI -> payroll).
//
// Same fallback rule as bookings/sessions/transactions, and here it
// matters more than anywhere else: these rows are what a therapist is
// owed. A real therapist who has not worked a paid session yet has
// earned nothing, and that is a true and normal statement — especially
// at the start of a month. Substituting ~400 fabricated commission rows
// would show someone an invented figure for their own pay, which is the
// single worst version of the fake-data bug this codebase has already
// hit once (see the booking module notes in the roadmap).
// ---------------------------------------------------------------------

type CommissionRow = {
  id: string;
  therapist_id: string;
  outlet_id: string;
  date: string;
  booking_id: string | null;
  package_name: string | null;
  rule_snapshot: string | null;
  basis_amount: number | string;
  amount: number | string;
  status: CommissionEntry["status"];
};

async function fetchLiveCommissions(): Promise<CommissionEntry[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo/"Ganti Role" viewer -> mock. See header.

  const { data: rows, error } = await supabase
    .from("commission_entries")
    .select("*")
    .order("date", { ascending: false });
  if (error) return null;
  if (!rows || rows.length === 0) return []; // real session, genuinely nothing earned yet

  const commissionRows = rows as CommissionRow[];
  const therapistIds = [...new Set(commissionRows.map((r) => r.therapist_id))];
  const bookingIds = [...new Set(commissionRows.map((r) => r.booking_id).filter((v): v is string => !!v))];

  const [{ data: therapistRows }, { data: bookingRows }] = await Promise.all([
    therapistIds.length
      ? supabase.from("employees").select("id, name").in("id", therapistIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? supabase.from("bookings").select("id, code").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const therapistName = new Map((therapistRows ?? []).map((e) => [e.id, e.name]));
  const bookingCode = new Map((bookingRows ?? []).map((b) => [b.id, b.code]));

  return commissionRows.map((row) => ({
    id: row.id,
    therapistId: row.therapist_id,
    therapistName: therapistName.get(row.therapist_id) ?? "",
    outletId: row.outlet_id,
    date: row.date,
    bookingCode: (row.booking_id && bookingCode.get(row.booking_id)) ?? "",
    packageName: row.package_name ?? "",
    // The rule as it stood when this was earned — see lib/commission.ts
    // for why this is a frozen string rather than a live lookup.
    ruleSnapshot: row.rule_snapshot ?? "",
    basisAmount: Number(row.basis_amount),
    amount: Number(row.amount),
    status: row.status,
  }));
}

const loadCommissionsData = cache(async () => {
  const live = await fetchLiveCommissions();
  // `!== null`, not truthy — `[]` is truthy in JS and the whole point of
  // this check is telling "nobody logged in" apart from "nothing earned".
  if (live !== null) return { commissions: live, live: true };
  return { commissions: MOCK_COMMISSIONS, live: false };
});

export async function isLiveCommissionsData(): Promise<boolean> {
  return (await loadCommissionsData()).live;
}

/**
 * The period ("YYYY-MM") the app should treat as current: the real
 * calendar month for a live session, the frozen demo month for the mock
 * viewer. Mirrors getEffectiveToday() in lib/data/bookings.ts — without
 * it, a logged-in therapist in August would see a payslip headed with
 * the mock's frozen month.
 */
export async function getEffectivePeriod(): Promise<string> {
  const { live } = await loadCommissionsData();
  if (!live) {
    const { CURRENT_PERIOD } = await import("@/lib/mock/rng");
    return CURRENT_PERIOD;
  }
  return todayIsoDate().slice(0, 7);
}

export async function getCommissionsForTherapist(therapistId: string): Promise<CommissionEntry[]> {
  const { commissions } = await loadCommissionsData();
  return commissions
    .filter((c) => c.therapistId === therapistId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getCommissionsForOutlet(outletId: string, period?: string): Promise<CommissionEntry[]> {
  const { commissions } = await loadCommissionsData();
  return commissions
    .filter((c) => c.outletId === outletId && (!period || c.date.startsWith(period)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Resolves the employee record of the therapist who is currently signed
 * in, so the therapist-facing screens show that person's own earnings
 * instead of the hardcoded ME_THERAPIST demo persona.
 *
 * Returns null when there is no session, or when the signed-in account
 * is not linked to an employee row — the caller then falls back to the
 * mock persona, which is correct for the "Ganti Role" showcase.
 */
export async function getSignedInTherapist(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!appUser?.employee_id) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name")
    .eq("id", appUser.employee_id)
    .maybeSingle();
  if (!employee) return null;

  return { id: employee.id, name: employee.name };
}
