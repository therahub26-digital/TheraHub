import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Read layer for the current signed-in staff member's tenant row. Backs
// /admin/profile (Business Profile) — see lib/actions/tenant.ts for the
// write side and supabase/migrations/0025_tenant_business_profile.sql
// for the columns this reads.
//
// RLS already scopes `tenants` SELECT to the caller's own tenant
// (`tenants_read_own`, id = _effective_tenant_id()), so a plain
// unfiltered select naturally returns at most one row here — no need to
// resolve tenant_id from app_users first the way action-side writes do.
// ---------------------------------------------------------------------

export type TenantProfile = {
  id: string;
  brandName: string;
  legalName: string | null;
  npwp: string | null;
  website: string | null;
  instagram: string | null;
  tagline: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  invoiceFooter: string | null;
  logoTone: string;
  bgTone: string;
  logoUrl: string | null;
  backgroundPhotoUrl: string | null;
};

type TenantRow = {
  id: string;
  name: string;
  legal_name: string | null;
  npwp: string | null;
  website: string | null;
  instagram: string | null;
  tagline: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  receipt_footer: string | null;
  logo_tone: string | null;
  bg_tone: string | null;
  logo_url: string | null;
  background_photo_url: string | null;
};

function mapRow(row: TenantRow): TenantProfile {
  return {
    id: row.id,
    brandName: row.name,
    legalName: row.legal_name,
    npwp: row.npwp,
    website: row.website,
    instagram: row.instagram,
    tagline: row.tagline,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    address: row.address,
    invoiceFooter: row.receipt_footer,
    logoTone: row.logo_tone || "teal",
    bgTone: row.bg_tone || "aurora",
    logoUrl: row.logo_url,
    backgroundPhotoUrl: row.background_photo_url,
  };
}

/** For /admin/profile — the signed-in staff member's own tenant row, or null if not resolvable (e.g. demo "Ganti Role" viewer with no real session). */
export async function getCurrentTenant(): Promise<TenantProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, name, legal_name, npwp, website, instagram, tagline, email, phone, whatsapp, address, receipt_footer, logo_tone, bg_tone, logo_url, background_photo_url"
    )
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as TenantRow);
}
