-- ---------------------------------------------------------------------
-- 0042_cashier_shifts.sql
--
-- STATUS: BELUM diterapkan — jalankan di Supabase SQL Editor (proyek SG)
-- SEBELUM men-deploy kode yang membaca tabel ini (lib/data/cashierShifts.ts,
-- lib/actions/cashierShifts.ts, /kasir/closing).
--
-- Latar belakang
-- --------------
-- UAT 18 Okt 2026: /kasir/closing (Tutup Kasir) masih 100% data contoh.
-- Keputusan Adjie 18 Okt 2026:
--   1. Jumlah shift kasir per hari bisa di-setup per outlet: 1 atau 2.
--      Amet Spa memakai 1 (default).
--   2. SETIAP selisih kas (berapa pun, plus atau minus) wajib diberi alasan.
--
-- Yang ditambahkan
-- ----------------
-- 1. outlets.cashier_shifts_per_day (1 atau 2, default 1).
-- 2. cashier_shifts — satu baris per shift kasir. Angka penjualan dibekukan
--    saat tutup shift (cash_sales, non_cash, expected_cash, variance) supaya
--    riwayat tidak berubah kalau transaksi lama diedit belakangan.
--
-- Konvensi waktu: opened_at/closed_at memakai konvensi wall-clock aplikasi
-- (lihat lib/wallclock.ts) — sama dengan transactions.paid_at, sehingga
-- perbandingan rentang shift vs paid_at konsisten.
-- ---------------------------------------------------------------------

alter table outlets
  add column if not exists cashier_shifts_per_day smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outlets_cashier_shifts_per_day_check') then
    alter table outlets
      add constraint outlets_cashier_shifts_per_day_check check (cashier_shifts_per_day in (1, 2));
  end if;
end $$;

create table if not exists cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id),
  business_date date not null,
  shift_no smallint not null check (shift_no in (1, 2)),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),

  opened_at timestamptz not null,
  opened_by uuid references app_users(id),
  opened_by_name text not null,
  opening_float numeric not null check (opening_float >= 0),

  closed_at timestamptz,
  closed_by uuid references app_users(id),
  closed_by_name text,
  transaction_count integer,
  total_sales numeric,
  cash_sales numeric,
  -- {"QRIS": 120000, "Debit Card": 50000, ...} — semua metode non-tunai.
  non_cash jsonb,
  expected_cash numeric,
  counted_cash numeric check (counted_cash is null or counted_cash >= 0),
  variance numeric,
  variance_note text,

  created_at timestamptz not null default now(),

  unique (outlet_id, business_date, shift_no),
  -- Shift tertutup wajib lengkap, dan setiap selisih (≠ 0) wajib beralasan.
  constraint cashier_shifts_closed_complete check (
    status = 'OPEN'
    or (
      closed_at is not null and counted_cash is not null and expected_cash is not null and variance is not null
      and (variance = 0 or length(btrim(coalesce(variance_note, ''))) > 0)
    )
  )
);

-- Paling banyak satu shift terbuka per outlet.
create unique index if not exists cashier_shifts_one_open_per_outlet
  on cashier_shifts (outlet_id) where status = 'OPEN';

create index if not exists cashier_shifts_outlet_date_idx
  on cashier_shifts (outlet_id, business_date desc, shift_no desc);

alter table cashier_shifts enable row level security;

-- Baca: kasir/manager outlet itu sendiri, atau admin/owner se-tenant.
drop policy if exists cashier_shifts_read on cashier_shifts;
create policy cashier_shifts_read on cashier_shifts
  for select
  using (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
  );

-- Buka & tutup shift: kasir/manager outlet itu, atau admin/owner se-tenant.
-- Tidak ada policy DELETE — riwayat kas tidak boleh dihapus dari aplikasi.
drop policy if exists cashier_shifts_insert on cashier_shifts;
create policy cashier_shifts_insert on cashier_shifts
  for insert
  with check (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
  );

drop policy if exists cashier_shifts_update on cashier_shifts;
create policy cashier_shifts_update on cashier_shifts
  for update
  using (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
  )
  with check (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
  );
