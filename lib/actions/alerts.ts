"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Server Actions for room_alerts (0014_room_alerts.sql) — the
// therapist "call for help" button and manager/kasir resolve action.
//
// triggerRoomAlert() is called from a therapist's own active-session
// page with just a bookingId; it looks up room_id/outlet_id from the
// booking itself server-side rather than trusting anything the client
// might pass, and RLS (`room_alerts_insert_therapist`) independently
// enforces that only the booking's own therapist can create the row.
//
// Manager/kasir don't poll for alerts — they get pushed OPEN rows via
// Supabase Realtime (see components/RoomAlertBanner.tsx), and resolve
// through resolveRoomAlert() below.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sesi tidak ditemukan — silakan login ulang." as const };
  return { supabase, error: null };
}

function revalidateAlerts() {
  revalidatePath("/manager/rooms");
  revalidatePath("/manager");
  revalidatePath("/kasir");
}

/**
 * Therapist presses "Panggil Bantuan" on their active session. Refuses a
 * second OPEN alert for the same booking (re-clicking doesn't spam
 * manager/kasir with duplicates) — the existing one is still open, so
 * nothing new needs saying.
 */
export async function triggerRoomAlert(bookingId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: booking, error: readErr } = await supabase
    .from("bookings")
    .select("id, outlet_id, room_id, therapist_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!booking.room_id) return { ok: false, error: "Booking ini belum punya room." };

  const { data: existing } = await supabase
    .from("room_alerts")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "OPEN")
    .maybeSingle();
  if (existing) return { ok: true }; // already sent, nothing more to do

  const { error: writeErr } = await supabase.from("room_alerts").insert({
    outlet_id: booking.outlet_id,
    room_id: booking.room_id,
    booking_id: booking.id,
    therapist_id: booking.therapist_id,
  });
  if (writeErr) return { ok: false, error: writeErr.message };

  revalidateAlerts();
  return { ok: true };
}

/** Manager/kasir marks an alert handled. */
export async function resolveRoomAlert(alertId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase.from("app_users").select("employee_id").eq("auth_user_id", user!.id).maybeSingle();

  const { error: writeErr } = await supabase
    .from("room_alerts")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString(), resolved_by: me?.employee_id ?? null })
    .eq("id", alertId)
    .eq("status", "OPEN");
  if (writeErr) return { ok: false, error: writeErr.message };

  revalidateAlerts();
  return { ok: true };
}
