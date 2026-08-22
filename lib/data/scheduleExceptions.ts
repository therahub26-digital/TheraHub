import { createClient } from "@/lib/supabase/server";

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
