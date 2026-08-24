"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// The one outlet-level write this file has for now: which alarm sound
// plays on the therapist session page when a session's time runs out
// (see 0015_alarm_sound.sql's header for the full feature background).
//
// The actual file upload happens client-side, straight from the browser
// to Supabase Storage (components/AlarmSoundSetting.tsx uses
// lib/supabase/client.ts + storage RLS to authorize it) — this action
// only persists the resulting public URL onto the outlet row afterward.
// RLS (outlets_update_manager / outlets_write_admin, already existing
// since 0002) is what actually enforces "only this outlet's manager, or
// admin/owner, can set this" — passing a foreign outletId here just gets
// silently refused by the database, not a UI-only check.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setAlarmSoundUrl(outletId: string, url: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase.from("outlets").update({ alarm_sound_url: url }).eq("id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan suara alarm — coba lagi." };

  revalidatePath("/manager/settings");
  revalidatePath("/therapist/session");
  return { ok: true };
}

// ---------------------------------------------------------------------
// "booking bisa diatur admin H minus berapa, maksimal 3 hari kedepan,
// defaultnya hanya bisa dipesan hari H" — user request 2026-08-22. See
// 0017_therapist_gallery_booking_window_schedule.sql's header for the
// full rationale and the check constraint enforcing 0-3 at the DB level
// (this validates the same range client-visibly first, so a manager gets
// a readable message instead of a raw constraint-violation error).
// ---------------------------------------------------------------------

export async function setBookingWindowDays(outletId: string, days: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!Number.isInteger(days) || days < 0 || days > 3) {
    return { ok: false, error: "Jendela booking harus antara 0 (hari-H saja) dan 3 hari." };
  }

  const { error } = await supabase.from("outlets").update({ booking_window_days: days }).eq("id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan — coba lagi." };

  revalidatePath("/manager/settings");
  revalidatePath("/customer/book");
  return { ok: true };
}

// =====================================================================
// Outlet configuration writes — added 2026-08-24 (backlog 14 & 5.3).
//
// Before this, /manager/settings and /admin/geofence displayed real
// outlet columns in editable-looking inputs and then threw every edit
// away: the geofence page had no save button at all, and the settings
// page's "Simpan Perubahan" was disabled. Tax and service-charge
// changes — which affect what every guest is actually charged — had to
// be done by hand in the database.
//
// Every column touched below already exists on `outlets` (see
// lib/data/outlets.ts OutletRow), so none of this needs a migration.
// The toggles that DON'T have columns yet (the booking-policy and
// notification rows on /manager/settings) are deliberately left as
// read-only Switches rather than given fake handlers — see
// components/ui.tsx.
//
// RLS (outlets_update_manager / outlets_write_admin, since 0002) stays
// the real gate: a manager can only write their own outlet's row, and
// passing a foreign outletId here is refused by the database, not just
// by this file.
// =====================================================================

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sesi tidak ditemukan — silakan login ulang." as const };
  return { supabase, error: null };
}

/** Shared mapping of a Postgres RLS refusal to something a human can act on. */
function writeError(error: { code?: string } | null, what: string): string {
  if (error?.code === "42501") {
    return `Role kamu belum diizinkan mengubah ${what} outlet ini. Hubungi admin/owner.`;
  }
  return `Gagal menyimpan ${what} — coba lagi.`;
}

// ------------------------------------------------------------- geofence

export type GeofenceInput = {
  lat: number;
  lng: number;
  geofenceRadius: number;
  accuracyThreshold: number;
};

/**
 * Coordinates and radius used to judge therapist attendance check-ins.
 *
 * Validated tightly on purpose: this is the one setting where a typo has
 * a direct payroll consequence. A radius of 5 m would mark honest staff
 * "Mencurigakan" every morning; a swapped lat/lng would put the outlet
 * in the ocean and flag literally everyone. Better to refuse the save
 * than to silently accept a number that quietly breaks attendance.
 */
export async function setGeofence(outletId: string, input: GeofenceInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { lat, lng, geofenceRadius, accuracyThreshold } = input;

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude harus antara -90 dan 90." };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "Longitude harus antara -180 dan 180." };
  }
  if (!Number.isFinite(geofenceRadius) || geofenceRadius < 20 || geofenceRadius > 1000) {
    return { ok: false, error: "Radius geofence harus antara 20 dan 1000 meter." };
  }
  if (!Number.isFinite(accuracyThreshold) || accuracyThreshold < 5 || accuracyThreshold > 500) {
    return { ok: false, error: "Accuracy threshold harus antara 5 dan 500 meter." };
  }

  const { error: writeErr } = await supabase
    .from("outlets")
    .update({
      lat,
      lng,
      geofence_radius: Math.round(geofenceRadius),
      accuracy_threshold: Math.round(accuracyThreshold),
    })
    .eq("id", outletId);
  if (writeErr) return { ok: false, error: writeError(writeErr, "geofence") };

  revalidatePath("/admin/geofence");
  revalidatePath("/therapist/attendance");
  return { ok: true };
}

// --------------------------------------------------- tax / service / late

export type OutletPolicyInput = {
  taxPct: number;
  taxEnabled: boolean;
  serviceChargePct: number;
  serviceChargeEnabled: boolean;
  latePolicy: "FULL_DURATION" | "FIXED_SLOT" | "GRACE_PERIOD" | "NONE";
  gracePeriodMin: number;
};

const LATE_POLICIES: OutletPolicyInput["latePolicy"][] = ["FULL_DURATION", "FIXED_SLOT", "GRACE_PERIOD", "NONE"];

/**
 * Tax (PB1) and service charge percentages, plus the late-arrival rule.
 *
 * These feed lib/actions/transactions.ts' checkout maths directly, so a
 * change here changes what the next guest pays. Percentages are capped
 * at 100 — not because a >100% tax is theoretically impossible, but
 * because in practice it means someone typed rupiah into a percent
 * field, and silently charging 50,000% is worse than refusing.
 *
 * Note: existing transactions are unaffected. Receipts store the
 * computed amounts, not a live reference to these columns — same
 * principle as booking prices being locked at creation.
 */
export async function setOutletPolicy(outletId: string, input: OutletPolicyInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { taxPct, taxEnabled, serviceChargePct, serviceChargeEnabled, latePolicy, gracePeriodMin } = input;

  if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
    return { ok: false, error: "Pajak harus antara 0 dan 100 persen." };
  }
  if (!Number.isFinite(serviceChargePct) || serviceChargePct < 0 || serviceChargePct > 100) {
    return { ok: false, error: "Service charge harus antara 0 dan 100 persen." };
  }
  if (!LATE_POLICIES.includes(latePolicy)) {
    return { ok: false, error: "Kebijakan keterlambatan tidak dikenal." };
  }
  if (!Number.isInteger(gracePeriodMin) || gracePeriodMin < 0 || gracePeriodMin > 120) {
    return { ok: false, error: "Grace period harus antara 0 dan 120 menit." };
  }

  const { error: writeErr } = await supabase
    .from("outlets")
    .update({
      tax_pct: taxPct,
      tax_enabled: taxEnabled,
      service_charge_pct: serviceChargePct,
      service_charge_enabled: serviceChargeEnabled,
      late_policy: latePolicy,
      grace_period_min: gracePeriodMin,
    })
    .eq("id", outletId);
  if (writeErr) return { ok: false, error: writeError(writeErr, "kebijakan pajak & service") };

  revalidatePath("/manager/settings");
  revalidatePath("/kasir/pos");
  return { ok: true };
}

// -------------------------------------------------------------- deposit

export type DepositInput = {
  enabled: boolean;
  type: "FIXED" | "PERCENT";
  value: number;
  minTicket: number;
  expiryMin: number;
  refundable: boolean;
  appliesTo: string[];
  note: string;
};

/**
 * Booking deposit policy.
 *
 * Honest caveat that belongs with this write, not buried in a doc:
 * saving a deposit policy does NOT make the app collect deposits. There
 * is no payment gateway wired up yet (backlog 1.4, Midtrans), so these
 * columns drive what the Customer App *tells* a guest to expect and what
 * staff quote at the outlet — the money is still taken in person. The
 * settings page says so on screen too.
 */
export async function setDepositPolicy(outletId: string, input: DepositInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  if (input.type !== "FIXED" && input.type !== "PERCENT") {
    return { ok: false, error: "Metode perhitungan deposit tidak dikenal." };
  }
  if (!Number.isFinite(input.value) || input.value < 0) {
    return { ok: false, error: "Nominal deposit tidak boleh negatif." };
  }
  if (input.type === "PERCENT" && input.value > 100) {
    return { ok: false, error: "Deposit persen tidak boleh lebih dari 100%. Kalau maksudnya rupiah, ganti metodenya ke nominal tetap dulu." };
  }
  if (!Number.isFinite(input.minTicket) || input.minTicket < 0) {
    return { ok: false, error: "Minimum total transaksi tidak boleh negatif." };
  }
  if (!Number.isInteger(input.expiryMin) || input.expiryMin < 0) {
    return { ok: false, error: "Batas waktu pembayaran tidak boleh negatif." };
  }
  // A deposit that is switched on but set to 0 would quietly ask every
  // guest for nothing while the UI claims a deposit is required.
  if (input.enabled && input.value === 0) {
    return { ok: false, error: "Deposit aktif tapi nominalnya 0 — isi nominalnya, atau matikan deposit." };
  }

  const { error: writeErr } = await supabase
    .from("outlets")
    .update({
      deposit_enabled: input.enabled,
      deposit_type: input.type,
      deposit_value: input.value,
      deposit_min_ticket: input.minTicket,
      deposit_expiry_min: input.expiryMin,
      deposit_refundable: input.refundable,
      deposit_applies_to: input.appliesTo,
      deposit_note: input.note.trim() || null,
    })
    .eq("id", outletId);
  if (writeErr) return { ok: false, error: writeError(writeErr, "kebijakan deposit") };

  revalidatePath("/manager/settings");
  revalidatePath("/admin/outlets");
  revalidatePath("/customer/book");
  return { ok: true };
}

// ------------------------------------------------------------- identity

export type OutletIdentityInput = {
  name: string;
  address: string;
  city: string;
  phone: string;
  openHours: string;
  managerName: string;
};

/**
 * The outlet's own name/address/contact details.
 *
 * `code` and `receipt_prefix` are intentionally NOT editable here: both
 * are baked into receipt numbers already issued (`CKW-20260821-7K2Q`),
 * so changing one later makes historical receipts unattributable to the
 * outlet that issued them.
 */
export async function setOutletIdentity(outletId: string, input: OutletIdentityInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const name = input.name.trim();
  const address = input.address.trim();
  const city = input.city.trim();
  if (!name) return { ok: false, error: "Nama outlet wajib diisi." };
  if (!address) return { ok: false, error: "Alamat outlet wajib diisi." };
  if (!city) return { ok: false, error: "Kota wajib diisi." };

  const { error: writeErr } = await supabase
    .from("outlets")
    .update({
      name,
      address,
      city,
      phone: input.phone.trim() || null,
      open_hours: input.openHours.trim() || null,
      manager_name: input.managerName.trim() || null,
    })
    .eq("id", outletId);
  if (writeErr) return { ok: false, error: writeError(writeErr, "data outlet") };

  revalidatePath("/admin/outlets");
  revalidatePath("/manager/settings");
  return { ok: true };
}
