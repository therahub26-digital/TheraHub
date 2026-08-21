"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, plusMinutes } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Server Actions: the operational loop after a booking exists.
//
//   BOOKED --checkInBooking--> CHECKED_IN --startSession--> IN_SESSION
//          --completeSession--> COMPLETED  (then POS bills it -> PAID)
//
// Until this file existed, `createBooking` could produce a booking and
// nothing could ever advance it — every real booking would sit at BOOKED
// forever and the `sessions` table could never have a row. This closes
// that gap.
//
// All three run as the signed-in staff user (createClient(), never the
// service-role client), so 0002_rls_policies.sql's `bookings_staff` /
// `sessions_staff` policies still scope every write to that user's own
// outlet/tenant. A kasir at Cikawao physically cannot start a session at
// Mekarwangi, even if a bad id is passed in — the database refuses it,
// not just the UI.
//
// Every timestamp goes through lib/wallclock.ts. Do NOT reach for
// `new Date().toISOString()` here: it returns the true UTC instant, which
// is 7 hours away from the wall-clock values the booking form writes, so
// a session started "now" would look 7 hours old. See that file's header.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Booking states a guest can legitimately be checked in from. */
const CHECK_IN_FROM = ["BOOKED", "CONFIRMED", "ARRIVED"];

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sesi tidak ditemukan — silakan login ulang." as const };
  return { supabase, error: null };
}

function revalidateOps() {
  revalidatePath("/manager/bookings");
  revalidatePath("/manager/sessions");
  revalidatePath("/kasir");
  revalidatePath("/kasir/sessions");
}

/** Guest has arrived and is ready to be taken to a room. */
export async function checkInBooking(bookingId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: booking, error: readErr } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!CHECK_IN_FROM.includes(booking.status)) {
    return { ok: false, error: `Booking ini berstatus ${booking.status} — tidak bisa di-check-in.` };
  }

  const { error: updateErr } = await supabase.from("bookings").update({ status: "CHECKED_IN" }).eq("id", bookingId);
  if (updateErr) return { ok: false, error: "Gagal menyimpan check-in — coba lagi." };

  revalidateOps();
  return { ok: true };
}

/**
 * Therapist begins the treatment: creates the session row and moves the
 * booking to IN_SESSION.
 *
 * `expected_end` is computed from the REAL start time, not the booked
 * time — a guest who starts 20 minutes late still gets their full 90
 * minutes, which is what both the guest and the therapist expect. The
 * booked time stays untouched on the booking row, so the gap between
 * scheduled and actual remains visible for reporting later.
 */
export async function startSession(bookingId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: booking, error: readErr } = await supabase
    .from("bookings")
    .select("id, outlet_id, therapist_id, room_id, duration_min, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!["CHECKED_IN", "ARRIVED"].includes(booking.status)) {
    return { ok: false, error: "Tamu harus check-in dulu sebelum sesi dimulai." };
  }

  // Guard against a double-click or two staff members starting the same
  // booking: one booking gets at most one live session.
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("booking_id", bookingId)
    .not("status", "in", '("VOID")')
    .maybeSingle();
  if (existing) return { ok: false, error: "Sesi untuk booking ini sudah pernah dimulai." };

  const startedAt = nowIso();
  const { error: insertErr } = await supabase.from("sessions").insert({
    booking_id: booking.id,
    outlet_id: booking.outlet_id,
    therapist_id: booking.therapist_id,
    room_id: booking.room_id,
    purchased_duration_min: booking.duration_min,
    actual_start: startedAt,
    expected_end: plusMinutes(startedAt, booking.duration_min),
    extension_minutes: 0,
    status: "ACTIVE",
  });
  if (insertErr) return { ok: false, error: "Gagal memulai sesi — coba lagi." };

  const { error: bookingErr } = await supabase.from("bookings").update({ status: "IN_SESSION" }).eq("id", bookingId);
  if (bookingErr) return { ok: false, error: "Sesi tersimpan tapi status booking gagal diperbarui — periksa halaman Bookings." };

  revalidateOps();
  return { ok: true };
}

/**
 * Treatment finished. Records the real end time (which may be earlier or
 * later than expected_end — that difference is the useful bit) and hands
 * the booking over to the POS as COMPLETED, i.e. done but not yet paid.
 */
export async function completeSession(sessionId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: session, error: readErr } = await supabase
    .from("sessions")
    .select("id, booking_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (readErr || !session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "ACTIVE") {
    return { ok: false, error: "Sesi ini sudah tidak berjalan." };
  }

  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ status: "COMPLETED", actual_end: nowIso() })
    .eq("id", sessionId);
  if (updateErr) return { ok: false, error: "Gagal menyelesaikan sesi — coba lagi." };

  const { error: bookingErr } = await supabase
    .from("bookings")
    .update({ status: "COMPLETED" })
    .eq("id", session.booking_id);
  if (bookingErr) return { ok: false, error: "Sesi selesai tapi status booking gagal diperbarui — periksa halaman Bookings." };

  revalidateOps();
  return { ok: true };
}
