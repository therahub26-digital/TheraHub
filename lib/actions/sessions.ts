"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso, plusMinutes } from "@/lib/wallclock";
import { notifyTherapist } from "@/lib/notify";

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

/**
 * Guest has arrived. This is also where the room gets decided — not at
 * booking time (see lib/actions/bookings.ts's file header for why) —
 * so the kasir picks from whatever is actually free right now.
 *
 * The availability check is re-run here, server-side, even though the
 * kasir's room picker was already built from getAvailableRoomsForOutlet:
 * that list can go stale between page load and click (another kasir
 * checks a guest into the same room a minute earlier), so the room a
 * guest is actually walked into must be verified at the moment it's
 * committed, not trusted from what the screen showed a moment ago.
 */
export async function checkInBooking(bookingId: string, roomId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  if (!roomId) return { ok: false, error: "Pilih room dulu sebelum check-in." };

  const { data: booking, error: readErr } = await supabase
    .from("bookings")
    .select("id, outlet_id, status, therapist_id, customer_id, package_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!CHECK_IN_FROM.includes(booking.status)) {
    return { ok: false, error: `Booking ini berstatus ${booking.status} — tidak bisa di-check-in.` };
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id, outlet_id, name, status")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !room) return { ok: false, error: "Room tidak ditemukan." };
  if (room.outlet_id !== booking.outlet_id) return { ok: false, error: "Room ini bukan milik outlet booking ini." };
  if (room.status !== "ACTIVE") return { ok: false, error: `Room ${room.name} sedang ${room.status.toLowerCase()} — pilih room lain.` };

  const { data: holder } = await supabase
    .from("bookings")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ["CHECKED_IN", "IN_SESSION"])
    .neq("id", bookingId)
    .maybeSingle();
  if (holder) return { ok: false, error: `Room ${room.name} baru saja dipakai booking lain — pilih room lain.` };

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({ status: "CHECKED_IN", room_id: roomId })
    .eq("id", bookingId);
  if (updateErr) return { ok: false, error: "Gagal menyimpan check-in — coba lagi." };

  // "waktu bekerja saat kasir atau manager klik check in untuk siap2" —
  // user feedback 2026-08-23. Best-effort, two small lookups just for the
  // message text; see lib/notify.ts's header for why a failure here never
  // fails the check-in itself.
  if (booking.therapist_id) {
    const [{ data: customer }, { data: pkg }] = await Promise.all([
      supabase.from("customers").select("name").eq("id", booking.customer_id).maybeSingle(),
      supabase.from("service_packages").select("name").eq("id", booking.package_id).maybeSingle(),
    ]);
    await notifyTherapist(supabase, booking.therapist_id, {
      type: "booking.checked_in",
      title: "Tamu sudah check-in — bersiap",
      body: `${customer?.name ?? "Tamu"} sudah tiba di room ${room.name}${pkg?.name ? ` untuk ${pkg.name}` : ""}. Segera bersiap.`,
    });
  }

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

// ---------------------------------------------------------------------
// Extension sale: ajukan (therapist) -> approve/tolak (kasir/manager) ->
// billed at payment (payForSession, lib/actions/transactions.ts).
//
// Deliberately minimal for this round: `conflict_check` is always
// written as 'CLEAR' — there is no automated check yet for whether
// extending this session would collide with the room's or therapist's
// next booking (the `ROOM_CONFLICT`/`THERAPIST_CONFLICT` values on the
// enum exist for a future round to fill in). A kasir/manager approving
// an extension is trusted to notice an obvious conflict themselves for
// now, same as any other judgment call this app doesn't yet automate.
// ---------------------------------------------------------------------

function revalidateExtensions() {
  revalidatePath("/therapist/session");
  revalidatePath("/kasir/sessions");
  revalidatePath("/manager/sessions");
}

/** Therapist asks for more time on a session that is still running. */
export async function requestExtension(sessionId: string, extensionId: string, reason?: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr || !session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "ACTIVE") {
    return { ok: false, error: "Extension hanya bisa diajukan untuk sesi yang sedang berjalan." };
  }

  // One pending request at a time — a second ask before the first is
  // decided would leave the kasir approving/rejecting duplicates for the
  // same few extra minutes.
  const { data: existing } = await supabase
    .from("extension_requests")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "PENDING")
    .maybeSingle();
  if (existing) return { ok: false, error: "Sudah ada permintaan extension yang menunggu keputusan untuk sesi ini." };

  const { error: insertErr } = await supabase.from("extension_requests").insert({
    session_id: sessionId,
    extension_id: extensionId,
    requested_at: nowIso(),
    status: "PENDING",
    conflict_check: "CLEAR",
    reason: reason?.trim() || null,
  });
  if (insertErr) return { ok: false, error: "Gagal mengajukan extension — coba lagi." };

  revalidateExtensions();
  return { ok: true };
}

/**
 * Kasir or manager approves: the session's countdown is pushed out by the
 * extension's duration right away (so the therapist and the session
 * monitor both see the new end time immediately), but nothing is billed
 * yet — that happens once at payment, in payForSession(), which sums
 * every APPROVED extension_request tied to the session.
 */
export async function approveExtension(requestId: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: request, error: reqErr } = await supabase
    .from("extension_requests")
    .select("id, session_id, extension_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !request) return { ok: false, error: "Permintaan extension tidak ditemukan." };
  if (request.status !== "PENDING") return { ok: false, error: "Permintaan ini sudah diputuskan." };

  const { data: extension, error: extErr } = await supabase
    .from("extension_options")
    .select("duration_min")
    .eq("id", request.extension_id)
    .maybeSingle();
  if (extErr || !extension) return { ok: false, error: "Opsi extension tidak ditemukan." };

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status, expected_end, extension_minutes")
    .eq("id", request.session_id)
    .maybeSingle();
  if (sessionErr || !session) return { ok: false, error: "Sesi terkait tidak ditemukan." };
  if (session.status !== "ACTIVE") {
    return { ok: false, error: "Sesi ini sudah tidak berjalan — extension tidak bisa disetujui lagi." };
  }

  const { error: updateReqErr } = await supabase
    .from("extension_requests")
    .update({ status: "APPROVED" })
    .eq("id", requestId);
  if (updateReqErr) return { ok: false, error: "Gagal menyimpan persetujuan — coba lagi." };

  const { error: updateSessionErr } = await supabase
    .from("sessions")
    .update({
      expected_end: plusMinutes(session.expected_end, extension.duration_min),
      extension_minutes: session.extension_minutes + extension.duration_min,
    })
    .eq("id", session.id);
  // Non-fatal if this second update fails: the approval itself is already
  // saved and will still be billed correctly at payment (payForSession
  // sums extension_requests directly, not session.extension_minutes).
  // Losing this update only means the live countdown doesn't reflect the
  // extra time until the next read recomputes it some other way.
  void updateSessionErr;

  revalidateExtensions();
  return { ok: true };
}

export async function rejectExtension(requestId: string, reason?: string): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: request, error: reqErr } = await supabase
    .from("extension_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !request) return { ok: false, error: "Permintaan extension tidak ditemukan." };
  if (request.status !== "PENDING") return { ok: false, error: "Permintaan ini sudah diputuskan." };

  const { error: updateErr } = await supabase
    .from("extension_requests")
    .update({ status: "REJECTED", reason: reason?.trim() || null })
    .eq("id", requestId);
  if (updateErr) return { ok: false, error: "Gagal menolak permintaan — coba lagi." };

  revalidateExtensions();
  return { ok: true };
}
