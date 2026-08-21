"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CommissionType } from "@/lib/commission";

// ---------------------------------------------------------------------
// Server Actions for catalog setup — specifically the price + commission
// pair the outlet admin fills in when first entering the service list.
//
// This is the prerequisite for the whole commission module: until a real
// rule is stored here, every commission the system could compute would
// be Rp0, and a payslip confidently showing Rp0 for a therapist who
// worked all day is worse than showing nothing at all. So the setup
// screen comes first, and the payout engine reads what it finds here.
//
// Runs as the signed-in user (never the service-role client), so
// 0002_rls_policies.sql decides who may actually write — a kasir hitting
// this endpoint with a crafted request is rejected by the database, not
// merely hidden from the button in the UI.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Shared validation. Rejects the data-entry mistakes that would otherwise
 * become real money: a percentage above 100, a negative rate, or a
 * non-number. The database carries the same constraints (0004) — this
 * layer exists to return a readable Indonesian message instead of a
 * Postgres constraint-violation string.
 */
function validateCommission(type: CommissionType, value: number): string | null {
  if (!Number.isFinite(value)) return "Nilai komisi harus berupa angka.";
  if (value < 0) return "Komisi tidak boleh negatif.";
  if (type === "percent" && value > 100) {
    return "Komisi persen tidak boleh lebih dari 100%. Kalau maksudnya rupiah, ganti satuannya ke Rupiah dulu.";
  }
  return null;
}

function validatePrice(price: number): string | null {
  if (!Number.isFinite(price)) return "Harga harus berupa angka.";
  if (price < 0) return "Harga tidak boleh negatif.";
  return null;
}

export type UpdatePackagePricingInput = {
  packageId: string;
  listPrice: number;
  commissionType: CommissionType;
  commissionValue: number;
};

export async function updatePackagePricing(input: UpdatePackagePricingInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const priceErr = validatePrice(input.listPrice);
  if (priceErr) return { ok: false, error: priceErr };
  const commErr = validateCommission(input.commissionType, input.commissionValue);
  if (commErr) return { ok: false, error: commErr };

  const { error } = await supabase
    .from("service_packages")
    .update({
      list_price: input.listPrice,
      commission_type: input.commissionType,
      commission_value: input.commissionValue,
    })
    .eq("id", input.packageId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah katalog." };
  }

  revalidateCatalog();
  return { ok: true };
}

export type UpdateExtensionPricingInput = {
  extensionId: string;
  price: number;
  commissionType: CommissionType;
  commission: number;
};

export async function updateExtensionPricing(input: UpdateExtensionPricingInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const priceErr = validatePrice(input.price);
  if (priceErr) return { ok: false, error: priceErr };
  const commErr = validateCommission(input.commissionType, input.commission);
  if (commErr) return { ok: false, error: commErr };

  const { error } = await supabase
    .from("extension_options")
    .update({
      price: input.price,
      commission_type: input.commissionType,
      commission: input.commission,
    })
    .eq("id", input.extensionId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah katalog." };
  }

  revalidateCatalog();
  return { ok: true };
}

function revalidateCatalog() {
  revalidatePath("/manager/catalog");
  revalidatePath("/admin/master");
  // The booking form reads package prices, and the POS reads them again
  // at billing time — both must not serve a stale price after an edit.
  revalidatePath("/manager/bookings/new");
  revalidatePath("/kasir/booking-baru");
}
