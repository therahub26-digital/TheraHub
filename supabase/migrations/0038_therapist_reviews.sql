-- ---------------------------------------------------------------------
-- 0038_therapist_reviews.sql
--
-- STATUS: SUDAH DITERAPKAN — dijalankan Adjie via SQL Editor 2026-10-15
-- 19:49 WIB, "Success. No rows returned" (screenshot snippet 038).
-- Jalankan SEBELUM deploy kode gelombang "review kinerja terapis" —
-- halaman kinerja & form rating customer membaca/menulis kedua tabel
-- ini. Tanpa migrasi, pembacaannya jatuh ke "belum ada data" (error
-- ditelan jadi []), tapi penulisan rating akan gagal.
--
-- Latar belakang (Adjie, 2026-10-15 malam):
--   "tambahkan penilaian untuk therapis untuk penilaian managemen,
--    bintang 1-5 dan keterangan. feature review kinerja therapis untuk
--    manager dan owner: bisa dicek dari jumlah tamu setiap bulan,
--    tingkat kehadiran dan terlambat, ijin dalam sebulan, penilaian
--    customer"
--
-- Dua sumber data baru yang dibutuhkan halaman review kinerja:
--
-- (1) customer_reviews — penilaian tamu per KUNJUNGAN (booking) yang
--     sudah dibayar: bintang 1–5 + komentar, maksimal satu per booking
--     (UNIQUE booking_id). Sampai sekarang "rating terapis" tidak punya
--     sumber data sama sekali (kolom Rating di portal owner dihapus
--     2026-08-26 justru karena itu) — tabel ini sumbernya.
--     `visit_date` disalin dari bookings.date saat insert (pola
--     snapshot beku §6.6): rekap bulanan mengelompokkan penilaian ke
--     BULAN KUNJUNGAN, dan pengelompokan itu tidak boleh berubah kalau
--     suatu saat baris booking diarsipkan/dipindah.
--
-- (2) therapist_management_reviews — penilaian MANAJEMEN per terapis
--     per bulan (period 'YYYY-MM'): bintang 1–5 + keterangan, diisi
--     manager outlet (admin/owner juga boleh). UNIQUE (employee_id,
--     period): penilaian bulan yang sama di-upsert, bukan ditumpuk.
--
-- RLS:
--  - customer_reviews: customer insert hanya untuk dirinya sendiri
--    (customer_id = _current_customer_id(); kepemilikan & status PAID
--    booking divalidasi server action sebelum insert) dan baca miliknya
--    sendiri; staf tenant baca semua (shape yang sama dengan
--    attendance_events_read). Tidak ada UPDATE/DELETE siapa pun —
--    penilaian yang sudah dikirim tidak bisa diedit diam-diam.
--  - therapist_management_reviews: manager outlet ybs atau admin/owner,
--    baca dan tulis. SENGAJA TANPA akses terapis dan kasir — ini
--    catatan penilaian manajemen, bukan konsumsi yang dinilai.
--
-- Verifikasi setelah dijalankan:
--   select tablename, policyname from pg_policies
--    where tablename in ('customer_reviews','therapist_management_reviews')
--    order by 1, 2;  -- 5 baris
-- ---------------------------------------------------------------------

create table if not exists customer_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  booking_id uuid not null unique references bookings(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  visit_date date not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table customer_reviews enable row level security;

drop policy if exists customer_reviews_customer_insert on customer_reviews;
create policy customer_reviews_customer_insert on customer_reviews
  for insert to authenticated
  with check (customer_id = _current_customer_id());

drop policy if exists customer_reviews_customer_read on customer_reviews;
create policy customer_reviews_customer_read on customer_reviews
  for select to authenticated
  using (customer_id = _current_customer_id());

drop policy if exists customer_reviews_staff_read on customer_reviews;
create policy customer_reviews_staff_read on customer_reviews
  for select to authenticated
  using (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()));

create index if not exists customer_reviews_employee_date_idx on customer_reviews(employee_id, visit_date);
create index if not exists customer_reviews_outlet_date_idx on customer_reviews(outlet_id, visit_date);

create table if not exists therapist_management_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  rating smallint not null check (rating between 1 and 5),
  note text,
  reviewed_by uuid references employees(id),
  -- Metadata UTC asli (§6.1 frame kedua): default now() untuk INSERT;
  -- jalur upsert aplikasi menulis ulang dengan new Date().toISOString().
  updated_at timestamptz not null default now(),
  unique (employee_id, period)
);

alter table therapist_management_reviews enable row level security;

drop policy if exists therapist_management_reviews_staff on therapist_management_reviews;
create policy therapist_management_reviews_staff on therapist_management_reviews
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create index if not exists therapist_management_reviews_period_idx on therapist_management_reviews(outlet_id, period);

-- Rollback kalau perlu:
--   drop table if exists therapist_management_reviews;
--   drop table if exists customer_reviews;
