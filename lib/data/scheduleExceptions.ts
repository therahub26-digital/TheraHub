import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------
// Read layer for `employee_schedule_exceptions` (see
// 0017_therapist_gallery_booking_window_schedule.sql's header for the
// full rationale — this is a brand-new table, NOT the legacy/unverified
// employee_day_off / employee_leave tables) — added 2026-08-22 for the
// daily manager/kasir "who's off today, and what do we do with their
// existing bookings" workflow.
//
// Unlike most lib/data/*.ts modules, this one has NO mock fallback: the
// feature is inherently about real staffing state on a real day, and
// there is no equivalent concept in lib/mock. In demo/"Ganti Role" mode
// (no session) this simply returns an empty list — same "genuinely
// empty, not an error" convention as lib/data/bookings.ts uses for a
// real session with zero bookings.
// ---------------------------------------------------------------------

export type ScheduleException = {
  id: string;
  employeeId: string;
  outletId: string;
  date: string;
  type: "OFF" | "LEAVE";
  note: string | null;
};

type ScheduleExceptionRow = {
  id: string;
  employee_id: string;
  outlet_id: string;
  date: string;
  type: string;
  note: string | null;
};

function mapRow(row: ScheduleExceptionRow): ScheduleException {
  return {
    id: row.id,
    employeeId: row.employee_id,
    outletId: row.outlet_id,
    date: row.date,
    type: row.type as "OFF" | "LEAVE",
    note: row.note,
  };
}

export async function getScheduleExceptions(outletId: string, date: string): Promise<ScheduleException[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_schedule_exceptions")
    .select("*")
    .eq("outlet_id", outletId)
    .eq("date", date);
  if (error || !data) return [];
  return (data as ScheduleExceptionRow[]).map(mapRow);
}

/**
 * All OFF/LEAVE rows for this outlet from `fromDate` (inclusive) onward
 * — the "rencana libur/cuti ke depan" board (user, 2026-08-23: "cek
 * jadwal terapis, tambahkan keterangan rencana libur/cuti"). Unlike
 * getScheduleExceptions() above (locked to a single day for the daily
 * check-the-roster routine), this is for staff planning AHEAD — seeing
 * what's already been marked for the coming days, not just today.
 */
export async function getUpcomingScheduleExceptions(outletId: string, fromDate: string): Promise<ScheduleException[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_schedule_exceptions")
    .select("*")
    .eq("outlet_id", outletId)
    .gte("date", fromDate)
    .order("date", { ascending: true });
  if (error || !data) return [];
  return (data as ScheduleExceptionRow[]).map(mapRow);
}

// ---------------------------------------------------------------------
// Customer-facing read — added 2026-08-23, user report "ayu masih bisa
// dibooking padahal libur". schedule_exceptions_read's RLS condition
// resolves the tenant through app_users (`employee_id in (select id
// from employees where tenant_id = _current_tenant_id())`), and
// _current_tenant_id() itself only ever looks at app_users — a customer
// session has no row there at all (customers authenticate through the
// separate `customers` table, see lib/actions/customerBookings.ts's
// header), so this table is INVISIBLE to a customer's own session
// client, full stop. Reading it here through the admin (service-role)
// client is a deliberate, narrow crossing of that boundary — read-only,
// and only employee ids are ever returned to the caller (never the
// `note` column, which can hold a free-text reason like "Cuti/Sakit"
// that a customer has no business seeing). Same shape as the same-day
// conflict check in lib/actions/customerBookings.ts, which crosses the
// identical RLS gap for the identical reason.
// ---------------------------------------------------------------------
export async function getUnavailableTherapistIdsForCustomer(outletIds: string[], date: string): Promise<Set<string>> {
  if (outletIds.length === 0) return new Set();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employee_schedule_exceptions")
    .select("employee_id")
    .in("outlet_id", outletIds)
    .eq("date", date);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.employee_id as string));
}
