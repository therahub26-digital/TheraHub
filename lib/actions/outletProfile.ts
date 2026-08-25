"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Write half of the public outlet profile page (/admin/outlets/[id]/profile
// — the "halaman iklan" tamu lihat di /customer/outlets/[id]).
//
// Adjie (2026-08-25): "outlet: halaman profil outlet belum berfungsi".
// Sebelumnya SEMUA kontrol di halaman itu `disabled` dengan tooltip
// "Belum tersedia" — Simpan Perubahan, unggah/hapus cover, Tambah
// Fasilitas, Tambah Foto, saklar publikasi, poin unggulan. Tidak ada
// satu pun jalur simpan.
//
// Yang sudah ada sebelum file ini (jadi TIDAK dibuat ulang):
//   - Tabel `outlet_profiles`, `outlet_facilities`, `outlet_gallery_photos`
//     sudah ada di database sejak awal.
//   - RLS tulisnya sudah lengkap sejak migrasi 0002 (ketiganya `for all`,
//     untuk admin/owner tenant sendiri ATAU manager outlet ybs).
//   - Jalur bacanya sudah jalan di lib/data/outlets.ts.
// Yang benar-benar hilang cuma: bucket Storage untuk filenya (migrasi
// 0028) dan file ini.
//
// Pola .eq() eksplisit di setiap update/delete DISENGAJA — bukan sekadar
// mengandalkan RLS. Lihat backlog 7.16: versi pertama lib/actions/tenant.ts
// memanggil .update() tanpa filter dan PostgREST menolaknya mentah-mentah
// sebelum RLS sempat dievaluasi, bikin semua tombol simpan error.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

type Access =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string };

/**
 * Auth + authorization for one outlet, resolved server-side rather than
 * trusted from the client. Admin/Owner boleh mengubah outlet mana pun di
 * tenant-nya; Manager hanya outlet tempat dia ditugaskan. Ini menegakkan
 * aturan yang sama dengan RLS 0002, tapi lebih awal — supaya pesannya bisa
 * jelas alih-alih berupa "0 rows affected" yang membingungkan.
 */
async function requireOutletAccess(outletId: string): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: me } = await supabase
    .from("app_users")
    .select("tenant_id, outlet_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me?.tenant_id) {
    return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
  }

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id, tenant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet) return { ok: false, error: "Outlet tidak ditemukan." };

  const role = String(me.role ?? "");
  const isAdminOrOwner = role === "admin" || role === "owner" || role === "super-admin";
  const isManagerHere = role === "manager" && me.outlet_id === outletId;

  if (isAdminOrOwner && outlet.tenant_id === me.tenant_id) return { ok: true, supabase };
  if (isManagerHere) return { ok: true, supabase };

  return {
    ok: false,
    error: "Role kamu belum diizinkan mengubah profil outlet ini. Hubungi admin/owner.",
  };
}

/**
 * Pesan error yang bisa ditindaklanjuti admin spa, bukan kode mentah.
 * Pesan asli Postgres tetap dilampirkan — versi pertama lib/actions/tenant.ts
 * membungkus semua kegagalan jadi "coba lagi" dan itu justru bikin bug-nya
 * tidak bisa didiagnosis dari layar (backlog 7.16).
 */
function writeError(error: { code?: string; message?: string } | null, what: string): string {
  if (error?.code === "42501") return `Role kamu belum diizinkan mengubah ${what}. Hubungi admin/owner.`;
  if (error?.code === "42P01") return `Tabel untuk ${what} belum ada di database — cek migrasi.`;
  if (error?.code === "42703") return `Kolom untuk ${what} belum ada di database — cek migrasi.`;
  const detail = error?.message ? ` (${error.message})` : "";
  return `Gagal menyimpan ${what} — coba lagi.${detail}`;
}

function revalidateOutlet(outletId: string) {
  revalidatePath(`/admin/outlets/${outletId}/profile`);
  revalidatePath("/admin/outlets");
  revalidatePath(`/customer/outlets/${outletId}`);
  revalidatePath("/customer/outlets");
}

type ProfileRow = {
  outlet_id: string;
  published: boolean;
  tagline: string;
  description: string;
  cover_url: string;
  profile_photo_url: string;
  highlights: string[] | null;
};

/**
 * `outlet_profiles` punya PK di outlet_id dan SEMUA kolomnya NOT NULL,
 * dan barisnya belum tentu ada untuk outlet yang baru dibuat. Jadi setiap
 * tulis di file ini lewat sini: baca baris yang ada (kalau ada), gabungkan
 * dengan perubahan, lalu upsert satu baris utuh. Tanpa ini, upsert parsial
 * akan gagal di kolom NOT NULL yang tidak disebutkan saat barisnya belum ada.
 */
async function upsertProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outletId: string,
  patch: Partial<Omit<ProfileRow, "outlet_id">>,
  what: string
): Promise<ActionResult> {
  const { data: existing } = await supabase
    .from("outlet_profiles")
    .select("outlet_id, published, tagline, description, cover_url, profile_photo_url, highlights")
    .eq("outlet_id", outletId)
    .maybeSingle();

  const merged = {
    outlet_id: outletId,
    published: patch.published ?? existing?.published ?? false,
    tagline: patch.tagline ?? existing?.tagline ?? "",
    description: patch.description ?? existing?.description ?? "",
    cover_url: patch.cover_url ?? existing?.cover_url ?? "",
    profile_photo_url: patch.profile_photo_url ?? existing?.profile_photo_url ?? "",
    highlights: patch.highlights ?? existing?.highlights ?? [],
  };

  const { data, error } = await supabase
    .from("outlet_profiles")
    .upsert(merged, { onConflict: "outlet_id" })
    .select("outlet_id");

  if (error) return { ok: false, error: writeError(error, what) };
  if (!data || data.length === 0) {
    return { ok: false, error: `Role kamu belum diizinkan mengubah ${what}. Hubungi admin/owner.` };
  }

  revalidateOutlet(outletId);
  return { ok: true };
}

// --------------------------- Tagline & deskripsi ---------------------------

export async function setOutletProfileText(
  outletId: string,
  input: { tagline: string; description: string }
): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };

  const tagline = input.tagline.trim();
  const description = input.description.trim();
  if (tagline.length > 120) return { ok: false, error: "Tagline maksimal 120 karakter." };
  if (description.length > 2000) return { ok: false, error: "Deskripsi maksimal 2000 karakter." };

  return upsertProfile(access.supabase, outletId, { tagline, description }, "tagline & deskripsi");
}

// --------------------------- Status publikasi ---------------------------

export async function setOutletPublished(outletId: string, published: boolean): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };
  return upsertProfile(access.supabase, outletId, { published }, "status publikasi");
}

// --------------------------- Cover ---------------------------

export async function setOutletCoverUrl(outletId: string, url: string): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };
  // String kosong = hapus cover. Kolomnya NOT NULL, jadi tidak boleh null.
  return upsertProfile(access.supabase, outletId, { cover_url: url.trim() }, "foto cover");
}

// --------------------------- Foto profil (kartu ringkas) ---------------------------

/**
 * Menandai satu URL (harus sudah ada di outlet_gallery_photos outlet ini,
 * ATAU string kosong untuk membatalkan pilihan) sebagai foto profil —
 * dipakai kartu ringkas outlet di beranda customer, terpisah dari cover.
 * Migrasi 0029.
 */
export async function setOutletProfilePhotoUrl(outletId: string, url: string): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };

  const trimmed = url.trim();
  if (trimmed) {
    const { data: match } = await access.supabase
      .from("outlet_gallery_photos")
      .select("id")
      .eq("outlet_id", outletId)
      .eq("url", trimmed)
      .maybeSingle();
    if (!match) return { ok: false, error: "Foto itu tidak ditemukan di galeri outlet ini." };
  }

  return upsertProfile(access.supabase, outletId, { profile_photo_url: trimmed }, "foto profil");
}

// --------------------------- Poin unggulan ---------------------------

export async function setOutletHighlights(outletId: string, highlights: string[]): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };

  const cleaned = highlights.map((h) => h.trim()).filter((h) => h.length > 0).slice(0, 8);
  if (cleaned.some((h) => h.length > 60)) {
    return { ok: false, error: "Setiap poin unggulan maksimal 60 karakter." };
  }
  return upsertProfile(access.supabase, outletId, { highlights: cleaned }, "poin unggulan");
}

// --------------------------- Fasilitas ---------------------------

export async function createOutletFacility(
  outletId: string,
  input: { name: string; icon: string; description: string }
): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama fasilitas wajib diisi." };
  if (name.length > 60) return { ok: false, error: "Nama fasilitas maksimal 60 karakter." };

  const { count } = await access.supabase
    .from("outlet_facilities")
    .select("id", { count: "exact", head: true })
    .eq("outlet_id", outletId);

  const { data, error } = await access.supabase
    .from("outlet_facilities")
    .insert({
      outlet_id: outletId,
      name,
      icon: input.icon.trim() || "sparkles",
      description: input.description.trim(),
      sort_order: count ?? 0,
    })
    .select("id");

  if (error) return { ok: false, error: writeError(error, "fasilitas") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan menambah fasilitas. Hubungi admin/owner." };
  }

  revalidateOutlet(outletId);
  return { ok: true };
}

export async function updateOutletFacility(
  facilityId: string,
  input: { name: string; icon: string; description: string }
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("outlet_facilities")
    .select("outlet_id")
    .eq("id", facilityId)
    .maybeSingle();
  if (!row?.outlet_id) return { ok: false, error: "Fasilitas tidak ditemukan." };

  const access = await requireOutletAccess(row.outlet_id);
  if (!access.ok) return { ok: false, error: access.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama fasilitas wajib diisi." };
  if (name.length > 60) return { ok: false, error: "Nama fasilitas maksimal 60 karakter." };

  const { data, error } = await access.supabase
    .from("outlet_facilities")
    .update({ name, icon: input.icon.trim() || "sparkles", description: input.description.trim() })
    .eq("id", facilityId)
    .select("id");

  if (error) return { ok: false, error: writeError(error, "fasilitas") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan mengubah fasilitas ini. Hubungi admin/owner." };
  }

  revalidateOutlet(row.outlet_id);
  return { ok: true };
}

export async function deleteOutletFacility(facilityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("outlet_facilities")
    .select("outlet_id")
    .eq("id", facilityId)
    .maybeSingle();
  if (!row?.outlet_id) return { ok: false, error: "Fasilitas tidak ditemukan." };

  const access = await requireOutletAccess(row.outlet_id);
  if (!access.ok) return { ok: false, error: access.error };

  const { data, error } = await access.supabase
    .from("outlet_facilities")
    .delete()
    .eq("id", facilityId)
    .select("id");

  if (error) return { ok: false, error: writeError(error, "fasilitas") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan menghapus fasilitas ini. Hubungi admin/owner." };
  }

  revalidateOutlet(row.outlet_id);
  return { ok: true };
}

// --------------------------- Galeri foto ---------------------------

export async function addOutletGalleryPhoto(
  outletId: string,
  input: { label: string; url: string }
): Promise<ActionResult> {
  const access = await requireOutletAccess(outletId);
  if (!access.ok) return { ok: false, error: access.error };

  const url = input.url.trim();
  if (!url) return { ok: false, error: "URL foto kosong — unggahnya gagal." };

  const { count } = await access.supabase
    .from("outlet_gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("outlet_id", outletId);

  const { data, error } = await access.supabase
    .from("outlet_gallery_photos")
    .insert({
      outlet_id: outletId,
      label: input.label.trim() || "Foto fasilitas",
      url,
      sort_order: count ?? 0,
    })
    .select("id");

  if (error) return { ok: false, error: writeError(error, "foto galeri") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan menambah foto. Hubungi admin/owner." };
  }

  revalidateOutlet(outletId);
  return { ok: true };
}

export async function setOutletGalleryLabel(photoId: string, label: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("outlet_gallery_photos")
    .select("outlet_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!row?.outlet_id) return { ok: false, error: "Foto tidak ditemukan." };

  const access = await requireOutletAccess(row.outlet_id);
  if (!access.ok) return { ok: false, error: access.error };

  const { data, error } = await access.supabase
    .from("outlet_gallery_photos")
    .update({ label: label.trim() || "Foto fasilitas" })
    .eq("id", photoId)
    .select("id");

  if (error) return { ok: false, error: writeError(error, "judul foto") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan mengubah foto ini. Hubungi admin/owner." };
  }

  revalidateOutlet(row.outlet_id);
  return { ok: true };
}

export async function deleteOutletGalleryPhoto(photoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("outlet_gallery_photos")
    .select("outlet_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!row?.outlet_id) return { ok: false, error: "Foto tidak ditemukan." };

  const access = await requireOutletAccess(row.outlet_id);
  if (!access.ok) return { ok: false, error: access.error };

  const { data, error } = await access.supabase
    .from("outlet_gallery_photos")
    .delete()
    .eq("id", photoId)
    .select("id");

  if (error) return { ok: false, error: writeError(error, "foto galeri") };
  if (!data || data.length === 0) {
    return { ok: false, error: "Role kamu belum diizinkan menghapus foto ini. Hubungi admin/owner." };
  }

  revalidateOutlet(row.outlet_id);
  return { ok: true };
}
