import { createClient } from "@/lib/supabase/server";
import { nowIso } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Added 2026-08-23 — user feedback: "tambahkan notifikasi untuk waktu
// bekerja saat kasir atau manager klik check in untuk siap2 dan ada
// bookingan baru". Two real triggers wanted: notify the assigned
// therapist when a NEW booking is created for them, and again when a
// kasir/manager checks that guest in (so the therapist gets a "get
// ready, guest has arrived" nudge instead of finding out only when they
// happen to refresh their job list).
//
// lib/data/notifications.ts already reads a `notifications` table and
// has read this exact gap in its own header comment since 2026-08-21:
// "No code path writes these yet". This is that write path — plain
// helper, NOT a Server Action itself (no "use server" here), so it can
// only ever run as a step inside an action that already is one
// (createBooking, checkInBooking) rather than being directly callable
// from the client.
//
// Requires migration 0019_notifications_insert_staff.sql (adds the
// missing INSERT policy on `notifications` — today's RLS only has
// SELECT/UPDATE "self" policies, so this insert will 42501/silently
// fail until that migration is applied). See that migration's header —
// it is a DRAFT, not yet applied, pending user approval per this
// project's standing rule on new schema/RLS changes.
// ---------------------------------------------------------------------

type NotifySeverity = "info" | "warning" | "danger";

export type NotifyInput = {
  type: string;
  title: string;
  body: string;
  severity?: NotifySeverity;
};

/**
 * Writes one real notification row for a therapist, resolving their
 * app_users.id from their employee id. Reuses the caller's own
 * `supabase` client (already the signed-in staff member — see
 * requireStaff()-style helpers in the calling action) so this never
 * escalates to the service-role client.
 *
 * Silently no-ops — never throws — if the therapist has no login
 * account yet (no app_users row) or if the insert itself fails (e.g.
 * migration 0019 not yet applied). A missed in-app nudge must never
 * break the booking/check-in action it's attached to; the primary
 * action's own error handling is what the user actually depends on.
 */
export async function notifyTherapist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  input: NotifyInput
): Promise<void> {
  try {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!appUser?.id) return;

    await supabase.from("notifications").insert({
      recipient_id: appUser.id,
      at: nowIso(),
      type: input.type,
      title: input.title,
      body: input.body,
      channel: "In-app",
      read: false,
      severity: input.severity ?? "info",
    });
  } catch {
    // best-effort — see header
  }
}
