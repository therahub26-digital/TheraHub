-- ============================================================
-- demo-ametspa-01-reset.sql
-- STATUS: DRAFT — belum pernah dijalankan di produksi
--
-- Mengubah tenant Amethyst menjadi tenant DEMO "Amet Spa":
-- mengosongkan seluruh data transaksional + menganonimkan data
-- orang sungguhan. Konfigurasi (katalog, komisi, payroll settings,
-- rooms, RLS) SENGAJA dipertahankan.
--
-- ⚠️ SEBELUM MENJALANKAN:
--   1. BACKUP penuh dulu (Dashboard → Database → Backups, atau pg_dump).
--      Data payroll/komisi Amethyst punya nilai administratif.
--   2. Jalankan BLOK 0 (pre-check) dulu, baca hasilnya.
--   3. Jalankan blok 1–4 SATU PER SATU (SQL Editor free tier
--      menyerah pada query berat — jangan sekali jalan semua).
--
-- Setelah skrip ini: jalankan route /api/dev-seed-ametspa dari
-- `next dev` di komputer sendiri (rebrand + roster fiktif + riwayat demo).
--
-- Yang TIDAK bisa dilakukan SQL (manual via Dashboard → Storage):
--   kosongkan bucket foto terapis & galeri (file foto orang sungguhan).
-- ============================================================


-- ============================================================
-- BLOK 0 — PRE-CHECK (baca-saja; jalankan dan simpan hasilnya)
-- ============================================================
select 'bookings' t, count(*) n from bookings
union all select 'sessions', count(*) from sessions
union all select 'transactions', count(*) from transactions
union all select 'commission_entries', count(*) from commission_entries
union all select 'payroll_items', count(*) from payroll_items
union all select 'payroll_adjustments', count(*) from payroll_adjustments
union all select 'customers', count(*) from customers
union all select 'customers (punya login)', count(*) from customers where auth_user_id is not null
union all select 'employees aktif', count(*) from employees where status = 'ACTIVE'
union all select 'employees terapis', count(*) from employees where is_therapist
union all select 'employee_personal_data', count(*) from employee_personal_data
union all select 'app_users ber-employee', count(*) from app_users where employee_id is not null;


-- ============================================================
-- BLOK 1 — KOSONGKAN SELURUH DATA TRANSAKSIONAL
-- Satu statement, supaya FK antar tabel ini tidak menghalangi.
-- TANPA CASCADE (sengaja — cascade bisa merembet ke tabel master).
-- ============================================================
truncate table
  transaction_items,
  transactions,
  commission_entries,
  extension_requests,
  sessions,
  bookings,
  payroll_items,
  payroll_adjustments,
  savings_entries,
  attendance_events,
  employee_leave_requests,
  employee_schedule_exceptions,
  notifications,
  room_alerts,
  stock_movements,
  purchase_order_items,
  purchase_orders,
  stock_transfer_items,
  stock_transfers,
  stock_opname_items,
  stock_opnames,
  expenses,
  petty_cash_movements,
  petty_cash,
  message_log,
  customers;
-- Catatan:
-- * customers ikut dikosongkan (berisi tamu nyata + data uji UAT).
--   Akun login customer demo (Budi Santoso) dibuat ulang oleh
--   /api/dev-seed-ametspa dan ditautkan kembali ke auth user yang sama.
-- * petty_cash dikosongkan — manager mengisi saldo awal lagi dari UI.
-- * payroll_settings, service_*, extension_options, add_ons, products,
--   product_stocks, rooms, outlets, tenants TIDAK disentuh.


-- ============================================================
-- BLOK 2 — HAPUS DATA PRIBADI KARYAWAN (NIK, rekening, kontak darurat)
-- ============================================================
truncate table employee_personal_data;


-- ============================================================
-- BLOK 3 — ANONIMKAN & PANGKAS ROSTER KARYAWAN
-- ============================================================
-- 3a. Lepaskan relasi referral antar karyawan (self-FK) dulu.
update employees set
  referred_by_employee_id = null,
  referral_fee_type = null,
  referral_fee_value = null
where referred_by_employee_id is not null
   or referral_fee_type is not null;

-- 3b. Hapus terapis yang TIDAK punya akun login.
--     (Dua terapis ber-akun dipertahankan; /api/dev-seed-ametspa
--      mengganti nama mereka menjadi persona fiktif.)
delete from employees
where is_therapist
  and id not in (
    select employee_id from app_users where employee_id is not null
  );

-- 3c. Anonimkan SEMUA karyawan yang tersisa:
--     foto asli dilepas, kontak diganti placeholder.
update employees set
  photo_url = null,
  gallery_urls = '{}',
  phone = '0800-0000-0000',
  email = null,
  featured = false,
  featured_badge = null,
  bio = null;


-- ============================================================
-- BLOK 4 — POST-CHECK (hasil yang diharapkan di komentar)
-- ============================================================
select 'bookings' t, count(*) n from bookings                            -- 0
union all select 'transactions', count(*) from transactions             -- 0
union all select 'commission_entries', count(*) from commission_entries -- 0
union all select 'customers', count(*) from customers                   -- 0
union all select 'employee_personal_data', count(*) from employee_personal_data -- 0
union all select 'employees terapis tersisa', count(*) from employees where is_therapist      -- 2 (yang ber-akun)
union all select 'employees dengan foto', count(*) from employees where photo_url is not null -- 0
union all select 'employees dengan email', count(*) from employees where email is not null;   -- 0

-- Cek tidak ada app_users yang kehilangan employee-nya:
select au.email, au.role, au.employee_id, e.id is not null as employee_masih_ada
from app_users au left join employees e on e.id = au.employee_id
where au.employee_id is not null;
-- Semua baris harus employee_masih_ada = true.
