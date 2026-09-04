import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { KNOWN_TENANT_SLUGS } from "@/lib/tenantDomains";
import type { MassageIntensity } from "@/lib/types";

// ---------------------------------------------------------------------
// Data untuk LANDING PAGE PUBLIK tenant (app/welcome/[tenant]) —
// halaman yang dilihat tamu TANPA login, di domain tenant sendiri
// (amethystbdg.my.id). 2026-09-04, permintaan Adjie: tiap tenant punya
// website sebelum masuk ke aplikasi.
//
// KENAPA createAdminClient(), padahal §6.8 mengharuskan validasi dulu:
// halaman ini publik — tidak ada sesi untuk divalidasi, dan RLS memang
// tidak mengizinkan anon membaca employees (dan tidak boleh diizinkan:
// tabel itu memuat base_salary). Validasinya di sini adalah SLUG, bukan
// sesi: hanya slug yang terdaftar di lib/tenantDomains.ts (konstanta
// server, bukan input user) yang pernah sampai ke query. Slug lain —
// termasuk yang diketik orang langsung di /welcome/apapun — berhenti di
// baris pertama dengan null, sebelum admin client dibuat.
//
// Dan yang di-SELECT dijaga sesempit mungkin: hanya kolom yang memang
// tampil di website publik. TIDAK ADA base_salary, phone/email terapis,
// koordinat GPS, kebijakan pajak, atau apa pun yang bersifat internal.
// Kolom di query ini adalah daftar lengkap yang boleh bocor ke publik —
// kalau menambah kolom, tanya dulu "pantas tampil di website?".
// ---------------------------------------------------------------------

export type LandingTherapist = {
  name: string;
  photoUrl: string | null;
  /** null = admin belum mengatur — kartu tampil tanpa badge, bukan "Medium". */
  intensity: MassageIntensity | null;
};

export type LandingOutlet = {
  name: string;
  address: string;
  city: string;
  phone: string;
  openHours: string;
  tagline: string;
  description: string;
  coverUrl: string;
  highlights: string[];
  facilities: { name: string; icon: string; desc: string }[];
  gallery: { label: string; src: string }[];
};

export type LandingData = {
  tenantName: string;
  tagline: string;
  whatsapp: string;
  instagram: string;
  logoUrl: string | null;
  logoTone: string;
  outlets: LandingOutlet[];
  therapists: LandingTherapist[];
};

export const getLandingData = cache(async (slug: string): Promise<LandingData | null> => {
  // Validasi-lalu-eskalasi: slug harus dari peta domain, bukan dari URL bebas.
  if (!KNOWN_TENANT_SLUGS.includes(slug)) return null;

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, tagline, whatsapp, instagram, logo_url, logo_tone")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const { data: outletRows } = await admin
    .from("outlets")
    .select("id, name, address, city, phone, open_hours")
    .eq("tenant_id", tenant.id)
    .eq("status", "ACTIVE")
    .order("code");
  if (!outletRows || outletRows.length === 0) return null;

  const outletIds = outletRows.map((o) => o.id as string);

  const [{ data: profileRows }, { data: facilityRows }, { data: galleryRows }, { data: therapistRows }] =
    await Promise.all([
      // Hanya profil yang admin PUBLISH — saklar yang sama dengan yang
      // mengatur tampil/tidaknya outlet di Customer App.
      admin
        .from("outlet_profiles")
        .select("outlet_id, published, tagline, description, cover_url, highlights")
        .in("outlet_id", outletIds)
        .eq("published", true),
      admin
        .from("outlet_facilities")
        .select("outlet_id, name, icon, description, sort_order")
        .in("outlet_id", outletIds)
        .order("sort_order"),
      admin
        .from("outlet_gallery_photos")
        .select("outlet_id, label, url, sort_order")
        .in("outlet_id", outletIds)
        .order("sort_order"),
      // Terapis: HANYA nama, foto, tingkat pijatan. Tidak ada kontak,
      // gaji, atau kolom internal lain.
      admin
        .from("employees")
        .select("name, photo_url, massage_intensity")
        .in("outlet_id", outletIds)
        .eq("is_therapist", true)
        .eq("status", "ACTIVE")
        .order("name"),
    ]);

  const profileByOutlet = new Map((profileRows ?? []).map((p) => [p.outlet_id as string, p]));

  const outlets: LandingOutlet[] = outletRows.map((o) => {
    const p = profileByOutlet.get(o.id as string);
    return {
      name: (o.name as string) ?? "",
      address: (o.address as string) ?? "",
      city: (o.city as string) ?? "",
      phone: (o.phone as string) ?? "",
      openHours: (o.open_hours as string) ?? "",
      tagline: (p?.tagline as string) ?? "",
      description: (p?.description as string) ?? "",
      coverUrl: (p?.cover_url as string) ?? "",
      highlights: (p?.highlights as string[] | null) ?? [],
      facilities: (facilityRows ?? [])
        .filter((f) => f.outlet_id === o.id)
        .map((f) => ({ name: f.name as string, icon: f.icon as string, desc: (f.description as string) ?? "" })),
      gallery: (galleryRows ?? [])
        .filter((g) => g.outlet_id === o.id)
        .map((g) => ({ label: (g.label as string) ?? "", src: g.url as string })),
    };
  });

  const therapists: LandingTherapist[] = (therapistRows ?? []).map((t) => ({
    name: t.name as string,
    photoUrl: (t.photo_url as string | null) ?? null,
    intensity: (t.massage_intensity as MassageIntensity | null) ?? null,
  }));

  return {
    tenantName: (tenant.name as string) ?? "",
    tagline: (tenant.tagline as string) ?? "",
    whatsapp: (tenant.whatsapp as string) ?? "",
    instagram: (tenant.instagram as string) ?? "",
    logoUrl: (tenant.logo_url as string | null) ?? null,
    logoTone: (tenant.logo_tone as string) ?? "violet",
    outlets,
    therapists,
  };
});
