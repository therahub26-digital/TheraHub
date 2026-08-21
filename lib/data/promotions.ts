import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PROMOTIONS as MOCK_PROMOTIONS } from "@/lib/mock/catalog";
import type { Promotion } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for "promotions" — same pattern as every
// other lib/data/*.ts (live Supabase when authenticated, mock fallback
// for the demo "Ganti Role" viewer, fallback trigger is "no session",
// NEVER "0 rows" — see lib/data/bookings.ts's header for why).
//
// This is the DISPLAY side (what /manager/promotions renders). The
// REDEMPTION side (validating a code and applying its discount at
// payment) is intentionally NOT here — it lives in payForSession()
// (lib/actions/transactions.ts), which needs a live, uncached read at
// the moment of payment (usage_count / status can change between page
// load and checkout), not this cached display layer.
// ---------------------------------------------------------------------

type PromotionRow = {
  id: string;
  outlet_id: string;
  name: string;
  type: string;
  code: string | null;
  value: string;
  discount_amount: number | string | null;
  new_customers_only: boolean;
  valid_from: string;
  valid_to: string;
  usage_count: number;
  max_usage: number | null;
  status: string;
};

function mapPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    type: row.type as Promotion["type"],
    code: row.code ?? undefined,
    value: row.value,
    discountAmount: row.discount_amount !== null ? Number(row.discount_amount) : undefined,
    newCustomersOnly: row.new_customers_only,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    usageCount: row.usage_count,
    maxUsage: row.max_usage,
    status: row.status as Promotion["status"],
  };
}

async function fetchLivePromotions(): Promise<Promotion[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo/"Ganti Role" viewer -> mock. See header.

  const { data, error } = await supabase.from("promotions").select("*").order("name");
  if (error) return null;
  if (!data || data.length === 0) return []; // real session, genuinely no promo configured — honest empty

  return (data as PromotionRow[]).map(mapPromotion);
}

const loadPromotionsData = cache(async () => {
  const live = await fetchLivePromotions();
  if (live !== null) return { promotions: live, live: true };
  return { promotions: MOCK_PROMOTIONS, live: false };
});

export async function getPromotionsForOutlet(outletId: string): Promise<Promotion[]> {
  return (await loadPromotionsData()).promotions.filter((p) => p.outletId === outletId);
}

export async function isLivePromotionsData(): Promise<boolean> {
  return (await loadPromotionsData()).live;
}
