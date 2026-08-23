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

// ---------------------------------------------------------------------
// Add-ons (hot stone, oil/nuru massage, etc.) — added 2026-08-22, user
// feedback: "add on layanan biasanya ada tambahan misal: hot stone, oil
// (nuru massage), dll". The `add_ons` table + RLS (add_ons_write —
// manager for their own outlet, or admin/owner tenant-wide, identical
// shape to service_packages_write/extension_options_write above) already
// existed since the baseline migration; what was missing was any write
// path at all — getAddonsForOutlet() (lib/data/catalog.ts) could only
// ever show 0 rows because nothing could create one. This is a manager-
// facing action living on /manager/catalog, same page as package/
// extension pricing, for the same reason: an add-on's price and
// commission are outlet-specific (an outlet may not even offer hot
// stone), so the manager who runs that outlet is the natural owner —
// admin/owner can still write here too since the RLS allows it, but
// there's no separate admin-only add-on screen, matching how packages
// and extensions already work.
// ---------------------------------------------------------------------

function validateAddonName(name: string): string | null {
  if (!name.trim()) return "Nama add-on tidak boleh kosong.";
  return null;
}

export type CreateAddonInput = {
  outletId: string;
  name: string;
  price: number;
  commissionType: CommissionType;
  commissionValue: number;
  durationMin: number;
  active: boolean;
};

export async function createAddon(input: CreateAddonInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const nameErr = validateAddonName(input.name);
  if (nameErr) return { ok: false, error: nameErr };
  const priceErr = validatePrice(input.price);
  if (priceErr) return { ok: false, error: priceErr };
  const commErr = validateCommission(input.commissionType, input.commissionValue);
  if (commErr) return { ok: false, error: commErr };
  if (!Number.isFinite(input.durationMin) || input.durationMin < 0) {
    return { ok: false, error: "Durasi tambahan harus angka dan tidak boleh negatif." };
  }

  const { error } = await supabase.from("add_ons").insert({
    outlet_id: input.outletId,
    name: input.name.trim(),
    price: input.price,
    commission_type: input.commissionType,
    commission: input.commissionValue,
    duration_min: input.durationMin,
    active: input.active,
  });

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah katalog." };
  }

  revalidateCatalog();
  return { ok: true };
}

export type UpdateAddonInput = {
  addonId: string;
  name: string;
  price: number;
  commissionType: CommissionType;
  commissionValue: number;
  durationMin: number;
  active: boolean;
};

export async function updateAddon(input: UpdateAddonInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const nameErr = validateAddonName(input.name);
  if (nameErr) return { ok: false, error: nameErr };
  const priceErr = validatePrice(input.price);
  if (priceErr) return { ok: false, error: priceErr };
  const commErr = validateCommission(input.commissionType, input.commissionValue);
  if (commErr) return { ok: false, error: commErr };
  if (!Number.isFinite(input.durationMin) || input.durationMin < 0) {
    return { ok: false, error: "Durasi tambahan harus angka dan tidak boleh negatif." };
  }

  const { error } = await supabase
    .from("add_ons")
    .update({
      name: input.name.trim(),
      price: input.price,
      commission_type: input.commissionType,
      commission: input.commissionValue,
      duration_min: input.durationMin,
      active: input.active,
    })
    .eq("id", input.addonId);

  if (error) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah katalog." };
  }

  revalidateCatalog();
  return { ok: true };
}

// ---------------------------------------------------------------------
// UPDATE 2026-08-23 — user feedback: "tambah paket baru belum bisa,
// tombolnya sebaiknya ada di kotak daftar paket". Packages had the same
// gap add-ons had before 2026-08-22 (see createAddon's header above):
// service_packages_write (0002) already lets a manager insert at their
// own outlet, but nothing on the page ever called it — the "Paket Baru"
// button in the page header was decorative, no onClick. Moved into the
// "Daftar Paket" card's own header (CardHead action), matching where
// "Add-on Baru" already lives on "Add-on Layanan".
//
// A package additionally needs a service_type_id (what kind of service
// this is — Massage/Facial/etc, drives the booking form's grouping) and
// a room_type, neither of which add-ons have. required_skill/buffer
// before-after/extension_allowed/materials are left at safe defaults
// (empty/0/true/[]) — a brand-new package with no special requirements
// yet; the existing PackagePricingEditor only ever touches price+komisi,
// so those other fields were never editable post-creation either, same
// as before this change.
// ---------------------------------------------------------------------

function validatePackageName(name: string): string | null {
  if (!name.trim()) return "Nama paket tidak boleh kosong.";
  return null;
}

export type CreatePackageInput = {
  outletId: string;
  serviceTypeId: string;
  name: string;
  durationMin: number;
  listPrice: number;
  memberPrice: number;
  weekendPrice: number;
  roomType: string;
  commissionType: CommissionType;
  commissionValue: number;
};

export async function createPackage(input: CreatePackageInput): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const nameErr = validatePackageName(input.name);
  if (nameErr) return { ok: false, error: nameErr };
  if (!input.serviceTypeId) return { ok: false, error: "Pilih jenis layanan untuk paket ini." };
  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
    return { ok: false, error: "Durasi harus lebih dari nol menit." };
  }
  const priceErr = validatePrice(input.listPrice);
  if (priceErr) return { ok: false, error: priceErr };
  const memberErr = validatePrice(input.memberPrice);
  if (memberErr) return { ok: false, error: `Harga member: ${memberErr}` };
  const weekendErr = validatePrice(input.weekendPrice);
  if (weekendErr) return { ok: false, error: `Harga weekend: ${weekendErr}` };
  const commErr = validateCommission(input.commissionType, input.commissionValue);
  if (commErr) return { ok: false, error: commErr };

  const { error } = await supabase.from("service_packages").insert({
    outlet_id: input.outletId,
    service_type_id: input.serviceTypeId,
    name: input.name.trim(),
    duration_min: input.durationMin,
    list_price: input.listPrice,
    member_price: input.memberPrice,
    weekend_price: input.weekendPrice,
    room_type: input.roomType.trim() || "Massage",
    required_skill: null,
    buffer_before_min: 0,
    buffer_after_min: 0,
    extension_allowed: true,
    commission_type: input.commissionType,
    commission_value: input.commissionValue,
    status: "ACTIVE",
    materials: [],
  });

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
