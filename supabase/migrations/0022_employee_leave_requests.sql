-- ---------------------------------------------------------------------
-- 0022_employee_leave_requests.sql
--
-- DRAFT — BELUM DIJALANKAN KE PRODUKSI. Menunggu persetujuan eksplisit.
--
-- Latar belakang
-- --------------
-- User (2026-08-23): "di role terapis ajukan cuti dan disetujui manager".
-- Ditanya siapa yang boleh menyetujui, user menjawab "manager & kasir
-- bisa menyetujui" — sama persis dengan siapa yang boleh menandai
-- OFF/LIBUR harian di employee_schedule_exceptions
-- (0017_therapist_gallery_booking_window_schedule.sql).
--
-- Kenapa tabel baru, bukan menambah baris langsung ke
-- employee_schedule_exceptions: tabel itu TIDAK punya konsep "menunggu
-- persetujuan" — setiap baris di sana LANGSUNG berarti "hari ini/tanggal
-- ini terapis benar OFF/LEAVE", dipakai app buat mengecek konflik
-- booking. Pengajuan cuti terapis butuh status perantara (PENDING) yang
-- BELUM mempengaruhi jadwal sampai ada manusia (manager/kasir) yang
-- menyetujuinya. Begitu disetujui, action approveLeaveRequest() yang
-- menulis baris ke employee_schedule_exceptions — bukan trigger SQL —
-- supaya logikanya satu tempat, mudah diaudit, dan konsisten dengan cara
-- action lain di app ini bekerja (tidak ada trigger DB di skema manapun
-- sejauh ini).
--
-- Desain RLS (baca komentar per policy di bawah): terapis SENGAJA hanya
-- diberi INSERT + SELECT atas baris miliknya sendiri, TIDAK PERNAH
-- UPDATE — supaya tidak ada jalur bagi terapis untuk mengubah status
-- pengajuannya sendiri jadi APPROVED. Keputusan (approve/reject) murni
-- lewat policy staff.
-- ---------------------------------------------------------------------

create table if not exists employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  date date not null,
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz not null default now(),
  decided_by uuid references employees(id),
  decided_at timestamptz,
  decision_note text
);

alter table employee_leave_requests enable row level security;

-- Terapis: lihat pengajuan miliknya sendiri saja.
drop policy if exists employee_leave_requests_therapist_read on employee_leave_requests;
create policy employee_leave_requests_therapist_read on employee_leave_requests
  for select to authenticated
  using (employee_id = _current_employee_id());

-- Terapis: BOLEH membuat pengajuan baru untuk dirinya sendiri, status
-- WAJIB PENDING saat dibuat (tidak bisa langsung insert baris APPROVED).
-- Tidak ada policy UPDATE/DELETE untuk terapis — begitu terkirim,
-- pengajuan hanya bisa diubah oleh manager/kasir (approve/reject) lewat
-- policy staff di bawah.
drop policy if exists employee_leave_requests_therapist_insert on employee_leave_requests;
create policy employee_leave_requests_therapist_insert on employee_leave_requests
  for insert to authenticated
  with check (employee_id = _current_employee_id() and status = 'PENDING');

-- Manager & kasir (outlet yang sama) atau admin/owner (tenant): boleh
-- melihat dan memutuskan (approve/reject) semua pengajuan di outlet itu.
-- Sama persis shape-nya dengan schedule_exceptions_write.
drop policy if exists employee_leave_requests_staff on employee_leave_requests;
create policy employee_leave_requests_staff on employee_leave_requests
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

create index if not exists employee_leave_requests_outlet_status_idx on employee_leave_requests(outlet_id, status);
create index if not exists employee_leave_requests_employee_idx on employee_leave_requests(employee_id);

-- Rollback kalau perlu:
--   drop table if exists employee_leave_requests;
