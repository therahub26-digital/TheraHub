import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
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
//
// SCOPED QUERIES ONLY — this file used to load the ENTIRE
// commission_entries table with one unbounded `select("*")`, cache that
// single array for the request, and filter it in JavaScript for every
// caller (by outlet, by therapist, by period). That worked while the
// table was small, but it is wrong at any real scale: PostgREST caps an
// unbounded select at a default row limit (1000), so once the TENANT'S
// total row count crosses that line, the cap silently returns the top
// 1000 by the query's sort order and drops the rest — no error, no
// warning, just a wrong number on screen. This is exactly how
// /manager/payroll ended up showing a therapist 61 treatments when 141
// existed: seeding demo data for testing pushed the whole tenant over
// 1000 rows, and the truncation quietly ate 80 of one person's entries
// while months of demo volume for OTHER therapists' dates sorted ahead
// of hers. The trigger this time was demo data, but the same failure
// mode was always waiting for real transaction volume to reach it —
// a moderately busy two-outlet spa can clear 1000 commission rows in
// well under a year.
//
// The fix is structural, not a bigger limit: every query below filters
// by outlet_id/therapist_id and, where the caller has one, by period,
// AT THE DATABASE, so the row count returned is bounded by what the
// screen actually needs — never by "how much history the tenant has
// accumulated so far".
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

function mapRow(row: CommissionRow, therapistName: Map<string, string>, bookingCode: Map<string, string>): CommissionEntry {
  return {
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
  };
}

/** Attaches therapist name + booking code to a batch of raw rows in two bounded lookups. */
async function hydrate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: CommissionRow[]
): Promise<CommissionEntry[]> {
  if (!rows.length) return [];

  const therapistIds = [...new Set(rows.map((r) => r.therapist_id))];
  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter((v): v is string => !!v))];

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

  return rows.map((row) => mapRow(row, therapistName, bookingCode));
}

/**
 * `true` for a signed-in live session, `false` for the demo/"Ganti Role"
 * viewer. A plain auth check — deliberately NOT tied to loading any
 * commission data, so callers can know which mode they're in without
 * pulling a whole table to find out.
 */
export async function isLiveCommissionsData(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

/**
 * The period ("YYYY-MM") the app should treat as current: the real
 * calendar month for a live session, the frozen demo month for the mock
 * viewer. Mirrors getEffectiveToday() in lib/data/bookings.ts — without
 * it, a logged-in therapist in August would see a payslip headed with
 * the mock's frozen month.
 */
export async function getEffectivePeriod(): Promise<string> {
  if (!(await isLiveCommissionsData())) {
    const { CURRENT_PERIOD } = await import("@/lib/mock/rng");
    return CURRENT_PERIOD;
  }
  return todayIsoDate().slice(0, 7);
}

/**
 * One therapist's own commission history, most recent first.
 *
 * Bounded to that one person by the query itself, not by filtering a
 * tenant-wide fetch — see the file header for why that distinction is
 * load-bearing. A single therapist's own row count grows far slower
 * than the tenant's combined total, but this is still not paginated;
 * if a therapist's history ever needs to page, that is the next thing
 * to add here, not a reason to go back to fetching everything.
 */
export async function getCommissionsForTherapist(therapistId: string): Promise<CommissionEntry[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return MOCK_COMMISSIONS.filter((c) => c.therapistId === therapistId).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const { rows, error } = await fetchAllRows<CommissionRow>(async (from, to) =>
    supabase
      .from("commission_entries")
      .select("*")
      .eq("therapist_id", therapistId)
      .order("date", { ascending: false })
      .range(from, to)
  );
  if (error) return [];

  return hydrate(supabase, rows);
}

/**
 * All commission earned at one outlet, optionally narrowed to one
 * period — the query every payroll/commission screen actually needs.
 *
 * The period filter is a half-open date range `[period-01, nextMonth-01)`
 * applied AT THE DATABASE, matching runPayroll's own filter
 * (lib/actions/payroll.ts) exactly. That match matters: the live
 * estimate on /manager/payroll and the figure runPayroll actually stores
 * must be reading the same window, or "Hitung Payroll" would routinely
 * disagree with the screen that led up to it for reasons that have
 * nothing to do with anything actually changing.
 */
export async function getCommissionsForOutlet(outletId: string, period?: string): Promise<CommissionEntry[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return MOCK_COMMISSIONS
      .filter((c) => c.outletId === outletId && (!period || c.date.startsWith(period)))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const nextMonth = (() => {
    if (!period) return null;
    const [y, m] = period.split("-").map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  })();

  const { rows, error } = await fetchAllRows<CommissionRow>(async (from, to) => {
    let query = supabase.from("commission_entries").select("*").eq("outlet_id", outletId);
    if (period && nextMonth) query = query.gte("date", `${period}-01`).lt("date", nextMonth);
    return query.order("date", { ascending: false }).range(from, to);
  });
  if (error) return [];

  return hydrate(supabase, rows);
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
