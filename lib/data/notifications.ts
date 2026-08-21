import { createClient } from "@/lib/supabase/server";
import { THERAPIST_NOTIFICATIONS as MOCK_NOTIFICATIONS } from "@/lib/mock/finance";
import type { NotificationRec } from "@/lib/types";
import { getSessionForTherapist } from "@/lib/data/sessions";
import { getBookingsForOutlet, getEffectiveToday, getEffectiveNow } from "@/lib/data/bookings";
import { wallClockIso, minutesBetween } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Therapist notifications (2026-08-21): "alert sebelum bertugas dan sesi
// mau berakhir".
//
// Two DIFFERENT kinds of notification, on purpose:
//
//  1. ALERTS — computed here, at read time, exactly like SessionRec's
//     ENDING_SOON in lib/data/sessions.ts. There is no cron in this app
//     and this file does not add one: a "15 minutes before your booking
//     starts" alert that depended on a background job inserting a row
//     would go stale the instant that job missed a run. Instead it's
//     derived fresh on every page load from the same booking/session
//     data the rest of the app already reads — always correct, never
//     stale, never double-fired.
//  2. REAL notifications — actual rows in the `notifications` table
//     (recipient_id -> app_users). No code path writes these yet (same
//     honest gap as lib/data/sessions.ts's extension_requests read layer
//     before its write path existed) — so today this list is always
//     empty for a real login. Built now so the UI is ready the moment
//     something starts writing real notification rows (e.g. "extension
//     disetujui").
//
// Dual-mode like every other lib/data/*.ts: no session -> mock fixture.
// ---------------------------------------------------------------------

/** Alert fires once a booking/session is within this many minutes. */
const ALERT_WINDOW_MIN = 15;

async function getSignedInAppUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("app_users").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id ?? null;
}

type NotificationRow = {
  id: string;
  at: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  read: boolean;
  severity: string;
};

async function fetchRealNotifications(appUserId: string): Promise<NotificationRec[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", appUserId)
    .order("at", { ascending: false });
  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    at: row.at,
    type: row.type,
    title: row.title,
    body: row.body,
    channel: row.channel as NotificationRec["channel"],
    read: row.read,
    severity: row.severity as NotificationRec["severity"],
  }));
}

async function computeAlerts(therapistId: string, outletId: string): Promise<NotificationRec[]> {
  const [today, now, session] = await Promise.all([
    getEffectiveToday(),
    getEffectiveNow(),
    getSessionForTherapist(therapistId),
  ]);
  const nowInstant = wallClockIso(today, now);
  const alerts: NotificationRec[] = [];

  // ---- Sesi aktif mau berakhir (≤ 15 menit) ------------------------
  // Independent of SessionRec's own ENDING_SOON (10-minute UI threshold
  // for the progress bar) — this is a separate, confirmed 15-minute
  // therapist-facing alert.
  if (session && session.minutesRemaining > 0 && session.minutesRemaining <= ALERT_WINDOW_MIN) {
    alerts.push({
      id: `alert:session:${session.id}`,
      at: nowInstant,
      type: "session.ending",
      title: "Sesi akan berakhir",
      body: `${session.customerName} · ${session.minutesRemaining} menit lagi (estimasi selesai ${session.expectedEnd}).`,
      channel: "In-app",
      read: false,
      severity: "warning",
    });
  }

  // ---- Booking berikutnya mau mulai (≤ 15 menit, belum di-check-in) --
  // A therapist already mid-session doesn't need a "bersiap" nudge for
  // whatever's queued after — that's what "Job Berikutnya" already shows
  // on the session page once they finish this one.
  if (!session) {
    const bookings = await getBookingsForOutlet(outletId, today);
    for (const b of bookings) {
      if (b.therapistId !== therapistId) continue;
      if (!["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status)) continue;
      const startInstant = wallClockIso(b.date, b.scheduledStart);
      const minutesUntil = minutesBetween(nowInstant, startInstant);
      if (minutesUntil >= 0 && minutesUntil <= ALERT_WINDOW_MIN) {
        alerts.push({
          id: `alert:booking:${b.id}`,
          at: nowInstant,
          type: "shift.upcoming",
          title: "Bersiap — job berikutnya sebentar lagi",
          body: `${b.customerName} · ${b.packageName} mulai ${b.scheduledStart} (${Math.round(minutesUntil)} menit lagi).`,
          channel: "In-app",
          read: false,
          severity: "info",
        });
      }
    }
  }

  return alerts;
}

/**
 * Merges live alerts + real DB notifications for the signed-in
 * therapist, newest first. Callers must already know a real session
 * exists (see getSignedInTherapist() in lib/data/commissions.ts) — this
 * function does not itself fall back to mock, since "no session at all"
 * is handled by the page choosing MOCK_NOTIFICATIONS directly, matching
 * every other dual-mode page's pattern.
 */
export async function getNotificationsForTherapist(therapistId: string, outletId: string): Promise<NotificationRec[]> {
  const [appUserId, alerts] = await Promise.all([getSignedInAppUserId(), computeAlerts(therapistId, outletId)]);
  const real = appUserId ? await fetchRealNotifications(appUserId) : [];
  return [...alerts, ...real].sort((a, b) => b.at.localeCompare(a.at));
}

export { MOCK_NOTIFICATIONS };
