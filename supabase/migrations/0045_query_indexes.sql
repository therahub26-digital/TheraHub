-- 0045 — Index untuk pola query aplikasi (audit performa 2026-10-23)
--
-- Loader booking/sesi/transaksi/payroll sekarang memfilter DI DATABASE
-- (outlet + tanggal, customer, terapis, status) alih-alih menarik seluruh
-- tabel. 0040 sudah memberi index tunggal untuk setiap foreign key; index
-- gabungan di bawah ini membuat filter "outlet X pada rentang tanggal Y"
-- dan sweep no-show/overrun cukup membaca baris yang relevan.
--
-- Aman dijalankan ulang (IF NOT EXISTS), tidak mengubah data atau RLS.
-- Jalankan sekali di Supabase → SQL Editor.

-- Booking: daftar harian/mingguan per outlet, riwayat customer, sweep no-show
create index if not exists bookings_outlet_date_idx      on public.bookings (outlet_id, date, scheduled_start);
create index if not exists bookings_customer_date_idx    on public.bookings (customer_id, date);
create index if not exists bookings_outlet_paid_idx      on public.bookings (outlet_id, date) where status = 'PAID';
create index if not exists bookings_noshow_sweep_idx     on public.bookings (scheduled_start) where status in ('BOOKED', 'CONFIRMED');

-- Sesi: sesi hari ini per outlet, sesi berjalan per terapis, sweep overrun
create index if not exists sessions_outlet_start_idx     on public.sessions (outlet_id, actual_start);
create index if not exists sessions_active_outlet_idx    on public.sessions (outlet_id) where status = 'ACTIVE';
create index if not exists sessions_active_therapist_idx on public.sessions (therapist_id) where status = 'ACTIVE';
create index if not exists sessions_active_end_idx       on public.sessions (expected_end) where status = 'ACTIVE';

-- Transaksi: struk hari ini, laporan, tren
create index if not exists transactions_outlet_paid_at_idx on public.transactions (outlet_id, paid_at);
create index if not exists transactions_paid_outlet_idx    on public.transactions (outlet_id, paid_at) where status = 'PAID';

-- Komisi & payroll per periode
create index if not exists commission_entries_outlet_date_idx    on public.commission_entries (outlet_id, date);
create index if not exists commission_entries_therapist_date_idx on public.commission_entries (therapist_id, date);
create index if not exists payroll_items_outlet_period_idx       on public.payroll_items (outlet_id, period);
create index if not exists payroll_items_employee_period_idx     on public.payroll_items (employee_id, period);

-- Absensi & stok per rentang
create index if not exists attendance_events_outlet_date_idx on public.attendance_events (outlet_id, date);
create index if not exists stock_movements_outlet_posted_idx on public.stock_movements (outlet_id, posted_at);

-- Statistik planner diperbarui supaya index baru langsung dipakai.
analyze public.bookings, public.sessions, public.transactions, public.commission_entries,
        public.payroll_items, public.attendance_events, public.stock_movements;

-- Hasil: daftar index yang dibuat migrasi ini.
select tablename, indexname
from pg_indexes
where schemaname = 'public' and indexname in (
  'bookings_outlet_date_idx','bookings_customer_date_idx','bookings_outlet_paid_idx','bookings_noshow_sweep_idx',
  'sessions_outlet_start_idx','sessions_active_outlet_idx','sessions_active_therapist_idx','sessions_active_end_idx',
  'transactions_outlet_paid_at_idx','transactions_paid_outlet_idx','commission_entries_outlet_date_idx',
  'commission_entries_therapist_date_idx','payroll_items_outlet_period_idx','payroll_items_employee_period_idx',
  'attendance_events_outlet_date_idx','stock_movements_outlet_posted_idx')
order by tablename, indexname;
