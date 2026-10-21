-- 0044_tenant_poster_settings.sql
-- ---------------------------------------------------------------------
-- Pengaturan poster "Our Squad Today" per tenant (2026-10-21, Adjie:
-- "image header dan warna background bisa di setup admin sesuai masing2
-- spa"). Semua kolom NULLABLE — null = pakai default turunan warna brand,
-- jadi tenant lama tidak berubah apa-apa sampai admin mengaturnya.
--
--   poster_header_url    gambar header (bucket tenant-branding, sama seperti logo)
--   poster_bg_color      warna pita atas/bawah poster, hex #RRGGBB
--   poster_accent_color  warna judul, nomor, garis ornamen, hex #RRGGBB
--   poster_title         teks judul kecil, mis. "OUR SQUAD TODAY"
--
-- RLS: tidak perlu policy baru — kolom ikut policy UPDATE tenants yang
-- sudah dipakai setTenantLogoUrl / setTenantBrand (admin/owner tenant).
-- Aditif & aman diulang.
-- ---------------------------------------------------------------------

alter table public.tenants add column if not exists poster_header_url text;
alter table public.tenants add column if not exists poster_bg_color text;
alter table public.tenants add column if not exists poster_accent_color text;
alter table public.tenants add column if not exists poster_title text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_poster_bg_color_hex') then
    alter table public.tenants add constraint tenants_poster_bg_color_hex
      check (poster_bg_color is null or poster_bg_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_poster_accent_color_hex') then
    alter table public.tenants add constraint tenants_poster_accent_color_hex
      check (poster_accent_color is null or poster_accent_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_poster_title_len') then
    alter table public.tenants add constraint tenants_poster_title_len
      check (poster_title is null or char_length(poster_title) <= 40);
  end if;
end $$;
