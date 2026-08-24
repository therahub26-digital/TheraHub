-- ---------------------------------------------------------------------
-- 0025_tenant_business_profile.sql
--
-- STATUS: DRAFT — BELUM DITERAPKAN. Jalankan manual lewat Supabase SQL
-- Editor, lalu update header ini jadi "SUDAH DITERAPKAN" setelah
-- diverifikasi (pola yang sama seperti 0022/0023/0024).
--
-- Latar belakang
-- --------------
-- User (2026-08-25): halaman /admin/profile (Business Profile) "belum
-- fungsi" — panel Identitas Bisnis/Kontak/Footer memakai defaultValue
-- statis dari mock (BUSINESS_PROFILE), tombol Simpan Perubahan sengaja
-- disabled ("belum ada jalur simpan"), dan panel Brand/Logo/Background
-- (BrandPicker di components/ui.tsx) sepenuhnya dekoratif — swatch warna
-- tidak punya onClick, tombol unggah logo & unggah background custom
-- disabled. Confirmed lewat information_schema.columns: tabel `tenants`
-- SUDAH punya kolom logo_tone/bg_tone (default 'teal'/'aurora') dari
-- skema awal, tapi TIDAK ADA kolom untuk identitas/kontak/footer/logo
-- url/background foto kustom, dan TIDAK ADA RLS UPDATE policy sama
-- sekali di tabel tenants (cuma service_role_all + tenants_read_own).
--
-- Migrasi ini menambahkan kolom yang hilang + policy tulis, supaya
-- lib/actions/tenant.ts (baru) punya tempat menyimpan. logo_tone/bg_tone
-- TIDAK diubah — sudah ada dan sudah dipakai (nilainya salah satu key
-- BRAND_PRESETS/BACKGROUND_PRESETS di lib/brand.ts, divalidasi di sisi
-- action sebelum ditulis).
-- ---------------------------------------------------------------------

alter table tenants
  add column if not exists npwp text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists tagline text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists address text,
  add column if not exists receipt_footer text,
  add column if not exists logo_url text,
  add column if not exists background_photo_url text;

-- Admin/Owner tenant yang bersangkutan boleh mengubah profil bisnisnya
-- sendiri. Dulu tidak ada policy UPDATE sama sekali di tabel ini — setiap
-- percobaan update dari RLS-governed client akan mempengaruhi 0 baris
-- tanpa error eksplisit (bukan gagal, tapi diam-diam tidak berubah).
drop policy if exists tenants_write_admin on tenants;
create policy tenants_write_admin on tenants
  for update to authenticated
  using (id = _effective_tenant_id() and _is_admin_or_owner())
  with check (id = _effective_tenant_id() and _is_admin_or_owner());

-- Bucket untuk logo bisnis + foto background kustom tenant. Public read
-- (dipakai di seluruh portal sebagai aset visual), tulis dibatasi ke
-- admin/owner tenant yang bersangkutan, dengan path <tenantId>/... —
-- pola yang sama seperti bucket therapist-photos (0017), tapi discope
-- per-tenant (folder pertama = tenant id) bukan per-employee.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-branding', 'tenant-branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tenant_branding_read on storage.objects;
create policy tenant_branding_read on storage.objects
  for select to public
  using (bucket_id = 'tenant-branding');

drop policy if exists tenant_branding_insert on storage.objects;
create policy tenant_branding_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-branding' and (storage.foldername(name))[1] = _current_tenant_id()::text and _is_admin_or_owner());

drop policy if exists tenant_branding_update on storage.objects;
create policy tenant_branding_update on storage.objects
  for update to authenticated
  using (bucket_id = 'tenant-branding' and (storage.foldername(name))[1] = _current_tenant_id()::text and _is_admin_or_owner());

drop policy if exists tenant_branding_delete on storage.objects;
create policy tenant_branding_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-branding' and (storage.foldername(name))[1] = _current_tenant_id()::text and _is_admin_or_owner());

-- Verifikasi setelah menjalankan:
--   select column_name from information_schema.columns where table_name = 'tenants' and column_name in
--     ('npwp','website','instagram','tagline','email','phone','whatsapp','address','receipt_footer','logo_url','background_photo_url');
--   select policyname, cmd from pg_policies where tablename = 'tenants';
--   select id from storage.buckets where id = 'tenant-branding';

-- Rollback kalau perlu:
--   alter table tenants drop column if exists npwp, drop column if exists website, drop column if exists instagram,
--     drop column if exists tagline, drop column if exists email, drop column if exists phone,
--     drop column if exists whatsapp, drop column if exists address, drop column if exists receipt_footer,
--     drop column if exists logo_url, drop column if exists background_photo_url;
--   drop policy if exists tenants_write_admin on tenants;
--   drop policy if exists tenant_branding_read on storage.objects;
--   drop policy if exists tenant_branding_insert on storage.objects;
--   drop policy if exists tenant_branding_update on storage.objects;
--   drop policy if exists tenant_branding_delete on storage.objects;
--   delete from storage.buckets where id = 'tenant-branding';
