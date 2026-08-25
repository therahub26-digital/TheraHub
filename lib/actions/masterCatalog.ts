"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Item 3/3 dari permintaan Adjie (2026-08-25): "master inisial:
// dibuatkan opsi saja mana yg akan di aktifkan, kalau di amet baru 1
// layanan, sisanya optional dan bisa diedit, tambahkan atau dihapus.
// perhatikan juga link ke halaman / role yg lain". Dijawab lewat
// pertanyaan pilihan ganda: jadikan Master Initial "editor master
// tenant sungguhan" — bukan cuma tampilan contoh seperti sebelumnya.
//
// `service_categories` dan `service_types` SUDAH menjadi tabel
// sungguhan sejak awal (dipakai Manager > Catalog untuk memberi harga
// per outlet) — RLS tulisnya (`service_categories_write`,
// `service_types_write`, migrasi 0002) juga sudah lengkap ("for all"
// untuk admin/owner tenant sendiri). Yang benar-benar hilang cuma:
// (a) kolom `active` di `service_types` (migrasi 0030) supaya jenis
// layanan yang ditambahkan di sini bisa dibuat "opsional, belum
// dipakai" tanpa langsung bisa dipilih Manager saat membuat paket
// baru; (b) action-action di file ini; (c) halaman editornya sendiri.
//
// "perhatikan juga link ke halaman / role yg lain" — lib/data/catalog.ts
// diubah supaya getCategories()/getServiceTypes() tidak lagi diturunkan
// dari paket yang sudah ada (yang berarti jenis layanan baru dengan nol
// paket tidak akan pernah muncul di mana pun, termasuk di dropdown
// "Tambah Paket" milik Manager sendiri — bug ayam-telur laten yang baru
// ketahuan sambil mengerjakan ini), dan dropdown itu (app/manager/catalog
// /page.tsx) sekarang menyaring `active` supaya jenis layanan yang masih
// "opsional" tidak bisa langsung dipilih untuk membuat paket sungguhan.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

type Access =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string }
  | { ok: false; error: string };

/** Master data tenant hanya boleh diubah Admin/Owner — dicek di sini juga supaya pesannya jelas, RLS tetap lapis pengaman kedua. */
async function requireTenantMasterAccess(): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: me } = await supabase.from("app_users").select("tenant_id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me?.tenant_id) return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
  if (me.role !== "admin" && me.role !== "owner" && me.role !== "super-admin") {
    return { ok: false, error: "Hanya Admin/Owner yang bisa mengubah master data tenant." };
  }
  return { ok: true, supabase, tenantId: me.tenant_id };
}

function revalidateMaster() {
  revalidatePath("/admin/master");
  revalidatePath("/manager/catalog");
}

// --- Kategori ---------------------------------------------------------

export type CategoryInput = { name: string; icon: string; description: string };

function validateCategory(input: CategoryInput): string | null {
  if (!input.name.trim()) return "Nama kategori wajib diisi.";
  return null;
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const err = validateCategory(input);
  if (err) return { ok: false, error: err };

  const { error } = await access.supabase.from("service_categories").insert({
    tenant_id: access.tenantId,
    name: input.name.trim(),
    icon: input.icon.trim() || "layers",
    description: input.description.trim() || null,
  });
  if (error) return { ok: false, error: "Gagal menyimpan kategori — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

export async function updateCategory(categoryId: string, input: CategoryInput): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const err = validateCategory(input);
  if (err) return { ok: false, error: err };

  const { error } = await access.supabase
    .from("service_categories")
    .update({ name: input.name.trim(), icon: input.icon.trim() || "layers", description: input.description.trim() || null })
    .eq("id", categoryId)
    .eq("tenant_id", access.tenantId);
  if (error) return { ok: false, error: "Gagal menyimpan kategori — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const { count } = await access.supabase
    .from("service_types")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Kategori ini masih punya jenis layanan di dalamnya — hapus atau pindahkan jenis layanannya dulu." };
  }

  const { error } = await access.supabase.from("service_categories").delete().eq("id", categoryId).eq("tenant_id", access.tenantId);
  if (error) return { ok: false, error: "Gagal menghapus kategori — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

// --- Jenis Layanan ------------------------------------------------------

export type ServiceTypeInput = {
  categoryId: string;
  name: string;
  requiredSkill: string;
  description: string;
  /** Amethyst baru punya 1 layanan sungguhan — jenis layanan baru lain sebaiknya dibuat `active: false` dulu ("opsional") sampai benar-benar mau dipakai, supaya tidak langsung muncul di dropdown "Tambah Paket" Manager. */
  active: boolean;
};

function validateServiceType(input: ServiceTypeInput): string | null {
  if (!input.categoryId) return "Pilih kategori untuk jenis layanan ini.";
  if (!input.name.trim()) return "Nama jenis layanan wajib diisi.";
  return null;
}

export async function createServiceType(input: ServiceTypeInput): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const err = validateServiceType(input);
  if (err) return { ok: false, error: err };

  const { error } = await access.supabase.from("service_types").insert({
    category_id: input.categoryId,
    name: input.name.trim(),
    required_skill: input.requiredSkill.trim() || null,
    description: input.description.trim() || null,
    active: input.active,
  });
  if (error) return { ok: false, error: "Gagal menyimpan jenis layanan — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

export async function updateServiceType(serviceTypeId: string, input: ServiceTypeInput): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const err = validateServiceType(input);
  if (err) return { ok: false, error: err };

  const { error } = await access.supabase
    .from("service_types")
    .update({
      category_id: input.categoryId,
      name: input.name.trim(),
      required_skill: input.requiredSkill.trim() || null,
      description: input.description.trim() || null,
      active: input.active,
    })
    .eq("id", serviceTypeId);
  if (error) return { ok: false, error: "Gagal menyimpan jenis layanan — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

/** Saklar cepat aktif/nonaktif tanpa membuka form penuh — dipakai dari tabel Jenis Layanan. */
export async function setServiceTypeActive(serviceTypeId: string, active: boolean): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const { error } = await access.supabase.from("service_types").update({ active }).eq("id", serviceTypeId);
  if (error) return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}

export async function deleteServiceType(serviceTypeId: string): Promise<ActionResult> {
  const access = await requireTenantMasterAccess();
  if (!access.ok) return access;

  const { count } = await access.supabase
    .from("service_packages")
    .select("id", { count: "exact", head: true })
    .eq("service_type_id", serviceTypeId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: "Jenis layanan ini masih dipakai paket harga di Manager > Catalog — nonaktifkan saja, atau hapus paketnya dulu di outlet terkait.",
    };
  }

  const { error } = await access.supabase.from("service_types").delete().eq("id", serviceTypeId);
  if (error) return { ok: false, error: "Gagal menghapus jenis layanan — pastikan akun Anda punya hak ubah master data." };

  revalidateMaster();
  return { ok: true };
}
