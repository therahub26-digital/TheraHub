import { createClient } from "@/lib/supabase/server";
import type { AttendanceEvent } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for therapist GPS attendance
// (attendance_events — table + RLS already existed since the 0002
// baseline, just never had a read/write layer built on top of it).
//
// Same fallback convention as every other lib/data/*.ts module, but
// pushed to the CALLER instead of handled inside this file (same choice
// lib/data/notifications.ts made, for the same reason): the therapist
// pages already resolve `getSignedInTherapist()` before calling anything
// here, so there is no need for a second independent auth check —
// callers must already know a real session exists. "No session at all"
// is handled by the page choosing the mock fixture (`attendanceOf`)
// directly, not by this file falling back internally.
//
// SCOPE DELIBERATELY NARROWER THAN THE MOCK DATA / AttendanceStatus type:
//   - There is no per-employee shift-schedule table anywhere in the real
//     database (checked: `employees` has no shift/schedule column at
//     all) — only `outlets.open_hours`, a single outlet-wide free-text
//     string. So `lateMinutes` here is computed against that one shared
//     outlet opening time, not a real personal shift start. It's a
//     reasonable proxy, not a personalized schedule — documented here so
//     a future reader doesn't mistake it for one.
//   - `SCHEDULED` / `ABSENT` / `VERIFIED` (AttendanceStatus) are never
//     produced by this layer: both require knowing who was scheduled to
//     work and didn't show, which needs a shift roster this app doesn't
//     have. Only CHECKED_IN / LATE / CHECKED_OUT / SUSPICIOUS are
//     reachable — see lib/actions/attendance.ts for how each is decided.
//   - `SUSPICIOUS` here only ever means "outside geofence radius" or
//     "GPS accuracy worse than the outlet's threshold" — real
//     mock-location / fake-GPS detection needs a native app integrity
//     check, which the existing UI copy on /therapist/attendance already
//     tells the therapist this browser-based flow doesn't have.
// ---------------------------------------------------------------------

type AttendanceRow = {
  id: string;
  employee_id: string;
  outlet_id: string;
  date: string;
  shift: string;
  check_in_at: string | null;
  check_out_at: string | null;
  lat: number;
  lng: number;
  accuracy: number;
  distance_from_geofence: number;
  device_id: string;
  app_version: string;
  location_status: AttendanceEvent["locationStatus"];
  late_minutes: number;
  status: AttendanceEvent["status"];
  note: string | null;
};

function mapAttendanceRow(row: AttendanceRow, employeeName: string): AttendanceEvent {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName,
    outletId: row.outlet_id,
    date: row.date,
    shift: row.shift,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    distanceFromGeofence: row.distance_from_geofence,
    deviceId: row.device_id,
    appVersion: row.app_version,
    locationStatus: row.location_status,
    lateMinutes: row.late_minutes,
    status: row.status,
    note: row.note ?? undefined,
  };
}

/**
 * Newest-first attendance history for one signed-in therapist. Caller
 * already knows who's signed in (getSignedInTherapist()) — this just
 * reads their own rows, which RLS (`attendance_events_self`) would
 * enforce even if it didn't.
 */
export async function getAttendanceHistoryForTherapist(employeeId: string, employeeName: string, days = 7): Promise<AttendanceEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select("*")
    .eq("employee_id", employeeId)
    .order("date", { ascending: false })
    .limit(days);
  if (error || !data) return [];
  return (data as AttendanceRow[]).map((row) => mapAttendanceRow(row, employeeName));
}

/** Just today's row (or undefined if the therapist hasn't checked in yet today), for the Beranda card + the top of /therapist/attendance. */
export async function getTodayAttendanceForTherapist(employeeId: string, employeeName: string, today: string): Promise<AttendanceEvent | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_events")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("date", today)
    .maybeSingle();
  if (error || !data) return undefined;
  return mapAttendanceRow(data as AttendanceRow, employeeName);
}
