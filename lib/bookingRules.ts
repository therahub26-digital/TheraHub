// ---------------------------------------------------------------------
// The three booking time rules, in ONE place — added 2026-08-23 from
// user feedback after live-testing the kasir Today screen:
//
//   1. "booking hanya bisa dilakukan lebih dari jam berjalan, tidak
//      mungkin waktu yg sudah lewat"
//   2. "budi bisa minta ganti jadwal atau therapis minimal 1 jam
//      sebelumnya ... kasir akan mendapatkan notifikasi juga dan
//      menghubungi budi secara manual via wa"
//   3. "jam booking yang sudah lewat otomatis akan dibatalkan oleh
//      sistem jika tidak check in"
//
// These live here rather than inline in each caller because the same
// three thresholds are enforced in four different layers that must not
// drift apart: the customer's booking form (client), both createBooking
// server actions, the no-show sweep, and the kasir follow-up banner. A
// grace period that means 15 minutes in one place and 30 in another is
// the kind of bug that only shows up as an angry guest.
//
// This module is deliberately CLIENT-SAFE — it imports only from
// lib/wallclock.ts (pure date math, no next/headers, no Supabase), so
// "use client" components can import it directly. Do not add a server
// import here; see lib/constants/expenseCategories.ts's header for what
// happens when a client component pulls in a server-only module.
//
// EVERY timestamp argument below must come from lib/wallclock.ts's
// convention (wall-clock stored as UTC). Passing a real
// `new Date().toISOString()` in would be off by the outlet's UTC offset
// and silently answer every question here wrongly by 7 hours.
// ---------------------------------------------------------------------

import { minutesBetween, nowIso, plusMinutes, wallClockIso } from "@/lib/wallclock";

/**
 * Rule 3. How long after its scheduled start a booking that never
 * checked in survives before the system marks it NO_SHOW. Chosen by the
 * user (2026-08-23) over 30/60-minute alternatives: Amethyst would
 * rather free the therapist's slot for a walk-in than hold it for a
 * guest who is already a quarter of an hour late without calling.
 */
export const NO_SHOW_GRACE_MIN = 15;

/**
 * Rule 2. How far ahead of the appointment a guest may still change it
 * themselves (reschedule / swap therapist / cancel in the app). Inside
 * this window the change stops being self-service and becomes a phone
 * call: the kasir already has the room, the therapist's day, and often
 * the guest's travel plans in flight.
 */
export const GUEST_CHANGE_CUTOFF_MIN = 60;

/**
 * Rule 2, kasir side. How far ahead of an unconfirmed booking the kasir
 * is prompted to reach out. Deliberately equal to
 * GUEST_CHANGE_CUTOFF_MIN: the moment the guest loses the ability to
 * change it themselves is exactly the moment a human should be checking
 * that they are actually coming.
 */
export const KASIR_REMINDER_LEAD_MIN = GUEST_CHANGE_CUTOFF_MIN;

/**
 * Rule 3. Bookings whose scheduled_start is at or before this instant,
 * and which never checked in, are no-shows. Callers compare against
 * `scheduled_start` with `<=` so a booking is swept exactly
 * NO_SHOW_GRACE_MIN after its start, not a minute later.
 */
export function noShowCutoffIso(now: string = nowIso()): string {
  return plusMinutes(now, -NO_SHOW_GRACE_MIN);
}

/** Minutes from now until `startIso`. Negative once the start has passed. */
export function minutesUntilStart(startIso: string, now: string = nowIso()): number {
  return minutesBetween(now, startIso);
}

/**
 * Rule 1. True when the requested slot is already in the past.
 *
 * Note this is `<`, not `<=`: a booking for the current minute is
 * allowed. That is not a rounding accident — it is what keeps the
 * kasir's "Booking Walk-in" flow working. A walk-in is recorded at the
 * moment the guest is standing at the counter, so its start time IS
 * "now"; rejecting it would break the most common front-desk action in
 * the name of a rule aimed at scheduling mistakes.
 */
export function isStartInPast(startIso: string, now: string = nowIso()): boolean {
  return startIso < now;
}

/**
 * Rule 2. Whether the guest may still change/cancel this booking from
 * the app. Bookings further out than the cutoff are freely editable;
 * inside the cutoff they belong to the outlet.
 */
export function guestCanStillChange(startIso: string, now: string = nowIso()): boolean {
  return minutesUntilStart(startIso, now) >= GUEST_CHANGE_CUTOFF_MIN;
}

/**
 * Rule 2, kasir side. Which of today's bookings the kasir should be
 * chasing right now: still merely BOOKED (never confirmed, never
 * arrived), starting within the lead window, and not yet past its own
 * no-show grace — once it is past that, the sweep owns it and there is
 * nothing left to confirm.
 */
export function needsKasirFollowUp(startIso: string, status: string, now: string = nowIso()): boolean {
  if (status !== "BOOKED") return false;
  const mins = minutesUntilStart(startIso, now);
  return mins <= KASIR_REMINDER_LEAD_MIN && mins > -NO_SHOW_GRACE_MIN;
}

/** One row of the staff follow-up banner. Plain data — crosses the server/client boundary. */
export type FollowUpItem = {
  id: string;
  time: string;
  customerName: string;
  customerPhone: string;
  therapistName: string;
  minutesUntil: number;
};

/** The minimum a booking has to expose to be considered for follow-up. */
export type FollowUpSource = {
  id: string;
  date: string;
  scheduledStart: string;
  status: string;
  customerName: string;
  customerPhone: string;
  therapistName: string;
};

/**
 * Turn today's bookings into the kasir/manager follow-up list, soonest
 * first. Lives here rather than in either page so /kasir and /manager
 * cannot drift into showing different guests.
 *
 * CALL THIS ONLY FOR LIVE DATA. In the demo "Ganti Role" view the
 * booking rows carry lib/mock/rng's frozen TODAY while nowIso() reads
 * the real wall clock, so the two are comparing different calendars and
 * every result would be meaningless.
 */
export function buildFollowUpList(bookings: FollowUpSource[], now: string = nowIso()): FollowUpItem[] {
  return bookings
    .filter((b) => needsKasirFollowUp(wallClockIso(b.date, b.scheduledStart), b.status, now))
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .map((b) => ({
      id: b.id,
      time: b.scheduledStart,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      therapistName: b.therapistName,
      minutesUntil: Math.round(minutesUntilStart(wallClockIso(b.date, b.scheduledStart), now)),
    }));
}
