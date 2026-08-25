import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { OUTLETS as MOCK_OUTLETS, ROOMS as MOCK_ROOMS } from "@/lib/mock/org";
import type { DepositPolicy, Outlet, Room } from "@/lib/types";

// ---------------------------------------------------------------------
// Outlets data-access layer — Phase 5 (migrasi mock -> database sungguhan),
// modul "outlets" (outlet + room + halaman profil publik outlet).
//
// Dual-mode by design, on purpose:
//   - Kalau request ini datang dari sesi yang login sungguhan (via /login,
//     Supabase Auth) DAN tenant-nya sudah punya outlet di database, kita
//     pakai data sungguhan (RLS di 0002_rls_policies.sql yang membatasi
//     baris mana yang boleh terlihat, bukan filter manual di sini).
//   - Kalau tidak (mis. sedang dilihat lewat "Ganti Role" — demo/preview
//     tanpa login sungguhan, ditujukan untuk showcase produk), kita jatuh
//     balik ke data mock (lib/mock/org.ts) supaya demo tetap utuh.
//
// Ini BUKAN solusi permanen: begitu portal (/admin, /owner, dst.) benar-benar
// mewajibkan login sungguhan (lihat Fase 9 — QC & staging di roadmap), mode
// fallback-ke-mock ini sebaiknya dipisah eksplisit ke rute /demo tersendiri
// alih-alih otomatis seperti sekarang.
// ---------------------------------------------------------------------

type OutletRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  lat: number;
  lng: number;
  geofence_radius: number;
  accuracy_threshold: number;
  open_hours: string | null;
  status: Outlet["status"];
  manager_name: string | null;
  late_policy: Outlet["latePolicy"];
  grace_period_min: number;
  tax_pct: number | string;
  service_charge_pct: number | string;
  // Optional: pre-0023 rows (before the migration runs) simply won't have
  // these keys — mapOutlet() below treats absence as "still enabled",
  // matching the column's own DB default.
  tax_enabled?: boolean;
  service_charge_enabled?: boolean;
  receipt_prefix: string;
  deposit_enabled: boolean;
  deposit_type: DepositPolicy["type"];
  deposit_value: number | string;
  deposit_min_ticket: number | string;
  deposit_expiry_min: number;
  deposit_refundable: boolean;
  deposit_applies_to: DepositPolicy["appliesTo"] | null;
  deposit_note: string | null;
  alarm_sound_url: string | null;
  booking_window_days: number | null;
};

type OutletProfileRow = {
  outlet_id: string;
  published: boolean;
  tagline: string;
  description: string;
  cover_url: string;
  profile_photo_url: string;
  highlights: string[] | null;
};

type FacilityRow = { id: string; outlet_id: string; name: string; icon: string; description: string; sort_order: number };
type GalleryRow = { id: string; outlet_id: string; label: string; url: string; sort_order: number };

type RoomRow = {
  id: string;
  outlet_id: string;
  code: string;
  name: string;
  type: Room["type"];
  capacity: number;
  supported_services: string[] | null;
  status: Room["status"];
  cleanup_buffer_min: number;
};

function mapOutlet(
  row: OutletRow,
  profile: OutletProfileRow | undefined,
  facilities: FacilityRow[],
  gallery: GalleryRow[],
  roomCount: number,
  therapistCount: number
): Outlet {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone ?? "",
    lat: row.lat,
    lng: row.lng,
    geofenceRadius: row.geofence_radius,
    accuracyThreshold: row.accuracy_threshold,
    openHours: row.open_hours ?? "",
    status: row.status,
    roomCount,
    therapistCount,
    managerName: row.manager_name ?? "",
    latePolicy: row.late_policy,
    gracePeriodMin: row.grace_period_min,
    taxPct: Number(row.tax_pct),
    serviceChargePct: Number(row.service_charge_pct),
    taxEnabled: row.tax_enabled ?? true,
    serviceChargeEnabled: row.service_charge_enabled ?? true,
    receiptPrefix: row.receipt_prefix,
    deposit: {
      enabled: row.deposit_enabled,
      type: row.deposit_type,
      value: Number(row.deposit_value),
      minTicket: Number(row.deposit_min_ticket),
      expiryMin: row.deposit_expiry_min,
      refundable: row.deposit_refundable,
      appliesTo: row.deposit_applies_to ?? [],
      note: row.deposit_note ?? "",
    },
    alarmSoundUrl: row.alarm_sound_url,
    bookingWindowDays: row.booking_window_days ?? 0,
    profile: {
      published: profile?.published ?? false,
      tagline: profile?.tagline ?? "",
      description: profile?.description ?? "",
      cover: profile?.cover_url ?? "",
      profilePhotoUrl: profile?.profile_photo_url ?? "",
      highlights: profile?.highlights ?? [],
      facilities: facilities.map((f) => ({ id: f.id, name: f.name, icon: f.icon, desc: f.description })),
      gallery: gallery.map((g) => ({ id: g.id, label: g.label, src: g.url })),
    },
  };
}

function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    outletId: row.outlet_id,
    code: row.code,
    name: row.name,
    type: row.type,
    capacity: row.capacity,
    supportedServices: row.supported_services ?? [],
    status: row.status,
    cleanupBuffer: row.cleanup_buffer_min,
  };
}

async function fetchLiveOutlets(): Promise<{ outlets: Outlet[]; roomsByOutlet: Record<string, Room[]> } | null> {
  const supabase = await createClient();

  // RLS (outlets_read) already scopes this to the signed-in user's tenant —
  // no manual tenant_id filter needed here. An anonymous/unauthenticated
  // request (e.g. browsing via "Ganti Role" demo) simply sees 0 rows.
  const { data: outletRows, error: outletErr } = await supabase.from("outlets").select("*").order("code");
  if (outletErr || !outletRows || outletRows.length === 0) return null;

  const outletIds = outletRows.map((o) => o.id);

  const [{ data: profileRows }, { data: facilityRows }, { data: galleryRows }, { data: roomRows }, { data: therapistRows }] =
    await Promise.all([
      supabase.from("outlet_profiles").select("*").in("outlet_id", outletIds),
      supabase.from("outlet_facilities").select("*").in("outlet_id", outletIds).order("sort_order"),
      supabase.from("outlet_gallery_photos").select("*").in("outlet_id", outletIds).order("sort_order"),
      supabase.from("rooms").select("*").in("outlet_id", outletIds).order("code"),
      supabase.from("employees").select("outlet_id").in("outlet_id", outletIds).eq("is_therapist", true),
    ]);

  const profileByOutlet = new Map<string, OutletProfileRow>((profileRows ?? []).map((p) => [p.outlet_id, p]));
  const facilitiesByOutlet = new Map<string, FacilityRow[]>();
  for (const f of facilityRows ?? []) (facilitiesByOutlet.get(f.outlet_id) ?? facilitiesByOutlet.set(f.outlet_id, []).get(f.outlet_id)!).push(f);
  const galleryByOutlet = new Map<string, GalleryRow[]>();
  for (const g of galleryRows ?? []) (galleryByOutlet.get(g.outlet_id) ?? galleryByOutlet.set(g.outlet_id, []).get(g.outlet_id)!).push(g);
  const roomsByOutlet: Record<string, Room[]> = {};
  for (const r of roomRows ?? []) (roomsByOutlet[r.outlet_id] ??= []).push(mapRoom(r));
  const therapistCountByOutlet = new Map<string, number>();
  for (const t of therapistRows ?? []) therapistCountByOutlet.set(t.outlet_id, (therapistCountByOutlet.get(t.outlet_id) ?? 0) + 1);

  const outlets = outletRows.map((row) =>
    mapOutlet(
      row,
      profileByOutlet.get(row.id),
      facilitiesByOutlet.get(row.id) ?? [],
      galleryByOutlet.get(row.id) ?? [],
      roomsByOutlet[row.id]?.length ?? 0,
      therapistCountByOutlet.get(row.id) ?? 0
    )
  );

  return { outlets, roomsByOutlet };
}

// cache() dedupes this within a single request's render tree — several
// pages/components can call getOutlets()/getOutletById() without causing
// repeat round-trips to Supabase.
const loadOutletsData = cache(async (): Promise<{ outlets: Outlet[]; roomsByOutlet: Record<string, Room[]>; live: boolean }> => {
  const live = await fetchLiveOutlets();
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

  const roomsByOutlet: Record<string, Room[]> = {};
  for (const r of MOCK_ROOMS) (roomsByOutlet[r.outletId] ??= []).push(r);
  return { outlets: MOCK_OUTLETS, roomsByOutlet, live: false };
});

export async function getOutlets(): Promise<Outlet[]> {
  return (await loadOutletsData()).outlets;
}

export async function getOutletById(id: string): Promise<Outlet | undefined> {
  return (await loadOutletsData()).outlets.find((o) => o.id === id);
}

// cache() so every page/component in one request's render tree that calls
// getCurrentOutlet() shares a single app_users lookup instead of repeating
// the round-trip.
const loadCurrentOutletId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo/"Ganti Role" viewer — no session to scope by, see file header

  const { data: appUser } = await supabase
    .from("app_users")
    .select("outlet_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return appUser?.outlet_id ?? null;
});

/**
 * The outlet a manager/kasir page should actually scope itself to.
 *
 * Every manager/kasir page used to do `const outlet = (await getOutlets())[0]`
 * — always the first outlet, Cikawao, regardless of who was signed in. That
 * meant a real Mekarwangi manager logging in would silently see and act on
 * Cikawao's bookings, payroll, and commissions — not an empty/wrong state
 * that would get noticed, just the OTHER outlet's real data. Root cause:
 * `app_users.outlet_id` (set by dev-seed / staff provisioning) was never
 * read.
 *
 * Falls back to the first outlet when there's no signed-in session (demo/
 * "Ganti Role" viewer, same convention as every other lib/data/*.ts fallback)
 * or when the signed-in account isn't bound to one outlet at all — owner and
 * admin are tenant-wide roles by design, not per-outlet, so this is the
 * correct behavior for them today, not a bug: they need an explicit outlet
 * switcher / cross-outlet aggregate view, which is separate, larger work
 * (see the roadmap doc).
 */
export async function getCurrentOutlet(): Promise<Outlet> {
  const outlets = await getOutlets();
  const outletId = await loadCurrentOutletId();
  const scoped = outletId ? outlets.find((o) => o.id === outletId) : undefined;
  return scoped ?? outlets[0];
}

export async function getRoomsForOutlet(outletId: string): Promise<Room[]> {
  return (await loadOutletsData()).roomsByOutlet[outletId] ?? [];
}

/** true kalau data yang dipakai berasal dari Supabase sungguhan, false kalau jatuh balik ke mock demo. */
export async function isLiveOutletsData(): Promise<boolean> {
  return (await loadOutletsData()).live;
}

// Pure formatting/math helpers moved to lib/deposit.ts (2026-08-24) so
// Client Components can import them without pulling in the server-only
// Supabase client this file imports at the top. Re-exported here so
// existing Server Component callers (app/admin/outlets, app/admin/settings)
// don't need to change their import path.
export { formatDepositLabel, calcDeposit } from "@/lib/deposit";
