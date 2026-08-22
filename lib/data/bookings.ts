import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { BOOKINGS as MOCK_BOOKINGS } from "@/lib/mock/ops";
import { TODAY as MOCK_TODAY, NOW_HHMM as MOCK_NOW_HHMM } from "@/lib/mock/rng";
import type { Booking } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for "bookings" — same pattern as the other
// lib/data/* modules. The real `bookings` table is (correctly) empty
// right now: Amethyst has no real booking history yet, this is the
// prerequisite plumbing so booking pages read from Supabase once real
// bookings start coming in, not seeded/fabricated booking rows. See the
// roadmap doc for why bookings were NOT seeded with example data (unlike
// the 10 example customers) — creating fake operational history is a
// different, riskier kind of placeholder than fake identity/catalog rows,
// and the previous round's "stub package mixed with real data" bug is a
// direct reason to be more careful here, not less.
//
// TWO FORMAT MISMATCHES vs the mock data that are easy to get wrong and
// have been handled explicitly below:
//   1. `bookings.scheduled_start`/`scheduled_end` are real Postgres
//      `timestamptz` columns, but every mock Booking (lib/mock/ops.ts)
//      stores them as plain "HH:mm" strings and the UI's `toMin()` helper
//      (lib/format.ts) only parses "HH:mm" — it does NOT handle full ISO
//      timestamps. So live rows are converted to "HH:mm" here at the data
//      layer, not left as raw timestamps, or `toMin()` would silently
//      return NaN and break the calendar view. NOTE: this extracts the
//      UTC wall-clock digits, not a timezone-correct local conversion —
//      the app has no real timezone handling yet (out of scope here).
//   2. `customerName`/`therapistName`/`roomName`/`packageName` are
//      denormalized convenience fields on the mock Booking type, but the
//      real `bookings` table only stores foreign keys — this layer joins
//      against customers/employees/rooms/service_packages to reconstruct
//      them.
// ---------------------------------------------------------------------

type BookingRow = {
  id: string;
  code: string;
  outlet_id: string;
  customer_id: string;
  therapist_id: string | null;
  room_id: string | null;
  package_id: string;
  duration_min: number;
  price: number | string;
  date: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  source: string;
  notes: string | null;
  add_on_ids: string[] | null;
  created_at: string;
};

/** "2026-08-20T07:00:00+00:00" -> "07:00". Plain "07:00" passes through unchanged. */
function toHHMM(timestamptzOrHHMM: string): string {
  if (!timestamptzOrHHMM.includes("T")) return timestamptzOrHHMM;
  return timestamptzOrHHMM.split("T")[1].slice(0, 5);
}

async function mapBookingRow(
  row: BookingRow,
  lookups: {
    customers: Map<string, { name: string; phone: string }>;
    employees: Map<string, string>;
    rooms: Map<string, string>;
    packages: Map<string, string>;
    addOns: Map<string, string>;
  }
): Promise<Booking> {
  const cust = lookups.customers.get(row.customer_id);
  return {
    id: row.id,
    code: row.code,
    outletId: row.outlet_id,
    customerId: row.customer_id,
    customerName: cust?.name ?? "(customer tidak ditemukan)",
    customerPhone: cust?.phone ?? "",
    therapistId: row.therapist_id ?? "",
    therapistName: (row.therapist_id && lookups.employees.get(row.therapist_id)) ?? "",
    roomId: row.room_id ?? "",
    roomName: (row.room_id && lookups.rooms.get(row.room_id)) ?? "",
    packageId: row.package_id,
    packageName: lookups.packages.get(row.package_id) ?? "",
    durationMin: row.duration_min,
    price: Number(row.price),
    date: row.date,
    scheduledStart: toHHMM(row.scheduled_start),
    scheduledEnd: toHHMM(row.scheduled_end),
    status: row.status as Booking["status"],
    source: row.source as Booking["source"],
    notes: row.notes ?? undefined,
    addOns: (row.add_on_ids ?? []).map((id) => lookups.addOns.get(id) ?? id),
    createdAt: row.created_at,
  };
}

async function fetchLiveBookings(): Promise<Booking[] | null> {
  const supabase = await createClient();

  // IMPORTANT — different fallback rule than lib/data/outlets.ts /
  // employees.ts / catalog.ts: those fall back to mock on an EMPTY result,
  // which works there because dev-seed guarantees those tables are never
  // actually empty for a real authenticated session (only an anonymous/demo
  // "Ganti Role" viewer sees 0 rows, via RLS default-deny). Bookings are
  // different: a real logged-in kasir/manager can correctly have ZERO real
  // bookings for a long time (Amethyst has no real booking history yet) —
  // that is a true, honest state, not a signal to fall back to ~500
  // fabricated mock bookings. Falling back on row-count alone would show a
  // real, authenticated staff member fictional customers and fictional
  // revenue, which is worse than an empty table. So here the fallback
  // trigger is "no authenticated session" specifically, not "no rows".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase.from("bookings").select("*").order("date").order("scheduled_start");
  if (error) return null;
  if (!rows || rows.length === 0) return []; // real session, genuinely zero bookings — NOT a mock-fallback trigger

  const bookingRows = rows as BookingRow[];
  const customerIds = [...new Set(bookingRows.map((r) => r.customer_id))];
  const employeeIds = [...new Set(bookingRows.map((r) => r.therapist_id).filter((v): v is string => !!v))];
  const roomIds = [...new Set(bookingRows.map((r) => r.room_id).filter((v): v is string => !!v))];
  const packageIds = [...new Set(bookingRows.map((r) => r.package_id))];
  const addOnIds = [...new Set(bookingRows.flatMap((r) => r.add_on_ids ?? []))];

  const [{ data: customerRows }, { data: employeeRows }, { data: roomRows }, { data: packageRows }, { data: addOnRows }] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name, phone").in("id", customerIds) : Promise.resolve({ data: [] }),
    employeeIds.length ? supabase.from("employees").select("id, name").in("id", employeeIds) : Promise.resolve({ data: [] }),
    roomIds.length ? supabase.from("rooms").select("id, name").in("id", roomIds) : Promise.resolve({ data: [] }),
    packageIds.length ? supabase.from("service_packages").select("id, name").in("id", packageIds) : Promise.resolve({ data: [] }),
    addOnIds.length ? supabase.from("add_ons").select("id, name").in("id", addOnIds) : Promise.resolve({ data: [] }),
  ]);

  const lookups = {
    customers: new Map((customerRows ?? []).map((c) => [c.id, { name: c.name, phone: c.phone }])),
    employees: new Map((employeeRows ?? []).map((e) => [e.id, e.name])),
    rooms: new Map((roomRows ?? []).map((r) => [r.id, r.name])),
    packages: new Map((packageRows ?? []).map((p) => [p.id, p.name])),
    addOns: new Map((addOnRows ?? []).map((a) => [a.id, a.name])),
  };

  return Promise.all(bookingRows.map((row) => mapBookingRow(row, lookups)));
}

const loadBookingsData = cache(async () => {
  const live = await fetchLiveBookings();
  // null = no authenticated session (demo/"Ganti Role" viewer) -> mock.
  // [] (or more) = real session, real (possibly zero) bookings -> live.
  // Explicit !== null check on purpose — an empty array is truthy in JS,
  // but relying on that here would be a landmine for whoever edits this
  // next, given the whole point of this file is telling those two "empty"
  // cases apart. See the comment in fetchLiveBookings() for why.
  if (live !== null) return { bookings: live, live: true };
  return { bookings: MOCK_BOOKINGS, live: false };
});

export async function isLiveBookingsData(): Promise<boolean> {
  return (await loadBookingsData()).live;
}

/**
 * "Today" for display purposes: the mock data is generated around a fixed
 * demo date (lib/mock/rng's TODAY, 2026-08-18) so mock mode keeps using
 * that for internal consistency with the rest of the still-mock app. Live
 * mode uses the real current date — a live booking page for a real spa
 * must show the actual day, not a frozen demo date.
 */
export async function getEffectiveToday(): Promise<string> {
  const live = await isLiveBookingsData();
  if (!live) return MOCK_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Same live/mock split as getEffectiveToday(), for the current wall-clock time-of-day. */
export async function getEffectiveNow(): Promise<string> {
  const live = await isLiveBookingsData();
  if (!live) return MOCK_NOW_HHMM;
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function getBookingsForOutlet(outletId: string, date?: string): Promise<Booking[]> {
  const { bookings } = await loadBookingsData();
  return bookings.filter((b) => b.outletId === outletId && (!date || b.date === date));
}

/**
 * A single customer's own bookings, across EVERY outlet they've visited —
 * unlike getBookingsForOutlet(), not scoped to one outlet, because
 * `customers` (and therefore a customer's own history) isn't tied to one
 * outlet either (see lib/data/customers.ts's file header). Added
 * 2026-08-22 for the customer portal (/customer/history, /customer/page
 * "upcoming booking" card, getCurrentCustomer()'s visit-history math).
 *
 * Same live/mock split as every other getter here: in live mode this is
 * already RLS-scoped to the signed-in customer's own rows
 * (bookings_customer policy), so filtering by customerId here is a
 * belt-and-suspenders no-op for the live case — it matters for mock mode,
 * where MOCK_BOOKINGS has every demo customer's rows mixed together.
 */
export async function getBookingsForCustomer(customerId: string): Promise<Booking[]> {
  const { bookings } = await loadBookingsData();
  return bookings.filter((b) => b.customerId === customerId);
}

export async function getBookingsToday(outletId: string): Promise<Booking[]> {
  const today = await getEffectiveToday();
  return getBookingsForOutlet(outletId, today);
}

export async function getBookingKpi(outletId: string, date?: string) {
  const effectiveDate = date ?? (await getEffectiveToday());
  const list = await getBookingsForOutlet(outletId, effectiveDate);
  const paid = list.filter((b) => b.status === "PAID");
  const revenue = paid.reduce((s, b) => s + b.price, 0);
  const noShow = list.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = list.filter((b) => b.status === "CANCELLED").length;
  return {
    total: list.length,
    paid: paid.length,
    revenue,
    noShow,
    cancelled,
    noShowRate: list.length ? (noShow / list.length) * 100 : 0,
    guests: new Set(paid.map((b) => b.customerId)).size,
    avgTicket: paid.length ? revenue / paid.length : 0,
    sessions: list.filter((b) => ["PAID", "COMPLETED", "IN_SESSION"].includes(b.status)).length,
  };
}
