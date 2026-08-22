-- ---------------------------------------------------------------------
-- 0012_fix_bookings_therapist_complete_rls.sql
--
-- BUG 2 (root cause, precise) FOUND during Fase 16/17 end-to-end testing
-- (2026-08-21/22):
--
-- completeSession() (lib/actions/sessions.ts) does two writes when a
-- therapist finishes a session:
--   1. UPDATE sessions SET status = 'COMPLETED' ...          -- succeeds
--   2. UPDATE bookings SET status = 'COMPLETED' WHERE id = ... -- FAILS
--
-- The second write fails silently under RLS: the only UPDATE-capable
-- policy on `bookings` is `bookings_staff`, which uses
-- `_is_outlet_staff(outlet_id)` (manager + kasir) — it does NOT cover
-- the therapist role. completeSession() is always called BY the
-- therapist, so this write always fails for the actual production
-- code path.
--
-- The application code already handles this correctly —
-- completeSession() returns { ok: false, error } and the UI renders
-- <ErrorNote> — but the error is invisible in practice: the FIRST write
-- (sessions.status) succeeding triggers Next.js's automatic re-render,
-- which unmounts the button/error component before the user can see
-- the message. Previously (prior testing session) this was misdiagnosed
-- as a `revalidatePath` caching bug ("Job Berikutnya" showing a stale
-- booking) — it is actually this RLS gap.
--
-- Confirmed directly in production data: booking
-- 724176b5-d769-472f-81c8-2b5c692986de had sessions.status = COMPLETED
-- while bookings.status stayed stuck at CHECKED_IN, until payForSession()
-- (run later, as kasir) overwrote bookings.status to PAID directly —
-- which is why this bug does not block the business flow end-to-end,
-- only the therapist-facing "next job" display in the window between
-- session completion and payment.
--
-- Fix: mirror the same additive-narrow-policy pattern used in 0010/0011.
-- Grant UPDATE only for a therapist's own bookings (therapist_id must
-- match their own employee id both before and after the write). This
-- does NOT grant therapists the ability to touch any other booking, and
-- does NOT change kasir/manager's existing bookings_staff permissions.
-- ---------------------------------------------------------------------

drop policy if exists bookings_therapist_complete on bookings;
create policy bookings_therapist_complete on bookings
  for update to authenticated
  using (therapist_id = _current_employee_id())
  with check (therapist_id = _current_employee_id());

-- NOTE for review before applying: this policy is intentionally NOT
-- restricted to a specific `status` transition (e.g. only allowing
-- CHECKED_IN -> COMPLETED) — it follows the same permissiveness level
-- as the existing bookings_staff policy for outlet staff. If tighter
-- scoping is wanted (therapist can only move their own booking to
-- COMPLETED, not arbitrarily edit other columns), consider adding a
-- WITH CHECK that also pins `status = 'COMPLETED'`, at the cost of this
-- policy needing to be revisited if completeSession() ever needs to
-- write other booking columns as the therapist. Left open pending user
-- decision — not yet applied to production.

-- Verification (run after applying):
--   set local request.jwt.claims = '{"sub":"<amelia auth_user_id>","role":"authenticated"}';
--   update bookings set status = 'COMPLETED' where id = '<a booking with therapist_id = amelia>';
--   -- should succeed (previously: "new row violates row-level security policy for table bookings")
