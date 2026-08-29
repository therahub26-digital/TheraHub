-- ---------------------------------------------------------------------
-- 0032_extension_approval_rls.sql
-- (ditulis sebagai 0010 saat audit 2026-08-21; dinomori ulang karena seri
--  0010-0031 sudah terpakai oleh pekerjaan paralel di mesin lokal)
--
-- Audit finding (2026-08-21): a therapist could approve their OWN
-- extension request.
--
-- approveExtension() (lib/actions/sessions.ts) deliberately does no
-- role check in application code — per this project's convention, RLS
-- is the real gate. But 0002's `extension_requests_therapist` policy
-- was written FOR ALL, which includes UPDATE: a signed-in therapist
-- could flip their own request to APPROVED, and payForSession() would
-- then bill the guest Rp50.000 and credit the therapist Rp15.000
-- commission with no kasir/manager ever consenting. That is a money
-- path with a self-service back door.
--
-- Fix: the therapist keeps exactly what the feature needs —
--   SELECT  their own requests (to see status on /therapist/session)
--   INSERT  new requests for their own sessions (tombol "Ajukan")
-- and loses UPDATE/DELETE. Approve/reject stays exclusively with
-- outlet staff via `extension_requests_staff` (untouched, still FOR
-- ALL for manager/kasir/admin/owner).
--
-- Postgres RLS policies are additive (OR'd), so staff members who are
-- somehow also the session's therapist are unaffected — the staff
-- policy still grants them UPDATE.
-- ---------------------------------------------------------------------

drop policy if exists extension_requests_therapist on extension_requests;

drop policy if exists extension_requests_therapist_read on extension_requests;
create policy extension_requests_therapist_read on extension_requests
  for select to authenticated
  using (session_id in (select id from sessions where therapist_id = _current_employee_id()));

drop policy if exists extension_requests_therapist_insert on extension_requests;
create policy extension_requests_therapist_insert on extension_requests
  for insert to authenticated
  with check (
    session_id in (select id from sessions where therapist_id = _current_employee_id())
    -- A therapist can only CREATE a request in its initial state —
    -- never pre-approved. Without this, INSERT with status='APPROVED'
    -- would be the same back door through a different verb.
    and status = 'PENDING'
  );
