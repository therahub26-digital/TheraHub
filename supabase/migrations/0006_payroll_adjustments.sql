-- ---------------------------------------------------------------------
-- 0006_payroll_adjustments.sql
--
-- Baris pendapatan/potongan bebas per karyawan per periode.
--
-- Kenapa: payroll nyata Amethyst (contoh slip Zahra, 2026-08-21) berisi
-- baris seperti "rok navi 100.000", "seragam navi 80.000", "latihan
-- 250.000", "tabungan 200.000". Sebagian muncul sekali lalu lunas,
-- sebagian berulang, dan bulan depan bisa muncul jenis baru yang belum
-- terpikirkan sekarang — pembuatan seragam baru, pelatihan lagi, dsb.
--
-- Kolom tetap di `payroll_items` tidak bisa menampung itu: menambah
-- kolom tiap kali outlet punya jenis potongan baru berarti migrasi
-- database untuk keputusan operasional harian. Dan memaksa "seragam
-- navy" masuk ke kolom `other_deductions` akan menghapus labelnya —
-- karyawan melihat potongan tanpa tahu itu potongan apa.
--
-- Jadi baris penyesuaian disimpan sebagai baris, dengan labelnya
-- sendiri, dan manager outlet yang menginput. Kolom `component`
-- opsional: mengaitkan baris ke komponen resmi (mis. Tabungan) untuk
-- pelaporan, tapi baris ad-hoc tanpa komponen tetap sah.
-- ---------------------------------------------------------------------

-- Pajak: disebut user sebagai kebutuhan spa lain ("apakah ada pajak
-- dll"). Amethyst belum memakainya, tapi enum-nya disiapkan supaya
-- tenant yang memotong PPh 21 tidak perlu migrasi lagi.
alter type payroll_component add value if not exists 'TAX';

create table payroll_adjustments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  outlet_id     uuid not null references outlets(id) on delete cascade,
  period        text not null,                      -- 'YYYY-MM'
  -- Label apa adanya, seperti yang ditulis manager dan seperti yang
  -- akan dibaca karyawan di slipnya. Ini yang membedakan potongan yang
  -- bisa dipertanggungjawabkan dari angka yang tiba-tiba muncul.
  label         text not null check (length(trim(label)) > 0),
  kind          text not null check (kind in ('EARNING','DEDUCTION')),
  amount        numeric(12,2) not null check (amount >= 0),
  -- Opsional: mengelompokkan baris ke komponen resmi outlet.
  component     payroll_component,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_users(id) on delete set null
);

create index payroll_adjustments_lookup_idx
  on payroll_adjustments (outlet_id, period, employee_id);

alter table payroll_adjustments enable row level security;

-- Karyawan boleh melihat baris miliknya sendiri — potongan pada gaji
-- seseorang harus bisa dilihat orang itu, bukan hanya oleh yang
-- memotong.
create policy payroll_adjustments_self_read on payroll_adjustments
  for select to authenticated using (employee_id = _current_employee_id());

-- Yang boleh menulis sama persis dengan yang boleh mengubah payroll
-- (0002 payroll_items_manage): admin/owner se-tenant, atau manager di
-- outlet itu. Kasir dan terapis tidak bisa menambah potongan pada siapa
-- pun, termasuk pada dirinya sendiri.
create policy payroll_adjustments_manage on payroll_adjustments
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));
