import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Booking } from "@/lib/types";
import { getBookingsForOutlet, getBookingsForCustomer } from "@/lib/data/bookings";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for "customers" — same pattern as the
// other lib/data/* modules. Deliberately MINIMAL right now: the real
// `customers` table only has identity/segment/membership fields (see
// supabase/migrations/0001_init.sql). It has NO visit-history columns
// (visitCount, lifetimeSpend, avgTicket, firstVisit, lastVisit,
// favoriteTherapist, favoriteService) because those are all derived from
// real bookings/transactions, which don't exist yet (booking module is
// still in progress). So this layer intentionally does NOT try to
// reconstruct those analytics fields for live customers — any page that
// needs them (e.g. app/manager/customers/page.tsx) stays on
// lib/mock/people.ts's CUSTOMERS until the booking/transaction modules
// are migrated and those numbers can be computed for real.
//
// UPDATE 2026-08-22: bookings ARE migrated now (lib/data/bookings.ts),
// so getCustomersForOutlet() below computes the visit-history fields
// from real PAID bookings instead of leaving the whole page on mock.
// `segment`/`membership` themselves are NOT recomputed from that
// history — they're real stored columns on `customers` (presumably set
// by an admin/CRM process), independent of what this outlet's own
// booking history shows. That can genuinely disagree — a customer
// flagged VIP tenant-wide might show 0 visits at THIS outlet if they
// mostly visit a different one — which is correct, not a bug: this page
// is scoped to one outlet's activity, segment is a tenant-wide label.
// ---------------------------------------------------------------------

type CustomerRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email: string | null;
  segment: string;
  membership: string;
  prepaid_balance: number | string;
  loyalty_points: number;
  marketing_consent: boolean;
  notes: string | null;
  avatar_tone: string;
};

/** Partial Customer — visit-history fields are not sourced from the DB yet, see file header. */
type LiveCustomer = Pick<
  Customer,
  "id" | "tenantId" | "name" | "phone" | "email" | "segment" | "membership" | "prepaidBalance" | "loyaltyPoints" | "marketingConsent" | "notes" | "avatarTone"
>;

function mapCustomer(row: CustomerRow): LiveCustomer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? "",
    segment: row.segment as Customer["segment"],
    membership: row.membership as Customer["membership"],
    prepaidBalance: Number(row.prepaid_balance),
    loyaltyPoints: row.loyalty_points,
    marketingConsent: row.marketing_consent,
    notes: row.notes ?? "",
    avatarTone: row.avatar_tone,
  };
}

async function fetchLiveCustomers(): Promise<LiveCustomer[] | null> {
  const supabase = await createClient();
  // Same fallback rule as lib/data/bookings.ts and for the same reason:
  // "no rows" isn't necessarily "no session" for a table that can be
  // legitimately empty for a real tenant — check for an authenticated
  // session explicitly rather than inferring it from row count.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("customers").select("*").order("name");
  if (error) return null;
  if (!data) return [];
  return (data as CustomerRow[]).map(mapCustomer);
}

const loadCustomersData = cache(async () => {
  const live = await fetchLiveCustomers();
  // Explicit !== null (not truthy) check — an empty array is a valid live
  // result and is truthy in JS, see the comment in fetchLiveCustomers().
  if (live !== null) return { customers: live, live: true };
  return { customers: null, live: false };
});

/** Live customers only (identity fields, no visit-history analytics) — null while still on mock/demo data. */
export async function getLiveCustomers(): Promise<LiveCustomer[] | null> {
  return (await loadCustomersData()).customers;
}

export async function isLiveCustomersData(): Promise<boolean> {
  return (await loadCustomersData()).live;
}

/** Most-frequent key in a tally map; "" if the map is empty (no favorite yet). */
function topKey(counts: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------
// UPDATE 2026-08-22: shared by getCustomersForOutlet() (below, one
// outlet's worth of PAID bookings) and getCurrentCustomer() (the
// customer-portal side, added this same update — a customer's own
// history spans every outlet they've visited, not just one, since
// `customers` has no outlet_id — see the file-level comment). Both need
// the exact same visitCount/lifetimeSpend/avgTicket/first-last-
// visit/favorite-therapist/favorite-service math, so it's factored out
// once here instead of duplicated.
// ---------------------------------------------------------------------
function aggregateHistory(bookings: Booking[]): Pick<Customer, "visitCount" | "lifetimeSpend" | "avgTicket" | "firstVisit" | "lastVisit" | "favoriteTherapist" | "favoriteService"> {
  const paid = bookings.filter((b) => b.status === "PAID");
  let visitCount = 0;
  let lifetimeSpend = 0;
  let firstVisit = "";
  let lastVisit = "";
  const therapistCounts = new Map<string, number>();
  const serviceCounts = new Map<string, number>();

  for (const b of paid) {
    visitCount += 1;
    lifetimeSpend += b.price;
    if (!firstVisit || b.date < firstVisit) firstVisit = b.date;
    if (!lastVisit || b.date > lastVisit) lastVisit = b.date;
    if (b.therapistName) therapistCounts.set(b.therapistName, (therapistCounts.get(b.therapistName) ?? 0) + 1);
    if (b.packageName) serviceCounts.set(b.packageName, (serviceCounts.get(b.packageName) ?? 0) + 1);
  }

  return {
    visitCount,
    lifetimeSpend,
    avgTicket: visitCount > 0 ? Math.round(lifetimeSpend / visitCount) : 0,
    firstVisit,
    lastVisit,
    favoriteTherapist: topKey(therapistCounts),
    favoriteService: topKey(serviceCounts),
  };
}

/**
 * Full Customer records (identity + real stored segment/membership +
 * visit-history computed from this outlet's own PAID bookings). Returns
 * null when there's no real customer data at all (demo/"Ganti Role"
 * viewer) — callers fall back to the mock CUSTOMERS fixture, same
 * convention as every other lib/data/*.ts module.
 *
 * A customer with no PAID booking at this outlet still appears (0
 * visits, empty spend/favorite fields) rather than being dropped — an
 * honest "no history here yet" rather than hiding a real customer row.
 */
export async function getCustomersForOutlet(outletId: string): Promise<Customer[] | null> {
  const live = await getLiveCustomers();
  if (live === null) return null;

  const bookings = await getBookingsForOutlet(outletId);
  const paid = bookings.filter((b) => b.status === "PAID");

  type Agg = {
    visitCount: number;
    lifetimeSpend: number;
    firstVisit: string;
    lastVisit: string;
    therapistCounts: Map<string, number>;
    serviceCounts: Map<string, number>;
  };
  const byCustomer = new Map<string, Agg>();

  for (const b of paid) {
    let agg = byCustomer.get(b.customerId);
    if (!agg) {
      agg = { visitCount: 0, lifetimeSpend: 0, firstVisit: b.date, lastVisit: b.date, therapistCounts: new Map(), serviceCounts: new Map() };
      byCustomer.set(b.customerId, agg);
    }
    agg.visitCount += 1;
    agg.lifetimeSpend += b.price;
    if (b.date < agg.firstVisit) agg.firstVisit = b.date;
    if (b.date > agg.lastVisit) agg.lastVisit = b.date;
    if (b.therapistName) agg.therapistCounts.set(b.therapistName, (agg.therapistCounts.get(b.therapistName) ?? 0) + 1);
    if (b.packageName) agg.serviceCounts.set(b.packageName, (agg.serviceCounts.get(b.packageName) ?? 0) + 1);
  }

  return live.map((c): Customer => {
    const agg = byCustomer.get(c.id);
    const visitCount = agg?.visitCount ?? 0;
    const lifetimeSpend = agg?.lifetimeSpend ?? 0;
    return {
      ...c,
      visitCount,
      lifetimeSpend,
      avgTicket: visitCount > 0 ? Math.round(lifetimeSpend / visitCount) : 0,
      firstVisit: agg?.firstVisit ?? "",
      lastVisit: agg?.lastVisit ?? "",
      favoriteTherapist: agg ? topKey(agg.therapistCounts) : "",
      favoriteService: agg ? topKey(agg.serviceCounts) : "",
    };
  });
}

// ---------------------------------------------------------------------
// UPDATE 2026-08-22 — customer-portal side (/customer/*). Added while
// migrating those pages off ME_CUSTOMER (lib/mock/people.ts) per user
// request: "halaman konsumen migrasi ke data real". Resolves the SIGNED-
// IN CUSTOMER's own row (not an outlet's whole customer list, and not
// outlet-scoped — a customer isn't tied to one outlet, see the file
// header). `customers_read_self` RLS already covers this read; no new
// migration needed.
//
// Returns null when there's no real customer session (demo/"Ganti Role"
// viewer, or a signed-in STAFF account with no customer row) — callers
// fall back to the mock ME_CUSTOMER fixture, same convention as every
// other lib/data/*.ts module.
// ---------------------------------------------------------------------
export async function getCurrentCustomer(): Promise<Customer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("customers").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (error || !data) return null;

  const base = mapCustomer(data as CustomerRow);
  const bookings = await getBookingsForCustomer(base.id);
  const history = aggregateHistory(bookings);
  return { ...base, ...history };
}
