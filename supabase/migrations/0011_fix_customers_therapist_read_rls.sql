-- ---------------------------------------------------------------------
-- 0011_fix_customers_therapist_read_rls.sql
--
-- BUG 1 FOUND during Fase 16/17 end-to-end testing (2026-08-21/22):
-- Therapists cannot read `customers` at all. The only SELECT policy on
-- the table, `customers_read_self` ((auth_user_id = auth.uid())), is
-- for a customer reading their OWN row via the guest portal — it has
-- nothing to do with staff. The write policy `customers_staff_manage`
-- (ALL) DOES cover kasir/manager/admin/owner via role check, but the
-- role array does NOT include 'therapist'.
--
-- Confirmed directly in production via JWT impersonation as a real
-- therapist (Amelia):
--   set local request.jwt.claims = '{"sub":"<amelia auth_user_id>","role":"authenticated"}';
--   select _current_role(), (select count(*) from customers);
--   -> therapist | 0        (tenant actually has 15 customers)
--
-- Result: every therapist-facing screen that shows a guest's name
-- (today's jobs, active session, session history, commission detail)
-- renders "(tamu/customer tidak ditemukan)" for 100% of bookings,
-- because the nested customer read is silently empty under RLS.
--
-- Fix: mirror the same additive-narrow-policy pattern used in 0010 for
-- commission_entries. Grant SELECT only, scoped to customers who are
-- linked to the therapist through at least one of their own bookings.
-- This does NOT grant therapists write access to customers (stays
-- kasir/manager/admin/owner-only via customers_staff_manage), and does
-- NOT expose customers outside the therapist's own booking history.
-- ---------------------------------------------------------------------

drop policy if exists customers_read_own_booking on customers;
create policy customers_read_own_booking on customers
  for select to authenticated
  using (
    id in (
      select customer_id from bookings where therapist_id = _current_employee_id()
    )
  );

-- Verification (run after applying):
--   set local request.jwt.claims = '{"sub":"<amelia auth_user_id>","role":"authenticated"}';
--   select _current_role(), (select count(*) from customers);
--   -> therapist | <n>   where n = distinct customers across Amelia's own bookings (should be > 0)
