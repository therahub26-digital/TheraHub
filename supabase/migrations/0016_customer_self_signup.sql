-- 0016_customer_self_signup.sql
--
-- User request 2026-08-22: "konsumen harus aktivasi pendaftaran lewat
-- email" -- there was no self-registration path for customers at all
-- before this. Every existing `customers` row was created by staff
-- (kasir/manager) or by the dev-seed script using the service-role key,
-- which bypasses RLS entirely. A visitor filling out /register runs
-- purely under the anon/authenticated roles, so two gaps had to close:
--
-- 1. Choosing "which outlet do you usually visit" during registration
--    needs a way to list outlets BEFORE the visitor has any session --
--    `outlets_read` (0002) requires `to authenticated`. Exposes only
--    outlets with a published outlet_profiles row (the same "published"
--    gate the public outlet profile page already uses), and only to the
--    anon role -- once logged in, the visitor's own outlets_read/
--    outlets_read_public together are still scoped no wider than before.
--
-- 2. After Supabase Auth's own email-confirmation link is clicked (this
--    migration does not touch that -- it's an Auth project setting, "Confirm
--    email", already on by default for new Supabase projects) and the
--    visitor logs in for the first time, the app self-provisions their
--    `customers` row client-side (see app/login/page.tsx). That insert
--    runs as the now-authenticated user, so it needs an INSERT policy of
--    its own -- there wasn't one; customers_staff_manage only covers
--    staff roles, and customers_read_self/update_self are SELECT/UPDATE
--    only.
create policy outlets_read_public on outlets
  for select to anon
  using (id in (select outlet_id from outlet_profiles where published = true));

-- Scoped tightly: a visitor can only insert a row that (a) is attributed
-- to themselves (auth_user_id = auth.uid(), so nobody can register on
-- someone else's behalf) and (b) claims a tenant_id that actually has at
-- least one outlet (so a crafted insert can't attach itself to an
-- arbitrary/nonexistent tenant_id). It does NOT restrict which tenant --
-- this app can host more than one tenant, and the register form already
-- resolves tenant_id from a real outlet the visitor picked.
create policy customers_insert_self on customers
  for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and tenant_id in (select tenant_id from outlets)
  );
