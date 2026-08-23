import { noShowCutoffIso, NO_SHOW_GRACE_MIN } from "@/lib/bookingRules";

// ---------------------------------------------------------------------
// Rule 3: "jam booking yang sudah lewat otomatis akan dibatalkan oleh
// sistem jika tidak check in" (user, 2026-08-23).
//
// Found from a live screenshot: at 13:01 the kasir's Today screen still
// showed a 10:00 booking as BOOKED with an active Check-in button, and
// the guest's own app still listed it under "Booking Mendatang" — three
// hours after the guest failed to turn up. Nothing in the system ever
// closed it out, so the therapist's 10:00 slot stayed locked against
// new bookings forever and the no-show never appeared in any KPI.
//
// WHY A SWEEP-ON-READ AND NOT A CRON. This app has a standing rule
// against background jobs that flip rows on a timer (see the ENDING_SOON
// note in lib/data/sessions.ts and the roadmap's no-cron principle):
// a row that a cron failed to update goes stale silently, and nobody
// finds out until the number on someone's payslip is wrong. But unlike
// ENDING_SOON, "no-show" cannot be a purely derived display value
// either — the therapist's slot has to actually be freed for
// createBooking()'s conflict check, and the KPI counts real NO_SHOW
// rows. So this is the middle path: a cheap, idempotent UPDATE run at
// the single chokepoint every booking read already passes through
// (lib/data/bookings.ts's fetchLiveBookings). The database ends up
// truthful, and the sweep happens the moment anybody looks — which is
// exactly when it matters.
//
// SCOPED BY RLS, NOT BY A SERVICE-ROLE BYPASS. This deliberately takes
// the CALLER'S session client rather than createAdminClient(). RLS then
// does the scoping for free and correctly per role: bookings_staff
// limits a kasir/manager to their own outlet, bookings_customer limits
// a guest to their own rows. There is nothing here that a signed-in
// user is not already allowed to do to their own data, so there is no
// reason to reach for the service-role key (contrast
// lib/actions/inventory.ts, where a cross-outlet write genuinely could
// not be expressed under the caller's own RLS).
//
// ARRIVED IS NOT SWEPT — only BOOKED and CONFIRMED are. ARRIVED means
// the guest is physically in the lobby and the kasir simply has not
// assigned a room yet. Cancelling an appointment out from under someone
// who is sitting right there would be a far worse bug than the one this
// fixes.
// ---------------------------------------------------------------------

const SWEEPABLE_STATUSES = ["BOOKED", "CONFIRMED"];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnySupabaseClient = any;

/**
 * Mark every no-show booking visible to this client as NO_SHOW.
 * Returns how many rows were flipped (0 on the overwhelmingly common
 * path where there is nothing to do).
 *
 * Best-effort by design: a failure here must never break a page that
 * was only trying to READ bookings. The sweep is idempotent, so the
 * next reader simply picks up whatever this run missed.
 */
export async function sweepNoShowBookings(supabase: AnySupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "NO_SHOW" })
      .in("status", SWEEPABLE_STATUSES)
      .lte("scheduled_start", noShowCutoffIso())
      .select("id");

    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

export { NO_SHOW_GRACE_MIN };
