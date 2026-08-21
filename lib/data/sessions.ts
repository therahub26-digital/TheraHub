import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SESSIONS as MOCK_SESSIONS, EXTENSION_REQUESTS as MOCK_EXTENSION_REQUESTS } from "@/lib/mock/ops";
import { toHHMM, nowIso, minutesBetween } from "@/lib/wallclock";
import type { SessionRec, ExtensionRequest } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for "sessions" — the module after bookings
// in the Fase 5 migration order. A session is the actual treatment: it
// starts when the therapist begins, ends when they finish, and is what
// the POS eventually bills against.
//
// FALLBACK RULE — the important part, same as lib/data/bookings.ts and
// for the same reason: the mock-fallback trigger is "no authenticated
// session", NOT "zero rows". A real logged-in manager can legitimately
// have zero sessions (nobody on a table right now — the normal state most
// of the day), and showing them ~40 fabricated in-progress treatments
// with invented guest names would be actively misleading. Empty is the
// honest answer for a real session; mock data is only for the anonymous
// "Ganti Role" demo viewer.
//
// DERIVED-AT-READ-TIME FIELDS — deliberately not stored:
//   - `ENDING_SOON` is not written to the database. The DB only ever
//     holds NOT_STARTED / ACTIVE / COMPLETED / VOID (real state changes,
//     each caused by someone pressing a button). "Ending soon" is purely
//     a function of the clock, so storing it would require a cron job
//     flipping rows every minute just to keep a derived value fresh —
//     and any row it failed to update would be silently stale. Computed
//     here instead, so it is always correct the instant it is read.
//   - `minutesRemaining` / `progressPct` likewise: computed from
//     actual_start / expected_end against the current wall clock.
//
// All clock math goes through lib/wallclock.ts — see that file's header
// for why `new Date().toISOString()` must never be used here (it would be
// 7 hours adrift from every timestamp the booking form writes).
// ---------------------------------------------------------------------

/** Minutes remaining at or below this shows the session as "about to end". */
const ENDING_SOON_THRESHOLD_MIN = 10;

type SessionRow = {
  id: string;
  booking_id: string;
  outlet_id: string;
  therapist_id: string | null;
  room_id: string | null;
  purchased_duration_min: number;
  actual_start: string | null;
  expected_end: string | null;
  actual_end: string | null;
  extension_minutes: number;
  status: string;
};

type SessionLookups = {
  bookings: Map<string, { code: string; customerId: string; packageId: string }>;
  customers: Map<string, string>;
  employees: Map<string, string>;
  rooms: Map<string, string>;
  packages: Map<string, string>;
};

function mapSessionRow(row: SessionRow, lookups: SessionLookups, now: string): SessionRec {
  const booking = lookups.bookings.get(row.booking_id);
  const storedStatus = row.status as SessionRec["status"];

  // Only a genuinely running session has a meaningful countdown. Anything
  // completed/void/not-yet-started reports 0 remaining and 100%/0% rather
  // than a stale or negative number leaking into the progress bars.
  const running = storedStatus === "ACTIVE" && !!row.actual_start && !!row.expected_end;

  let minutesRemaining = 0;
  let progressPct = storedStatus === "COMPLETED" ? 100 : 0;
  let status: SessionRec["status"] = storedStatus;

  if (running) {
    const start = row.actual_start!;
    const end = row.expected_end!;
    minutesRemaining = Math.max(Math.round(minutesBetween(now, end)), 0);
    const total = minutesBetween(start, end);
    const elapsed = minutesBetween(start, now);
    progressPct = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;
    if (minutesRemaining <= ENDING_SOON_THRESHOLD_MIN) status = "ENDING_SOON";
  }

  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingCode: booking?.code ?? "",
    outletId: row.outlet_id,
    customerName: (booking && lookups.customers.get(booking.customerId)) ?? "(tamu tidak ditemukan)",
    therapistId: row.therapist_id ?? "",
    therapistName: (row.therapist_id && lookups.employees.get(row.therapist_id)) ?? "",
    roomName: (row.room_id && lookups.rooms.get(row.room_id)) ?? "",
    packageName: (booking && lookups.packages.get(booking.packageId)) ?? "",
    purchasedDurationMin: row.purchased_duration_min,
    // Day the treatment happened, taken from the start timestamp itself
    // rather than "today", so a session that ran yesterday stays filed
    // under yesterday.
    date: row.actual_start ? row.actual_start.slice(0, 10) : "",
    actualStart: toHHMM(row.actual_start),
    expectedEnd: toHHMM(row.expected_end),
    actualEnd: row.actual_end ? toHHMM(row.actual_end) : null,
    extensionMinutes: row.extension_minutes,
    status,
    minutesRemaining,
    progressPct,
  };
}

async function fetchLiveSessions(): Promise<SessionRec[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo/"Ganti Role" viewer -> mock. See header.

  const { data: rows, error } = await supabase.from("sessions").select("*").order("actual_start");
  if (error) return null;
  if (!rows || rows.length === 0) return []; // real session, genuinely no treatments — honest empty

  const sessionRows = rows as SessionRow[];
  const bookingIds = [...new Set(sessionRows.map((r) => r.booking_id))];
  const employeeIds = [...new Set(sessionRows.map((r) => r.therapist_id).filter((v): v is string => !!v))];
  const roomIds = [...new Set(sessionRows.map((r) => r.room_id).filter((v): v is string => !!v))];

  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("id, code, customer_id, package_id")
    .in("id", bookingIds);

  const customerIds = [...new Set((bookingRows ?? []).map((b) => b.customer_id))];
  const packageIds = [...new Set((bookingRows ?? []).map((b) => b.package_id))];

  const [{ data: customerRows }, { data: employeeRows }, { data: roomRows }, { data: packageRows }] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : Promise.resolve({ data: [] }),
    employeeIds.length ? supabase.from("employees").select("id, name").in("id", employeeIds) : Promise.resolve({ data: [] }),
    roomIds.length ? supabase.from("rooms").select("id, name").in("id", roomIds) : Promise.resolve({ data: [] }),
    packageIds.length ? supabase.from("service_packages").select("id, name").in("id", packageIds) : Promise.resolve({ data: [] }),
  ]);

  const lookups: SessionLookups = {
    bookings: new Map((bookingRows ?? []).map((b) => [b.id, { code: b.code, customerId: b.customer_id, packageId: b.package_id }])),
    customers: new Map((customerRows ?? []).map((c) => [c.id, c.name])),
    employees: new Map((employeeRows ?? []).map((e) => [e.id, e.name])),
    rooms: new Map((roomRows ?? []).map((r) => [r.id, r.name])),
    packages: new Map((packageRows ?? []).map((p) => [p.id, p.name])),
  };

  const now = nowIso();
  return sessionRows.map((row) => mapSessionRow(row, lookups, now));
}

const loadSessionsData = cache(async () => {
  const live = await fetchLiveSessions();
  // Explicit `!== null` on purpose: `[]` is truthy in JS, and telling the
  // two kinds of "empty" apart (no session vs. no treatments) is the
  // entire point of this check. Same landmine as lib/data/bookings.ts.
  if (live !== null) return { sessions: live, live: true };
  return { sessions: MOCK_SESSIONS, live: false };
});

export async function isLiveSessionsData(): Promise<boolean> {
  return (await loadSessionsData()).live;
}

export async function getSessionsForOutlet(outletId: string, date?: string): Promise<SessionRec[]> {
  const { sessions } = await loadSessionsData();
  return sessions.filter((s) => s.outletId === outletId && (!date || s.date === date));
}

/** Sessions currently on a table — what the monitor screens are actually for. */
export async function getActiveSessionsForOutlet(outletId: string): Promise<SessionRec[]> {
  return (await getSessionsForOutlet(outletId)).filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
}

export async function getSessionForTherapist(therapistId: string): Promise<SessionRec | undefined> {
  const { sessions } = await loadSessionsData();
  return sessions.find((s) => s.therapistId === therapistId && (s.status === "ACTIVE" || s.status === "ENDING_SOON"));
}

// ------------------------------------------------------------------
// Extension requests (mid-session "add 30 more minutes" asks).
//
// There is no write path for these yet — the therapist app's "Ajukan
// Extension" button is still presentational. So in live mode this
// correctly returns an empty list rather than mock requests: showing a
// real manager fabricated approvals to action would be the same class of
// bug as the fake-bookings one this layer's fallback rule exists to
// prevent. The read layer is built now so the UI is already wired when
// the write path lands.
// ------------------------------------------------------------------

type ExtensionRequestRow = {
  id: string;
  session_id: string;
  extension_id: string;
  requested_at: string;
  status: string;
  conflict_check: string;
  reason: string | null;
};

async function fetchLiveExtensionRequests(sessions: SessionRec[]): Promise<ExtensionRequest[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase.from("extension_requests").select("*").order("requested_at");
  if (error) return null;
  if (!rows || rows.length === 0) return [];

  const requestRows = rows as ExtensionRequestRow[];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const extensionIds = [...new Set(requestRows.map((r) => r.extension_id))];

  const { data: extensionRows } = await supabase
    .from("extension_options")
    .select("id, name, duration_min, price")
    .in("id", extensionIds);
  const extensions = new Map((extensionRows ?? []).map((e) => [e.id, e]));

  return requestRows.map((row) => {
    const session = sessionById.get(row.session_id);
    const ext = extensions.get(row.extension_id);
    return {
      id: row.id,
      sessionId: row.session_id,
      bookingCode: session?.bookingCode ?? "",
      therapistName: session?.therapistName ?? "",
      customerName: session?.customerName ?? "",
      roomName: session?.roomName ?? "",
      extensionId: row.extension_id,
      extensionName: ext?.name ?? "",
      durationMin: ext?.duration_min ?? 0,
      price: Number(ext?.price ?? 0),
      requestedAt: row.requested_at,
      status: row.status as ExtensionRequest["status"],
      conflictCheck: row.conflict_check as ExtensionRequest["conflictCheck"],
      reason: row.reason ?? undefined,
    };
  });
}

export async function getExtensionRequestsForOutlet(outletId: string): Promise<ExtensionRequest[]> {
  const { sessions, live } = await loadSessionsData();
  if (!live) return MOCK_EXTENSION_REQUESTS;
  const outletSessions = sessions.filter((s) => s.outletId === outletId);
  const requests = await fetchLiveExtensionRequests(outletSessions);
  if (requests === null) return MOCK_EXTENSION_REQUESTS;
  const outletSessionIds = new Set(outletSessions.map((s) => s.id));
  return requests.filter((r) => outletSessionIds.has(r.sessionId));
}
