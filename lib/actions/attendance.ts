"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, wallClockIso, minutesBetween } from "@/lib/wallclock";
import { getEffectiveToday } from "@/lib/data/bookings";

// ---------------------------------------------------------------------
// GPS check-in/check-out for the therapist app (attendance_events —
// table + RLS already existed since the 0002 baseline migration; this is
// the first write path built on top of it). Requested by the user: the
// existing "Absen Sekarang" button on /therapist/attendance had no
// onClick at all, and the Beranda "Absensi" card was 100% mock.
//
// GEOFENCE / ACCURACY, not fake-GPS detection: this validates distance
// from the outlet's registered lat/lng against `outlets.geofence_radius`,
// and GPS accuracy against `outlets.accuracy_threshold` — both real
// numbers already stored per outlet. It does NOT detect mock-location
// apps or spoofed GPS; browser Geolocation has no API for that. The
// existing UI copy on /therapist/attendance already tells the therapist
// this plainly ("Integritas Perangkat" note) — a real anti-spoof check
// needs a native app, out of scope here. A check-in outside the geofence
// or with poor accuracy is still recorded (status SUSPICIOUS), not
// silently rejected — flagging it for a manager to review is more useful
// than blocking a therapist who has a legitimately bad GPS fix indoors.
//
// LATE, approximately: there is no per-employee shift-schedule table in
// this database at all (checked directly — `employees` has no
// shift/schedule column). `lateMinutes` here is computed against the
// outlet's single shared `open_hours` string instead of a personal
// shift start — an outlet-wide proxy, not a real per-therapist
// schedule. If `open_hours` doesn't parse as "HH:mm..." at the front,
// lateMinutes is 0 rather than a guess.
//
// ONE ROW PER EMPLOYEE PER DAY, same as the mock fixture's shape:
// check-in opens the row, check-out closes it. A second check-in the
// same day (after already checking out) is refused rather than creating
// a second event — this app doesn't model split shifts.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Meters between two lat/lng points (haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** First "HH:mm" found in a free-text open-hours string, e.g. "08:00–20:00" -> "08:00". Null if unparseable. */
function parseOpenTime(openHours: string | null): string | null {
  if (!openHours) return null;
  const m = openHours.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

async function resolveSignedInEmployee() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, employee: null, error: "Sesi tidak ditemukan — silakan login ulang." as const };

  const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("auth_user_id", user.id).maybeSingle();
  if (!appUser?.employee_id) return { supabase, employee: null, error: "Akun ini tidak terhubung ke data karyawan." as const };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, outlet_id")
    .eq("id", appUser.employee_id)
    .maybeSingle();
  if (!employee) return { supabase, employee: null, error: "Data karyawan tidak ditemukan." as const };

  return { supabase, employee, error: null };
}

function revalidateAttendance() {
  revalidatePath("/therapist/attendance");
  revalidatePath("/therapist");
}

/**
 * Therapist presses "Absen Sekarang". `accuracy` is the Geolocation API's
 * own reported accuracy in meters (smaller = better) — matches
 * `outlets.accuracy_threshold`'s meaning.
 */
export async function checkIn(lat: number, lng: number, accuracy: number): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error) return { ok: false, error };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
    return { ok: false, error: "Data lokasi tidak valid — coba lagi." };
  }

  const today = await getEffectiveToday();

  const { data: existing } = await supabase
    .from("attendance_events")
    .select("id, check_in_at, check_out_at")
    .eq("employee_id", employee!.id)
    .eq("date", today)
    .maybeSingle();
  if (existing?.check_in_at && !existing.check_out_at) return { ok: false, error: "Sudah check-in hari ini." };
  if (existing?.check_out_at) return { ok: false, error: "Absensi hari ini sudah selesai (sudah check-out)." };

  const { data: outlet, error: outletErr } = await supabase
    .from("outlets")
    .select("lat, lng, geofence_radius, accuracy_threshold, open_hours")
    .eq("id", employee!.outlet_id)
    .maybeSingle();
  if (outletErr || !outlet) return { ok: false, error: "Data outlet tidak ditemukan." };

  const distance = Math.round(distanceMeters(outlet.lat, outlet.lng, lat, lng));
  const outsideGeofence = distance > outlet.geofence_radius;
  const lowAccuracy = accuracy > outlet.accuracy_threshold;
  const locationStatus: "VALID" | "OUTSIDE" | "LOW_ACCURACY" = outsideGeofence ? "OUTSIDE" : lowAccuracy ? "LOW_ACCURACY" : "VALID";

  const checkInAt = nowIso();
  const openTime = parseOpenTime(outlet.open_hours);
  const lateMinutes = openTime ? Math.max(0, Math.round(minutesBetween(wallClockIso(today, openTime), checkInAt))) : 0;

  const suspicious = locationStatus !== "VALID";
  const status: "SUSPICIOUS" | "LATE" | "CHECKED_IN" = suspicious ? "SUSPICIOUS" : lateMinutes > 0 ? "LATE" : "CHECKED_IN";
  const note = outsideGeofence
    ? `Check-in dari luar radius geofence (${distance}m, radius ${outlet.geofence_radius}m)`
    : lowAccuracy
      ? `Akurasi GPS di atas threshold (±${Math.round(accuracy)}m, threshold ${outlet.accuracy_threshold}m)`
      : null;

  const { error: writeErr } = await supabase.from("attendance_events").insert({
    employee_id: employee!.id,
    outlet_id: employee!.outlet_id,
    date: today,
    shift: outlet.open_hours ?? "Reguler",
    check_in_at: checkInAt,
    check_out_at: null,
    lat,
    lng,
    accuracy,
    distance_from_geofence: distance,
    // Best-effort labels, not a real device-bound identifier — this is a
    // browser PWA flow, not the native app the "Integritas Perangkat"
    // note on /therapist/attendance already tells the therapist would be
    // needed for real device binding.
    device_id: "WEB-BROWSER",
    app_version: "web",
    location_status: locationStatus,
    late_minutes: lateMinutes,
    status,
    note,
  });
  if (writeErr) return { ok: false, error: "Gagal menyimpan absensi — coba lagi." };

  revalidateAttendance();
  return { ok: true };
}

/** Therapist presses "Check-out" on a row they already checked into today. */
export async function checkOut(): Promise<ActionResult> {
  const { supabase, employee, error } = await resolveSignedInEmployee();
  if (error) return { ok: false, error };

  const today = await getEffectiveToday();

  const { data: existing } = await supabase
    .from("attendance_events")
    .select("id, check_in_at, check_out_at, status")
    .eq("employee_id", employee!.id)
    .eq("date", today)
    .maybeSingle();
  if (!existing?.check_in_at) return { ok: false, error: "Belum check-in hari ini." };
  if (existing.check_out_at) return { ok: false, error: "Sudah check-out hari ini." };

  // A SUSPICIOUS check-in stays SUSPICIOUS through check-out — the flag
  // is about the location event itself, not something checking out
  // clears.
  const nextStatus = existing.status === "SUSPICIOUS" ? "SUSPICIOUS" : "CHECKED_OUT";

  const { error: writeErr } = await supabase
    .from("attendance_events")
    .update({ check_out_at: nowIso(), status: nextStatus })
    .eq("id", existing.id);
  if (writeErr) return { ok: false, error: "Gagal menyimpan check-out — coba lagi." };

  revalidateAttendance();
  return { ok: true };
}
