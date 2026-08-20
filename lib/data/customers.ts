import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

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
