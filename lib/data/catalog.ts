import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIES as MOCK_CATEGORIES,
  SERVICE_TYPES as MOCK_SERVICE_TYPES,
  PACKAGES as MOCK_PACKAGES,
  EXTENSIONS as MOCK_EXTENSIONS,
  ADDONS as MOCK_ADDONS,
} from "@/lib/mock/catalog";
import type { ServiceCategory, ServiceType, ServicePackage, ExtensionOption, AddOn } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for the "catalog" module (service
// categories/types/packages + extension options + add-ons) — same
// pattern as lib/data/outlets.ts / lib/data/employees.ts.
//
// Real Amethyst pricing (per user, chat 2026-08-20) is intentionally
// minimal — there is only ONE real combined package right now
// ("Traditional Massage / Basic Shiatsu + Therapy PM", 90 minutes,
// Rp180.000) plus one extension option (Rp50.000). Everything the user
// did NOT give a real number for (member price, weekend price,
// commission, extension duration, materials) is seeded as an explicit
// placeholder — see the comments in app/api/dev-seed/route.ts section
// 10 for exactly which fields are real vs. placeholder.
// ---------------------------------------------------------------------

type CategoryRow = { id: string; tenant_id: string; name: string; icon: string | null; description: string | null };
type ServiceTypeRow = { id: string; category_id: string; name: string; required_skill: string | null; description: string | null; active: boolean };
type PackageRow = {
  id: string;
  outlet_id: string;
  service_type_id: string;
  name: string;
  duration_min: number;
  list_price: number | string;
  member_price: number | string;
  weekend_price: number | string;
  room_type: string | null;
  required_skill: string | null;
  buffer_before_min: number;
  buffer_after_min: number;
  extension_allowed: boolean;
  commission_type: string;
  commission_value: number | string;
  status: string;
  materials: { name: string; qty: string }[] | null;
};
type ExtensionRow = { id: string; outlet_id: string; name: string; duration_min: number; price: number | string; commission_type: "fixed" | "percent"; commission: number | string; active: boolean };
type AddOnRow = { id: string; outlet_id: string; name: string; duration_min: number; price: number | string; commission_type: "fixed" | "percent"; commission: number | string; active: boolean };

function mapCategory(row: CategoryRow): ServiceCategory {
  return { id: row.id, tenantId: row.tenant_id, name: row.name, icon: row.icon ?? "layers", description: row.description ?? "" };
}

function mapServiceType(row: ServiceTypeRow): ServiceType {
  return { id: row.id, categoryId: row.category_id, name: row.name, requiredSkill: row.required_skill ?? "", description: row.description ?? "", active: row.active };
}

function mapPackage(row: PackageRow, allowedExtensionIds: string[]): ServicePackage {
  return {
    id: row.id,
    outletId: row.outlet_id,
    serviceTypeId: row.service_type_id,
    name: row.name,
    durationMin: row.duration_min,
    listPrice: Number(row.list_price),
    memberPrice: Number(row.member_price),
    weekendPrice: Number(row.weekend_price),
    roomType: row.room_type ?? "Massage",
    requiredSkill: row.required_skill ?? "",
    bufferBefore: row.buffer_before_min,
    bufferAfter: row.buffer_after_min,
    extensionAllowed: row.extension_allowed,
    allowedExtensionIds,
    commissionType: row.commission_type as ServicePackage["commissionType"],
    commissionValue: Number(row.commission_value),
    status: row.status as ServicePackage["status"],
    popularity: 100, // no real popularity/usage data yet — single real package, not a ranking
    materials: row.materials ?? [],
  };
}

function mapExtension(row: ExtensionRow): ExtensionOption {
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    durationMin: row.duration_min,
    price: Number(row.price),
    commissionType: row.commission_type ?? "fixed",
    commission: Number(row.commission),
    active: row.active,
  };
}

function mapAddOn(row: AddOnRow): AddOn {
  return {
    id: row.id,
    outletId: row.outlet_id,
    name: row.name,
    durationMin: row.duration_min,
    price: Number(row.price),
    commissionType: row.commission_type ?? "fixed",
    commission: Number(row.commission),
    active: row.active,
  };
}

async function fetchLiveCatalog(): Promise<{
  categories: ServiceCategory[];
  serviceTypes: ServiceType[];
  packages: ServicePackage[];
  extensions: ExtensionOption[];
  addons: AddOn[];
} | null> {
  const supabase = await createClient();

  // Master Initial (2026-08-25, backlog item 3/3) — categories/types used
  // to be derived FROM whatever packages already existed, which meant a
  // brand new category/service type created via Master Initial (with zero
  // packages yet) could never appear anywhere, including in Manager >
  // Catalog's own "Tambah Paket" dropdown — a chicken-and-egg bug that
  // would have made "tambahkan [jenis layanan baru]" from Master Initial
  // silently do nothing useful. Categories are now fetched first,
  // tenant-wide (RLS `service_categories_read` already scopes this to
  // `_effective_tenant_id()`), independent of whether any package
  // references them yet.
  const { data: categoryRows, error: catErr } = await supabase.from("service_categories").select("*").order("name");
  if (catErr || !categoryRows || categoryRows.length === 0) return null;

  const categoryIds = categoryRows.map((c) => c.id);
  const { data: typeRows } = await supabase.from("service_types").select("*").in("category_id", categoryIds).order("name");
  const serviceTypeIds = (typeRows ?? []).map((t) => t.id);

  const { data: packageRows } = await supabase.from("service_packages").select("*").order("name");
  const packageIds = (packageRows as PackageRow[] | null ?? []).map((p) => p.id);
  const outletIds = [...new Set((packageRows as PackageRow[] | null ?? []).map((p) => p.outlet_id))];

  const [{ data: allowedRows }, { data: extensionRows }, { data: addonRows }] = await Promise.all([
    packageIds.length ? supabase.from("service_package_allowed_extensions").select("*").in("package_id", packageIds) : Promise.resolve({ data: [] as { package_id: string; extension_id: string }[] }),
    outletIds.length ? supabase.from("extension_options").select("*").in("outlet_id", outletIds) : Promise.resolve({ data: [] as ExtensionRow[] }),
    outletIds.length ? supabase.from("add_ons").select("*").in("outlet_id", outletIds) : Promise.resolve({ data: [] as AddOnRow[] }),
  ]);
  void serviceTypeIds; // kept for clarity of intent even though `.in` above already narrows by category

  const allowedByPackage = new Map<string, string[]>();
  for (const row of allowedRows ?? []) {
    const list = allowedByPackage.get(row.package_id) ?? [];
    list.push(row.extension_id);
    allowedByPackage.set(row.package_id, list);
  }

  return {
    categories: categoryRows.map(mapCategory),
    serviceTypes: (typeRows ?? []).map(mapServiceType),
    packages: (packageRows as PackageRow[] | null ?? []).map((p) => mapPackage(p, allowedByPackage.get(p.id) ?? [])),
    extensions: (extensionRows ?? []).map(mapExtension),
    addons: (addonRows ?? []).map(mapAddOn),
  };
}

const loadCatalogData = cache(async () => {
  const live = await fetchLiveCatalog();
  // Cek `!== null` eksplisit (diselaraskan 2026-08-24, backlog 7.3) — pola
  // yang sama seperti lib/data/bookings.ts. `if (live)` saja kebetulan
  // benar hari ini karena fetchLive...() di atas mengembalikan null saat
  // hasilnya kosong, tapi itu bergantung pada detail yang mudah hilang:
  // begitu ada yang mengubahnya jadi mengembalikan [] (atau objek dengan
  // array kosong) untuk "sesi asli, memang belum ada datanya", array
  // kosong yang truthy akan diam-diam tetap masuk cabang live/mock yang
  // salah tanpa error apa pun. null di sini berarti satu hal saja: tidak
  // ada sesi live, jatuh ke data mock demo.
  if (live !== null) return { ...live, live: true };
  return {
    categories: MOCK_CATEGORIES,
    serviceTypes: MOCK_SERVICE_TYPES,
    packages: MOCK_PACKAGES,
    extensions: MOCK_EXTENSIONS,
    addons: MOCK_ADDONS,
    live: false,
  };
});

export async function getCategories(): Promise<ServiceCategory[]> {
  return (await loadCatalogData()).categories;
}

export async function getServiceTypes(): Promise<ServiceType[]> {
  return (await loadCatalogData()).serviceTypes;
}

export async function getPackagesForOutlet(outletId: string): Promise<ServicePackage[]> {
  return (await loadCatalogData()).packages.filter((p) => p.outletId === outletId);
}

export async function getExtensionsForOutlet(outletId: string): Promise<ExtensionOption[]> {
  return (await loadCatalogData()).extensions.filter((e) => e.outletId === outletId);
}

export async function getAddonsForOutlet(outletId: string): Promise<AddOn[]> {
  return (await loadCatalogData()).addons.filter((a) => a.outletId === outletId);
}

export async function isLiveCatalogData(): Promise<boolean> {
  return (await loadCatalogData()).live;
}
