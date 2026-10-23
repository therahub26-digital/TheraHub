import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SESSIONS as MOCK_SESSIONS, EXTENSION_REQUESTS as MOCK_EXTENSION_REQUESTS } from "@/lib/mock/ops";
import { toHHMM, nowIso, minutesBetween, todayIsoDate } from "@/lib/wallclock";
import type { SessionRec, ExtensionRequest } from "@/lib/types";
import { sweepOverdueSessions } from "@/lib/data/sessionOverrunSweep";
import { getAuthUser } from "@/lib/supabase/authUser";
import { fetchAllRows, selectInChunks } from "@/lib/supabase/paginate";

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
  bookings: Map<string, { code: string; customerId: string; packageId: string; status: string }>;
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

  let overdueMin = 0;
  if (running) {
    const start = row.actual_start!;
    const end = row.expected_end!;
    minutesRemaining = Math.max(Math.round(minutesBetween(now, end)), 0);
    // Unclamped, unlike minutesRemaining above — see the field's doc
    // comment on SessionRec. A session on time or not yet due gets 0.
    overdueMin = Math.max(Math.round(minutesBetween(end, now)), 0);
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
    expectedEndIso: running ? row.expected_end : null,
    actualEnd: row.actual_end ? toHHMM(row.actual_end) : null,
    extensionMinutes: row.extension_minutes,
    // Billed-ness lives on the booking, not the session — see the
    // SessionRec.isPaid comment in lib/types.ts.
    isPaid: booking?.status === "PAID",
    status,
    minutesRemaining,
    progressPct,
    overdueMin,
  };
}

// Audit performa 2026-10-23: dulu SELURUH riwayat sesi tenant dimuat di
// setiap request (Royal Spa ±2.000 sesi + lookup booking/customer) hanya
// untuk menampilkan sesi hari ini atau yang sedang berjalan. Sekarang
// filter outlet/tanggal/terapis/status dijalankan di database dan di-cache
// per kombinasi filter dalam satu request. Fallback mock tidak berubah.

const isLiveSession = cache(async (): Promise<boolean> => {
  const {
    data: { user },
  } = await getAuthUser();
  return user !== null;
});

// Session overrun sweep (2026-08-23) — lihat lib/data/sessionOverrunSweep.ts.
// Sekali per request, sama seperti sweep no-show di bookings.ts.
const sweepOverdueOnce = cache(async (): Promise<void> => {
  const supabase = await createClient();
  await sweepOverdueSessions(supabase);
});

const SESSION_COLUMNS =
  "id, booking_id, outlet_id, therapist_id, room_id, purchased_duration_min, actual_start, expected_end, actual_end, extension_minutes, status";

async function fetchLiveSessions(
  outletId: string | null,
  fromDate: string | null,
  toDateExcl: string | null,
  therapistId: string | null,
  activeOnly: boolean,
): Promise<SessionRec[]> {
  const supabase = await createClient();
  await sweepOverdueOnce();

  // Anti-truncation (2026-10-21) — sama seperti bookings.ts.
  // Tanggal sesi = tanggal actual_start (bingkai wallclock, offset +00:00).
  const { rows, error } = await fetchAllRows<SessionRow>((from, to) => {
    let query = supabase.from("sessions").select(SESSION_COLUMNS);
    if (outletId) query = query.eq("outlet_id", outletId);
    if (therapistId) query = query.eq("therapist_id", therapistId);
    if (activeOnly) query = query.eq("status", "ACTIVE");
    if (fromDate) query = query.gte("actual_start", `${fromDate}T00:00:00+00:00`);
    if (toDateExcl) query = query.lt("actual_start", `${toDateExcl}T00:00:00+00:00`);
    return Promise.resolve(query.order("actual_start").order("id").range(from, to));
  });
  if (error || !rows || rows.length === 0) return [];

  const sessionRows = rows;
  const bookingIds = [...new Set(sessionRows.map((r) => r.booking_id))];
  const employeeIds = [...new Set(sessionRows.map((r) => r.therapist_id).filter((v): v is string => !!v))];
  const roomIds = [...new Set(sessionRows.map((r) => r.room_id).filter((v): v is string => !!v))];

  const { data: bookingRows } = await selectInChunks<{ id: string; code: string; customer_id: string; package_id: string; status: string }>(
    bookingIds,
    (c, f, t) => supabase.from("bookings").select("id, code, customer_id, package_id, status").in("id", c).order("id").range(f, t)
  );

  const customerIds = [...new Set((bookingRows ?? []).map((b) => b.customer_id))];
  const packageIds = [...new Set((bookingRows ?? []).map((b) => b.package_id))];

  const [{ data: customerRows }, { data: employeeRows }, { data: roomRows }, { data: packageRows }] = await Promise.all([
    selectInChunks<{ id: string; name: string }>(customerIds, (c, f, t) => supabase.from("customers").select("id, name").in("id", c).order("id").range(f, t)),
    employeeIds.length ? supabase.from("employees").select("id, name").in("id", employeeIds) : Promise.resolve({ data: [] }),
    roomIds.length ? supabase.from("rooms").select("id, name").in("id", roomIds) : Promise.resolve({ data: [] }),
    packageIds.length ? supabase.from("service_packages").select("id, name").in("id", packageIds) : Promise.resolve({ data: [] }),
  ]);

  const lookups: SessionLookups = {
    bookings: new Map((bookingRows ?? []).map((b) => [b.id, { code: b.code, customerId: b.customer_id, packageId: b.package_id, status: b.status }])),
    customers: new Map((customerRows ?? []).map((c) => [c.id, c.name])),
    employees: new Map((employeeRows ?? []).map((e) => [e.id, e.name])),
    rooms: new Map((roomRows ?? []).map((r) => [r.id, r.name])),
    packages: new Map((packageRows ?? []).map((p) => [p.id, p.name])),
  };

  const now = nowIso();
  return sessionRows.map((row) => mapSessionRow(row, lookups, now));
}

const isRunning = (s: SessionRec) => s.status === "ACTIVE" || s.status === "ENDING_SOON";

/** Satu pintu baca sesi; argumen primitif supaya cache() menyatukan pemanggilan yang sama. */
const loadSessions = cache(
  async (
    outletId: string | null,
    fromDate: string | null,
    toDateExcl: string | null,
    therapistId: string | null,
    activeOnly: boolean,
  ): Promise<SessionRec[]> => {
    if (!(await isLiveSession())) {
      return MOCK_SESSIONS.filter(
        (s) =>
          (!outletId || s.outletId === outletId) &&
          (!therapistId || s.therapistId === therapistId) &&
          (!activeOnly || isRunning(s)) &&
          (!fromDate || s.date >= fromDate) &&
          (!toDateExcl || s.date < toDateExcl),
      );
    }
    return fetchLiveSessions(outletId, fromDate, toDateExcl, therapistId, activeOnly);
  },
);

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function isLiveSessionsData(): Promise<boolean> {
  return isLiveSession();
}

/** Sesi satu outlet; dengan `date` hanya hari itu. Tanpa `date` = seluruh riwayat (hindari). */
export async function getSessionsForOutlet(outletId: string, date?: string): Promise<SessionRec[]> {
  return date ? loadSessions(outletId, date, nextDay(date), null, false) : loadSessions(outletId, null, null, null, false);
}

/** Sessions currently on a table — what the monitor screens are actually for. */
export async function getActiveSessionsForOutlet(outletId: string): Promise<SessionRec[]> {
  return (await loadSessions(outletId, null, null, null, true)).filter(isRunning);
}

export async function getSessionForTherapist(therapistId: string): Promise<SessionRec | undefined> {
  return (await loadSessions(null, null, null, therapistId, true)).find(isRunning);
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
  } = await getAuthUser();
  if (!user) return null;

  const sessionIds = sessions.map((x) => x.id);
  if (!sessionIds.length) return [];
  const { data: rows, error } = await selectInChunks<ExtensionRequestRow>(sessionIds, (c, f, t) =>
    supabase.from("extension_requests").select("*").in("session_id", c).order("requested_at").order("id").range(f, t)
  );
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
  if (!(await isLiveSession())) return MOCK_EXTENSION_REQUESTS;
  // Permintaan perpanjangan hanya relevan untuk sesi kemarin–hari ini dan
  // yang masih berjalan (audit 2026-10-23: dulu memindai seluruh riwayat).
  const today = todayIsoDate();
  const yesterday = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const [recent, active] = await Promise.all([
    loadSessions(outletId, yesterday, nextDay(today), null, false),
    loadSessions(outletId, null, null, null, true),
  ]);
  const outletSessions = [...new Map([...recent, ...active].map((x) => [x.id, x])).values()];
  const requests = await fetchLiveExtensionRequests(outletSessions);
  if (requests === null) return MOCK_EXTENSION_REQUESTS;
  const outletSessionIds = new Set(outletSessions.map((s) => s.id));
  return requests.filter((r) => outletSessionIds.has(r.sessionId));
}
