-- ---------------------------------------------------------------------
-- 0009_referral_promo_and_extension_sale.sql
--
-- Two features requested by the user (2026-08-21), both extending
-- infrastructure that already existed but had no real write path:
--
-- 1. Customer referral promo ("ajak teman ajak Rp30.000 untuk teman
--    baru"). `promotions` already existed as a catalog/display table
--    (0001) but had no structured discount amount and no redemption
--    write path — `value` was free text ("Rp30.000") meant for display
--    only. Adds a real numeric `discount_amount` plus
--    `new_customers_only` so payForSession() (lib/actions/
--    transactions.ts) can validate and apply a promo code
--    programmatically, not just show it on a poster.
--
--    `promotions_write` (0002) only lets managers/admins mutate
--    promotions — correct for creating/editing a promo, but a kasir must
--    still be able to bump `usage_count` by exactly 1 when a code is
--    redeemed at checkout. `promotions_redeem` grants outlet staff
--    (manager + kasir) UPDATE only, alongside the existing manage
--    policy — Postgres RLS policies are additive (OR'd), so this is a
--    narrow widening, not a replacement.
--
-- 2. Extension sale flow (ajukan -> approve kasir -> tagihan). No schema
--    change needed here — `extension_requests`/`sessions.extension_
--    minutes` already existed (0001) with a read layer built and
--    waiting (lib/data/sessions.ts). This migration is grouped with the
--    referral promo one because both shipped in the same round; the
--    actual extension write path lives entirely in application code
--    (lib/actions/sessions.ts: requestExtension/approveExtension/
--    rejectExtension).
-- ---------------------------------------------------------------------

alter table promotions
  add column if not exists discount_amount numeric(12,2),
  add column if not exists new_customers_only boolean not null default false;

alter table promotions
  drop constraint if exists promotions_discount_nonneg_ck;
alter table promotions
  add constraint promotions_discount_nonneg_ck
  check (discount_amount is null or discount_amount >= 0);

drop policy if exists promotions_redeem on promotions;
create policy promotions_redeem on promotions
  for update to authenticated
  using (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) and (_is_admin_or_owner() or _is_outlet_staff(outlet_id)))
  with check (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) and (_is_admin_or_owner() or _is_outlet_staff(outlet_id)));
