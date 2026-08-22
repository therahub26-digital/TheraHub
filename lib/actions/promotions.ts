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
// UPDATE 2026-08-22: createPromotion() below adds the full-CRUD half
// that was deliberately left out above — user asked for reusable
// templates ("paket promo buat template: membership, happy hour, dll,
// bisa diaktifkan bisa tidak"). `promotions.type` already had a
// "Membership" option in its union and `status` already had ACTIVE/
// SCHEDULED/EXPIRED (see lib/types.ts's Promotion interface) — this
// action is what was missing to actually create a new row using those,
// not a schema change. "Happy Hour" as a real time-of-day type is
// explicitly OUT of scope here — it would need a new column (valid
// hours) and checkout-time validation logic; this only wires up the
// fields the schema already supports (type/code/discount/dates/status).
//
// Runs as the signed-in user — 0002_rls_policies.sql's `promotions_write`
// (manager/admin/owner only) is the real gate, same as every other
// catalog-editing action in this app.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

const PROMO_TYPES = ["Promo", "Voucher", "Prepaid Package", "Membership", "Loyalty"] as const;

export type CreatePromotionInput = {
  outletId: string;
  name: string;
  type: (typeof PROMO_TYPES)[number];
  code: string | null;
  value: string;
  discountAmount: number | null;
  newCustomersOnly: boolean;
  validFrom: string;
  validTo: string;
  maxUsage: number | null;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED";
};

export async function createPromotion(input: CreatePromotionInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama promo tidak boleh kosong." };
  if (!PROMO_TYPES.includes(input.type)) return { ok: false, error: "Tipe promo tidak dikenali." };

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

  if (!DATE_RE.test(input.validFrom) || !DATE_RE.test(input.validTo)) {
    return { ok: false, error: "Tanggal berlaku harus berformat YYYY-MM-DD." };
  }
  if (input.validTo < input.validFrom) {
    return { ok: false, error: "Tanggal \"berlaku sampai\" tidak boleh sebelum \"berlaku dari\"." };
  }

  const code = input.code?.trim() || null;

  const { error } = await supabase.from("promotions").insert({
    outlet_id: input.outletId,
    name,
    type: input.type,
    code,
    value,
    discount_amount: input.discountAmount,
    new_customers_only: input.newCustomersOnly,
    valid_from: input.validFrom,
    valid_to: input.validTo,
    usage_count: 0,
    max_usage: input.maxUsage,
    status: input.status,
  });

  if (error) {
    if (String(error.message).toLowerCase().includes("duplicate") || String(error.code) === "23505") {
      return { ok: false, error: "Kode promo ini sudah dipakai — pilih kode lain." };
    }
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah promo (manager/admin)." };
  }

  revalidatePath("/manager/promotions");
  return { ok: true };
}

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
