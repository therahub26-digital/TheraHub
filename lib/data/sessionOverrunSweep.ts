// ---------------------------------------------------------------------
// Session overrun: "sesi yg aktif kalau tidak diclose menggantung
// terus, padahal tidak ada pengajuan extend juga, kalau sudah lewat 15
// menit alert ke kasir untuk segera menutup sesi" (user, 2026-08-23) —
// then corrected in the same turn to two separate thresholds:
//
//   1. 10 minutes past expected_end with no PENDING extension request:
//      ALERT the kasir/manager — surfaced as SessionRec.overdueMin on
//      the read layer, rendered by SessionOverrunAlert.tsx.
//   2. 15 minutes past expected_end, STILL no PENDING extension
//      request: auto-close the session — done here.
//
// This is Rule 3 (no-show sweep, babak keempat belas) again, one layer
// later in the lifecycle: that rule frees a therapist's SLOT when a
// guest never shows up before the treatment starts; this one frees the
// slot when a treatment starts but the kasir forgets to press "Selesai"
// after it ends. Same shape of bug (a booking's room/therapist stays
// locked forever because nobody presses a button), same fix pattern.
//
// SWEEP-ON-READ, NOT CRON — identical reasoning to noShowSweep.ts: a
// background job flipping rows on a timer can silently miss one, and
// nobody notices until a payslip or a KPI is wrong. This is a cheap,
// idempotent UPDATE run at the one chokepoint every session read
// already passes through (lib/data/sessions.ts's fetchLiveSessions).
//
// SCOPED BY RLS, NOT A SERVICE-ROLE BYPASS — takes the caller's own
// session client. `sessions_staff` already lets a kasir/manager update
// sessions at their own outlet; there is nothing here that crosses an
// RLS boundary, so there is no reason to reach for the admin client.
//
// A PENDING extension request suppresses BOTH the alert and the
// auto-close for that session. The therapist already asked for more
// time and it is waiting on a human decision — closing out from under
// that request, or nagging the kasir about a session they are already
// mid-decision on, would be actively wrong. Once that request is
// approved, expected_end itself moves forward (approveExtension), so
// the session stops being overdue on its own; once rejected, the
// original expected_end still stands and the sweep resumes normally.
// ---------------------------------------------------------------------

import { nowIso, plusMinutes } from "@/lib/wallclock";

/** Rule: how many minutes past expected_end before the kasir is alerted. */
export const SESSION_OVERDUE_ALERT_MIN = 10;

/** Rule: how many minutes past expected_end before the system closes it. */
export const SESSION_OVERDUE_AUTOCLOSE_MIN = 15;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnySupabaseClient = any;

/**
 * Auto-complete every ACTIVE session visible to this client that is
 * SESSION_OVERDUE_AUTOCLOSE_MIN+ past its expected_end and has no
 * PENDING extension request. `actual_end` is set to expected_end, not
 * "now" — nobody observed when the treatment actually finished (that is
 * the whole problem), so the honest record is "at least the time it was
 * booked for", not the arbitrary moment this sweep happened to run.
 *
 * Best-effort by design, same as sweepNoShowBookings: a failure here
 * must never break a page that was only trying to READ sessions.
 * Idempotent, so the next reader picks up whatever this run missed.
 */
export async function sweepOverdueSessions(supabase: AnySupabaseClient): Promise<number> {
  try {
    const cutoffIso = plusMinutes(nowIso(), -SESSION_OVERDUE_AUTOCLOSE_MIN);

    // Candidates: ACTIVE sessions whose expected_end already passed the
    // auto-close cutoff. expected_end is never null once a session is
    // ACTIVE (startSession always sets it), but the filter is defensive.
    const { data: candidates, error: readErr } = await supabase
      .from("sessions")
      .select("id, booking_id, expected_end")
      .eq("status", "ACTIVE")
      .not("expected_end", "is", null)
      .lte("expected_end", cutoffIso);
    if (readErr || !candidates || candidates.length === 0) return 0;

    // Exclude any session with a PENDING extension request — see the
    // header note on why a pending ask suppresses the sweep entirely.
    const sessionIds = candidates.map((c: { id: string }) => c.id);
    const { data: pendingRows } = await supabase
      .from("extension_requests")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("status", "PENDING");
    const pendingSessionIds = new Set((pendingRows ?? []).map((r: { session_id: string }) => r.session_id));
    const closable = candidates.filter((c: { id: string }) => !pendingSessionIds.has(c.id));
    if (closable.length === 0) return 0;

    const bookingIds = closable.map((c: { booking_id: string }) => c.booking_id);

    // actual_end = expected_end (see function doc — the honest record
    // of an unobserved finish is "at least the booked duration", not
    // the sweep's own run time). Written per-row via a CASE-less loop
    // rather than one blanket UPDATE ... SET actual_end = expected_end,
    // because Supabase's query builder has no column-to-column SET;
    // the row count here is always small (this only ever fires for
    // sessions someone forgot to close, not the common case).
    let closedCount = 0;
    for (const row of closable as { id: string; booking_id: string; expected_end: string }[]) {
      const { error: updateErr } = await supabase
        .from("sessions")
        .update({ status: "COMPLETED", actual_end: row.expected_end })
        .eq("id", row.id)
        .eq("status", "ACTIVE"); // guard: only flip if still ACTIVE (someone may have closed it between read and write)
      if (!updateErr) closedCount++;
    }

    if (bookingIds.length > 0) {
      await supabase.from("bookings").update({ status: "COMPLETED" }).in("id", bookingIds).eq("status", "IN_SESSION");
    }

    return closedCount;
  } catch {
    return 0;
  }
}
