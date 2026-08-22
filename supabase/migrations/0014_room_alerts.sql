-- ---------------------------------------------------------------------
-- 0014_room_alerts.sql
--
-- New feature requested by user during Fase 16/17 UAT (2026-08-22):
-- a therapist-triggered "call for help" button on their active-session
-- page, that manager + kasir at the same outlet see IN REAL TIME (not on
-- next page load) — for when a guest is being disruptive and the
-- therapist needs someone to step in.
--
-- Design:
--   - room_alerts: one row per call-for-help, OPEN until a manager/kasir
--     resolves it. Scoped to booking_id so the room/guest/therapist
--     context travels with the alert without duplicating it.
--   - INSERT is therapist-only, for their OWN current booking (checked
--     both by RLS `with check` and again server-side in the action that
--     writes it, same belt-and-suspenders pattern as checkInBooking).
--   - SELECT/UPDATE (resolve) is manager+kasir at that outlet
--     (_is_outlet_staff, same helper 0002 already defines) or
--     admin/owner tenant-wide.
--   - Realtime: added to the supabase_realtime publication so
--     manager/kasir clients get pushed the INSERT instantly via
--     postgres_changes — Realtime honors the table's RLS, so this only
--     ever pushes rows a given viewer's SELECT policy would show them.
-- ---------------------------------------------------------------------

create table if not exists room_alerts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references outlets(id),
  room_id uuid not null references rooms(id),
  booking_id uuid not null references bookings(id),
  therapist_id uuid not null references employees(id),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references employees(id)
);

create index if not exists room_alerts_outlet_open_idx on room_alerts (outlet_id) where status = 'OPEN';

alter table room_alerts enable row level security;

drop policy if exists room_alerts_read on room_alerts;
create policy room_alerts_read on room_alerts
  for select to authenticated
  using (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
    or therapist_id = _current_employee_id()
  );

drop policy if exists room_alerts_insert_therapist on room_alerts;
create policy room_alerts_insert_therapist on room_alerts
  for insert to authenticated
  with check (
    therapist_id = _current_employee_id()
    and _current_role() = 'therapist'
  );

drop policy if exists room_alerts_resolve_staff on room_alerts;
create policy room_alerts_resolve_staff on room_alerts
  for update to authenticated
  using (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
    or therapist_id = _current_employee_id()
  )
  with check (
    _is_outlet_staff(outlet_id)
    or (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()))
    or therapist_id = _current_employee_id()
  );

alter publication supabase_realtime add table room_alerts;

-- Verification (run after applying):
--   select * from room_alerts; -- should exist, empty
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'room_alerts'; -- 1 row
