"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Server Action: editing an EXISTING promotion row — specifically the
// structured `discount_amount` a promo actually redeems for (added in
// 0009 alongside the "Ajak Teman" referral voucher), plus the handful of
// adjacent fields a manager would reasonably want to tweak without
// touching Supabase directly (kuota, batas berlaku, status, label
// tampilan).
//
// Deliberately NOT a full promo-CRUD screen: creating a brand new promo
// (choosing its type, wiring a fresh code, deciding new_customers_only)
// is a bigger form left for later — /manager/promotions's "Promo Baru"
// button stays presentational for now. This is the narrower "the
// referral discount shouldn't be hardcoded at Rp30.000 forever" fix the
// user actually asked for.
//
// Runs as the signed-in user — 0002_rls_policies.sql's `promotions_write`
// (manager/admin/owner only) is the real gate, same as every other
// catalog-editing action in this app.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export type UpdatePromotionInput = {
  promotionId: string;
  value: string;
  discountAmount: number | null;
  maxUsage: number | null;
  validTo: string;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function updatePromotion(input: UpdatePromotionInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const value = input.value.trim();
  if (!value) return { ok: false, error: "Keterangan promo tidak boleh kosong." };

  if (input.discountAmount !== null) {
    if (!Number.isFinite(input.discountAmount) || input.discountAmount < 0) {
      return { ok: false, error: "Nominal diskon harus angka dan tidak boleh negatif." };
    }
  }

  if (input.maxUsage !== null) {
    if (!Number.isInteger(input.maxUsage) || input.maxUsage < 0) {
      return { ok: false, error: "Kuota harus bilangan bulat dan tidak boleh negatif." };
    }
  }

  if (!DATE_RE.test(input.validTo)) {
    return { ok: false, error: "Tanggal berlaku sampai harus berformat YYYY-MM-DD." };
  }

  const { error } = await supabase
    .from("promotions")
    .update({
      value,
      discount_amount: input.discountAmount,
      max_usage: input.maxUsage,
      valid_to: input.validTo,
      status: input.status,
    })
    .eq("id", input.promotionId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah promo (manager/admin)." };
  }

  revalidatePath("/manager/promotions");
  return { ok: true };
}
