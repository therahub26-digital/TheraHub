-- ---------------------------------------------------------------------
-- 0028_outlet_photos_bucket.sql
--
-- STATUS: DRAFT — BELUM DITERAPKAN. Jalankan manual lewat Supabase SQL
-- Editor, lalu update header ini jadi "SUDAH DITERAPKAN" setelah
-- diverifikasi (pola yang sama seperti 0022-0027).
--
-- Latar belakang
-- --------------
-- Adjie (2026-08-25): "outlet: halaman profil outlet belum berfungsi".
-- Halaman /admin/outlets/[id]/profile selama ini murni pratinjau —
-- tombol Simpan Perubahan, unggah/hapus foto, Tambah Fasilitas, Tambah
-- Foto, dan saklar publikasi semuanya `disabled`.
--
-- Yang TIDAK perlu diubah (sudah ada sejak awal)
-- -----------------------------------------------
-- Tabel `outlet_profiles`, `outlet_facilities`, dan
-- `outlet_gallery_photos` SUDAH ada di database, dan RLS tulisnya
-- SUDAH lengkap sejak migrasi 0002 (`outlet_profiles_write`,
-- `outlet_facilities_write`, `outlet_gallery_photos_write` — ketiganya
-- `for all`, jadi sudah mencakup INSERT/UPDATE/DELETE, untuk
-- admin/owner tenant sendiri ATAU manager outlet yang bersangkutan).
-- Dikonfirmasi lewat query read-only ke production 2026-08-25.
-- Jadi migrasi ini TIDAK menyentuh RLS tabel sama sekali — yang hilang
-- cuma tempat menyimpan FILE fotonya.
--
-- Yang ditambahkan migrasi ini
-- -----------------------------
-- Bucket Storage `outlet-photos` untuk foto cover + galeri fasilitas
-- outlet, dengan konvensi folder `<outlet_id>/...` (pola yang sama
-- seperti `therapist-photos` di 0017 dan `tenant-branding` di 0025).
-- Sebelumnya cuma ada 3 bucket: alarm-sounds, therapist-photos,
-- tenant-branding — tidak ada tempat untuk foto outlet.
--
-- Batas ukuran: 512000 byte (500 KB) sebagai pengaman server. Batas
-- yang sebenarnya ditegakkan lebih ketat di sisi client mengikuti
-- lib/media.ts (cover maks 300 KB, galeri maks 250 KB) supaya pesan
-- errornya lebih ramah dan filenya tidak terlanjur terkirim.
--
-- Verifikasi setelah dijalankan
-- ------------------------------
-- select id, public, file_size_limit from storage.buckets
--   where id = 'outlet-photos';  -- harus 1 row
-- select policyname, cmd from pg_policies
--   where tablename = 'objects' and schemaname = 'storage'
--   and policyname like 'outlet_photos%';  -- harus 4 row
--
-- Rollback
-- --------
-- drop policy if exists outlet_photos_read on storage.objects;
-- drop policy if exists outlet_photos_insert on storage.objects;
-- drop policy if exists outlet_photos_update on storage.objects;
-- drop policy if exists outlet_photos_delete on storage.objects;
-- delete from storage.buckets where id = 'outlet-photos';
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'outlet-photos',
  'outlet-photos',
  true,
  512000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Baca: publik. Halaman profil outlet memang halaman iklan yang dilihat
-- tamu yang belum login sama sekali (/customer/outlets/[id]), jadi
-- fotonya harus bisa diakses tanpa sesi — sama seperti therapist-photos.
drop policy if exists outlet_photos_read on storage.objects;
create policy outlet_photos_read on storage.objects
  for select to public
  using (bucket_id = 'outlet-photos');

-- Tulis: hanya admin/owner tenant pemilik outlet, atau manager outlet
-- itu sendiri. Folder tingkat pertama harus persis outlet_id-nya, jadi
-- manager outlet A tidak bisa menulis ke folder outlet B.
drop policy if exists outlet_photos_insert on storage.objects;
create policy outlet_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'outlet-photos'
    and (storage.foldername(name))[1] in (
      select id::text from outlets
      where (_is_admin_or_owner() and tenant_id = _current_tenant_id())
         or _is_manager_here(id)
    )
  );

drop policy if exists outlet_photos_update on storage.objects;
create policy outlet_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'outlet-photos'
    and (storage.foldername(name))[1] in (
      select id::text from outlets
      where (_is_admin_or_owner() and tenant_id = _current_tenant_id())
         or _is_manager_here(id)
    )
  );

drop policy if exists outlet_photos_delete on storage.objects;
create policy outlet_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'outlet-photos'
    and (storage.foldername(name))[1] in (
      select id::text from outlets
      where (_is_admin_or_owner() and tenant_id = _current_tenant_id())
         or _is_manager_here(id)
    )
  );
