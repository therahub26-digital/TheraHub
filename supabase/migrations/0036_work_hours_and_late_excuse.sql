-- ---------------------------------------------------------------------
-- 0036_work_hours_and_late_excuse.sql
--
-- STATUS: DRAFT — belum dijalankan ke produksi.
-- ⚠️ URUTAN DEPLOY: jalankan migrasi ini DULU, baru push/deploy kode
-- yang memakainya. lib/actions/outlets.ts (setOutletIdentity) menulis
-- kolom work_start_time/work_end_time secara eksplisit — tanpa kolomnya,
-- tombol simpan outlet di /admin/outlets gagal total. Jalur BACA sudah
-- toleran (select("*") + fallback default), jadi hanya jalur tulis yang
-- bergantung pada urutan ini.
--
-- Latar belakang (Adjie, 2026-10-15)
-- ----------------------------------
-- "buatkan alert untuk karyawan dan therapis yang tidak ada keterangan
--  cuti/sakit, tapi belum absen 5 menit sebelum waktunya ... tambahkan
--  di setup juga jam masuk dan pulang, defaultnya jam 10.00-22.00 bisa
--  dirubah sesuai ketentuan masing2 lokasi"
--
-- Dua hal yang dibutuhkan skema:
--
-- (1) Jam masuk & pulang per outlet. Selama ini satu-satunya "jam" di
--     outlets adalah open_hours, string bebas ("Setiap hari ·
--     10:00–22:00") yang dipakai lib/actions/attendance.ts dengan
--     mem-parse "HH:mm" pertama — proksi, bukan pengaturan. Dua kolom
--     text "HH:mm" baru (bukan tipe `time`) supaya satu konvensi dengan
--     seluruh aplikasi (lib/wallclock.ts bekerja dengan string "HH:mm";
--     tipe time akan terbaca "10:00:00" dan menambah satu titik potong
--     string lagi). CHECK memastikan formatnya selalu HH:mm valid.
--
-- (2) Jenis keterangan baru 'LATE' ("Ijin Masuk Siang") di
--     employee_leave_requests. Alur yang diminta: terapis yang kena
--     alert bisa langsung kirim keterangan (sakit dadakan / keperluan /
--     ijin masuk siang) untuk di-ACC manager. Sakit dadakan = LEAVE dan
--     keperluan sehari penuh = OFF sudah ada; yang belum ada adalah
--     "tetap masuk, tapi siang". LATE SENGAJA TIDAK ditulis ke
--     employee_schedule_exceptions saat disetujui (lihat
--     approveLeaveRequest) — terapis LATE tetap bekerja hari itu dan
--     tetap bisa menerima booking; yang ditekan hanya alert absensinya.
--     CHECK lama dari 0024 (OFF/LEAVE) dilebarkan.
--
-- Verifikasi setelah dijalankan:
--   select column_name, column_default from information_schema.columns
--    where table_name = 'outlets'
--      and column_name in ('work_start_time', 'work_end_time');
--   select conname from pg_constraint
--    where conrelid = 'employee_leave_requests'::regclass
--      and conname = 'employee_leave_requests_type_check';
-- ---------------------------------------------------------------------

alter table outlets
  add column if not exists work_start_time text not null default '10:00'
    constraint outlets_work_start_time_format check (work_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists work_end_time text not null default '22:00'
    constraint outlets_work_end_time_format check (work_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- CHECK inline dari 0024 mendapat nama otomatis
-- employee_leave_requests_type_check — dilebarkan untuk 'LATE'.
alter table employee_leave_requests
  drop constraint if exists employee_leave_requests_type_check;
alter table employee_leave_requests
  add constraint employee_leave_requests_type_check check (type in ('OFF', 'LEAVE', 'LATE'));

-- Rollback kalau perlu (hanya aman selama belum ada baris LATE):
--   alter table outlets drop column if exists work_start_time, drop column if exists work_end_time;
--   alter table employee_leave_requests drop constraint if exists employee_leave_requests_type_check;
--   alter table employee_leave_requests add constraint employee_leave_requests_type_check check (type in ('OFF', 'LEAVE'));
