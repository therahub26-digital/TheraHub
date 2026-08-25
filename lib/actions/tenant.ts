"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BRAND_PRESETS, BACKGROUND_PRESETS } from "@/lib/brand";

// ---------------------------------------------------------------------
// Write half of the Business Profile workflow (/admin/profile). See
// supabase/migrations/0025_tenant_business_profile.sql for the columns
// and RLS this depends on, and lib/data/tenant.ts for the read layer.
//
// User (2026-08-25): the whole "Brand, Logo & Background" panel plus the
// Identitas Bisnis/Kontak/Footer forms on /admin/profile were static mock
// forms with a deliberately-disabled Save button — nothing here
// persisted anywhere. This file is what the save button, the brand-color
// swatches, and the two new uploaders (logo + custom background photo)
// now actually call.
//
// BUG FIX (2026-08-25, laporan Adjie "gagal mengganti logo / gagal ganti
// background"): versi pertama file ini memanggil .update() TANPA filter
// apa pun, mengandalkan RLS (tenants_read_own / tenants_write_admin)
// untuk membatasi baris. PostgREST menolak UPDATE tanpa WHERE demi
// keamanan — jadi requestnya gagal SEBELUM RLS sempat dievaluasi, dan
// semua tombol simpan di halaman ini error. Sekarang tenant_id di-resolve
// dulu dari app_users (pola yang sama dengan lib/actions/bookings.ts)
// lalu dipakai sebagai .eq("id", tenantId). RLS tetap jadi lapis
// pengaman kedua, bukan satu-satunya.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Auth check + tenant resolution in one go — every write here needs both. */
async function requireTenant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, tenantId: null, error: "Sesi tidak ditemukan — silakan login ulang." as const };
  }

  const { data: staffRow, error: staffErr } = await supabase
    .from("app_users")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (staffErr || !staffRow?.tenant_id) {
    return {
      supabase,
      tenantId: null,
      error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." as const,
    };
  }

  return { supabase, tenantId: staffRow.tenant_id as string, error: null };
}

/**
 * Turns a Postgres/PostgREST error into something a spa admin can act on.
 * The raw message is appended because the first version of this file hid
 * every failure behind "coba lagi", which made the unfiltered-UPDATE bug
 * above impossible to diagnose from the screen alone.
 */
function writeError(error: { code?: string; message?: string } | null, what: string): string {
  if (error?.code === "42501") {
    return `Role kamu belum diizinkan mengubah ${what}. Hubungi admin/owner.`;
  }
  if (error?.code === "42703") {
    return `Kolom untuk ${what} belum ada di database — migrasi 0025 belum dijalankan.`;
  }
  const detail = error?.message ? ` (${error.message})` : "";
  return `Gagal menyimpan ${what} — coba lagi.${detail}`;
}

/**
 * The tenants_write_admin RLS policy (0025) restricts UPDATE to
 * admin/owner of the caller's own tenant. When that policy silently
 * blocks a write, Postgres reports 0 rows affected rather than an error
 * — so every write here re-selects the row and treats "no row came
 * back" as the real signal that the caller wasn't allowed to do this,
 * distinct from a genuine database error.
 */
function forbiddenMsg(what: string): string {
  return `Role kamu belum diizinkan mengubah ${what}. Hubungi admin/owner.`;
}

function revalidateProfile() {
  revalidatePath("/admin/profile");
}

export type TenantProfileInput = {
  brandName: string;
  legalName: string;
  npwp: string;
  website: string;
  instagram: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  invoiceFooter: string;
};

/** Saves Identitas Bisnis + Kontak + Footer Invoice/Struk in one action, mirroring the single "Simpan Perubahan" button on the page. */
export async function setTenantProfile(input: TenantProfileInput): Promise<ActionResult> {
  const { supabase, tenantId, error } = await requireTenant();
  if (error || !tenantId) return { ok: false, error: error ?? "Tenant tidak ditemukan." };

  const brandName = input.brandName.trim();
  if (!brandName) return { ok: false, error: "Nama Brand tidak boleh kosong." };
  if (brandName.length > 120) return { ok: false, error: "Nama Brand maksimal 120 karakter." };

  const { data, error: writeErr } = await supabase
    .from("tenants")
    .update({
      name: brandName,
      legal_name: input.legalName.trim() || null,
      npwp: input.npwp.trim() || null,
      website: input.website.trim() || null,
      instagram: input.instagram.trim() || null,
      tagline: input.tagline.trim() || null,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      whatsapp: input.whatsapp.trim() || null,
      address: input.address.trim() || null,
      receipt_footer: input.invoiceFooter.trim() || null,
    })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();
  if (writeErr) return { ok: false, error: writeError(writeErr, "profil bisnis") };
  if (!data) return { ok: false, error: forbiddenMsg("profil bisnis") };

  revalidateProfile();
  return { ok: true };
}

const BRAND_KEYS = BRAND_PRESETS.map((b) => b.key);
const BACKGROUND_KEYS = BACKGROUND_PRESETS.map((b) => b.key);

/** Warna Brand + Background Aplikasi swatches — applied immediately on click, same "instant apply" feel as the (client-only) Tema Siap Pakai preview above it, except this one actually persists to the tenant. */
export async function setTenantBrand(logoTone: string, bgTone: string): Promise<ActionResult> {
  const { supabase, tenantId, error } = await requireTenant();
  if (error || !tenantId) return { ok: false, error: error ?? "Tenant tidak ditemukan." };
  if (!BRAND_KEYS.includes(logoTone)) return { ok: false, error: "Warna brand tidak dikenal." };
  if (!BACKGROUND_KEYS.includes(bgTone)) return { ok: false, error: "Background tidak dikenal." };

  const { data, error: writeErr } = await supabase
    .from("tenants")
    .update({ logo_tone: logoTone, bg_tone: bgTone })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();
  if (writeErr) return { ok: false, error: writeError(writeErr, "warna brand & background") };
  if (!data) return { ok: false, error: forbiddenMsg("warna brand & background") };

  revalidateProfile();
  return { ok: true };
}

/** Persists the public Storage URL after a client-side direct upload to the `tenant-branding` bucket — same two-step pattern as setEmployeePhotoUrl (lib/actions/employees.ts). */
export async function setTenantLogoUrl(url: string | null): Promise<ActionResult> {
  const { supabase, tenantId, error } = await requireTenant();
  if (error || !tenantId) return { ok: false, error: error ?? "Tenant tidak ditemukan." };

  const { data, error: writeErr } = await supabase
    .from("tenants")
    .update({ logo_url: url })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();
  if (writeErr) return { ok: false, error: writeError(writeErr, "logo") };
  if (!data) return { ok: false, error: forbiddenMsg("logo") };

  revalidateProfile();
  return { ok: true };
}

export async function setTenantBackgroundPhotoUrl(url: string | null): Promise<ActionResult> {
  const { supabase, tenantId, error } = await requireTenant();
  if (error || !tenantId) return { ok: false, error: error ?? "Tenant tidak ditemukan." };

  const { data, error: writeErr } = await supabase
    .from("tenants")
    .update({ background_photo_url: url })
    .eq("id", tenantId)
    .select("id")
    .maybeSingle();
  if (writeErr) return { ok: false, error: writeError(writeErr, "background foto kustom") };
  if (!data) return { ok: false, error: forbiddenMsg("background foto kustom") };

  revalidateProfile();
  return { ok: true };
}
