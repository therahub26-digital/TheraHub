-- ---------------------------------------------------------------------
-- 0017_therapist_gallery_booking_window_schedule.sql
--
-- Three features requested by the user directly while reviewing the
-- live /customer/book screenshot (2026-08-22):
--
--  1. "kalau di klik di kotak therapis maka akan muncul profil dan album
--     foto therapis, isi maksimal 3 foto" — a therapist photo album
--     (max 3), separate from the single existing `photo_url` (which
--     stays the avatar/headshot used everywhere else — this is an
--     ADDITIONAL small gallery for the profile popup only).
--
--  2. "setiap hari tugas manager atau kasir untuk cek list therapis yang
--     off atau libur. untuk yang sudah booking otomatis ditawarkan
--     ganti therapis atau dibatalkan" — a day-level roster status
--     (OFF/LEAVE) per therapist, that a manager/kasir can set, and that
--     the app can cross-reference against today's bookings to flag ones
--     needing reassignment or cancellation.
--
--  3. "booking bisa diatur admin H minus berapa, maksimal 3 hari
--     kedepan, defaultnya hanya bisa dipesan hari H" — a per-outlet
--     configurable booking horizon, 0 (same-day only, the default) to 3
--     days ahead.
--
-- NOTE on why this doesn't touch the pre-existing employee_day_off /
-- employee_leave tables (RLS for both already exists in
-- 0002_rls_policies.sql): those tables have never been read or written
-- by any app code (grepped the whole repo — zero hits outside the RLS
-- file itself), and the migration that originally created them
-- (0001_init.sql) isn't in this repo's migrations folder — it was
-- applied directly via the Supabase dashboard before this repo's
-- migration history started (see the CATATAN TEKNIS section of the
-- project progress doc). Repeated attempts this session to read their
-- actual column list straight from the live database via the SQL
-- Editor were blocked by the same browser-automation flakiness recorded
-- earlier in this session (typing not registering in the Monaco editor,
-- several retries, fresh tabs). Rather than guess at an unverified
-- production table's shape, feature #2 gets its own small table below
-- (employee_schedule_exceptions) whose shape this migration fully
-- controls end to end. The old tables are left exactly as they were —
-- unused, but not touched or dropped, in case they matter for something
-- not yet built.
-- ---------------------------------------------------------------------

-- ----------------------------------------------------------- #1 gallery
alter table employees add column if not exists gallery_urls text[] not null default '{}';
-- Cap of 3 enforced app-side (components/EmployeePhotoGallery.tsx), not
-- as a DB check constraint — an admin/manager hand-editing the array via
-- some future tool shouldn't be blocked by a constraint that exists only
-- to keep ONE upload widget's UI simple.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('therapist-photos', 'therapist-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Same authorization shape as the alarm-sounds bucket (0015): public
-- read (a therapist's own promo photo isn't sensitive, and needs to
-- render straight from an <img src> without a signed URL); write
-- restricted to the therapist's OWN outlet's manager, or admin/owner.
-- Path convention `<employee_id>/<filename>` — checked against employees
-- the caller may manage, mirroring alarm-sounds' `<outlet_id>/...`
-- pattern one level deeper (per-employee instead of per-outlet).
drop policy if exists therapist_photos_read on storage.objects;
create policy therapist_photos_read on storage.objects
  for select to public
  using (bucket_id = 'therapist-photos');

drop policy if exists therapist_photos_insert on storage.objects;
create policy therapist_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'therapist-photos'
    and (storage.foldername(name))[1] in (
      select id::text from employees where _is_manager_here(outlet_id) or _is_admin_or_owner()
    )
  );

drop policy if exists therapist_photos_delete on storage.objects;
create policy therapist_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'therapist-photos'
    and (storage.foldername(name))[1] in (
      select id::text from employees where _is_manager_here(outlet_id) or _is_admin_or_owner()
    )
  );

-- ------------------------------------------------------- #2 day roster
create table if not exists employee_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  date date not null,
  type text not null check (type in ('OFF', 'LEAVE')),
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

alter table employee_schedule_exceptions enable row level security;

-- Read: any staff at the tenant (mirrors employees_read's tenant-wide
-- read — a manager checking their own outlet's roster still benefits
-- from seeing the shape of the table even for rows outside their outlet,
-- same convention as employees_read itself), or the therapist reading
-- their own exception rows.
drop policy if exists schedule_exceptions_read on employee_schedule_exceptions;
create policy schedule_exceptions_read on employee_schedule_exceptions
  for select to authenticated
  using (
    employee_id in (select id from employees where tenant_id = _current_tenant_id())
    or employee_id = _current_employee_id()
  );

-- Write: manager (own outlet) or admin/owner — same shape as
-- outlets_update_manager / employees_write. Kasir is deliberately
-- INCLUDED here too (unlike employees_write) — the user's request was
-- explicitly "tugas manager ATAU kasir" for this daily check, and
-- marking a therapist off/on-leave for a day is an operational front-
-- desk task, not a personnel-record edit.
drop policy if exists schedule_exceptions_write on employee_schedule_exceptions;
create policy schedule_exceptions_write on employee_schedule_exceptions
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

create index if not exists employee_schedule_exceptions_date_idx on employee_schedule_exceptions(outlet_id, date);

-- ----------------------------------------------------- #3 booking window
alter table outlets add column if not exists booking_window_days integer not null default 0;
alter table outlets drop constraint if exists outlets_booking_window_days_check;
alter table outlets add constraint outlets_booking_window_days_check check (booking_window_days between 0 and 3);
-- 0 = same-day only (the default — matches current behavior exactly,
-- no outlet's booking window silently changes when this migration runs).
-- Covered by the existing outlets_update_manager / outlets_write_admin
-- RLS policies, same as alarm_sound_url — no new policy needed for this
-- column.

-- Verification (run after applying):
--   select gallery_urls from employees limit 1; -- column exists, '{}'
--   select id, public, file_size_limit from storage.buckets where id = 'therapist-photos'; -- 1 row
--   select policyname from pg_policies where tablename = 'objects' and policyname like 'therapist_photos_%'; -- 3 rows
--   select policyname from pg_policies where tablename = 'employee_schedule_exceptions'; -- 2 rows
--   select booking_window_days from outlets limit 1; -- column exists, 0
