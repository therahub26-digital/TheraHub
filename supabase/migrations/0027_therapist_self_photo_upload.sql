-- ---------------------------------------------------------------------
-- 0027_therapist_self_photo_upload.sql
--
-- STATUS: SUDAH DITERAPKAN (2026-08-25). Dikonfirmasi lewat query
-- read-only terhadap pg_policy di production: policy
-- therapist_photos_insert sekarang sudah mengandung klausa
-- `or (storage.foldername(name))[1] = _current_employee_id()::text`.
--
-- Latar belakang
-- --------------
-- Adjie (2026-08-25): "belum bisa upload foto" di halaman baru
-- /therapist/profile ("Profil Saya"), tombol "Ganti Foto" — pesan error
-- "Gagal mengunggah — coba lagi." (screenshot). Migrasi 0026 sudah
-- menambah RLS + trigger supaya seorang terapis boleh UPDATE kolom
-- photo_url di baris `employees` miliknya sendiri — tapi itu tidak
-- cukup, karena upload foto sebenarnya dua langkah:
--   1) Upload file ke Storage bucket `therapist-photos` (baru gagal di
--      sini — lihat root cause di bawah)
--   2) Baru setelah itu, panggil setTherapistProfilePhotoUrl() yang
--      menulis URL publiknya ke kolom employees.photo_url
-- 0026 hanya menyentuh langkah 2. Langkah 1 gagal duluan.
--
-- Root cause
-- ----------
-- RLS `therapist_photos_insert` (migrasi 0017) untuk bucket
-- `therapist-photos` hanya mengizinkan INSERT ke folder
-- `<employee_id>/...` kalau caller adalah manager outlet employee itu
-- atau admin/owner tenant — TIDAK ADA klausa "milik sendiri" sama
-- sekali. Itu masuk akal saat 0017 ditulis (satu-satunya uploader saat
-- itu adalah ProfilePhotoUploader di StaffEditor.tsx, dipakai Manager
-- lewat /manager/therapists → Edit). Sekarang terapis sendiri juga
-- boleh mengganti fotonya sendiri (fitur Profil Terapis, 0026) lewat
-- jalur yang sama persis (upload ke `<employee_id>/...`), tapi policy
-- Storage-nya belum diperbarui untuk itu — jadi upload-nya ditolak
-- Storage sebelum sempat sampai ke tabel employees sama sekali.
--
-- Verifikasi setelah dijalankan
-- ------------------------------
-- select policyname, cmd from pg_policies
--   where tablename = 'objects' and schemaname = 'storage'
--   and policyname like 'therapist_photos%';
--
-- Rollback
-- --------
-- drop policy if exists therapist_photos_insert on storage.objects;
-- create policy therapist_photos_insert on storage.objects
--   for insert to authenticated
--   with check (
--     bucket_id = 'therapist-photos'
--     and (storage.foldername(name))[1] in (
--       select id::text from employees where _is_manager_here(outlet_id) or _is_admin_or_owner()
--     )
--   );
-- ---------------------------------------------------------------------

drop policy if exists therapist_photos_insert on storage.objects;
create policy therapist_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'therapist-photos'
    and (
      (storage.foldername(name))[1] in (
        select id::text from employees where _is_manager_here(outlet_id) or _is_admin_or_owner()
      )
      or (storage.foldername(name))[1] = _current_employee_id()::text
    )
  );
