-- ---------------------------------------------------------------------
-- 0004_commission_setup.sql
--
-- Makes the commission rule expressible as EITHER a rupiah amount or a
-- percentage on every sellable item, not just on service packages.
--
-- Why: the commission structure is meant to be set by the outlet admin
-- during catalog setup — "setiap harga layanan diinput dan komisi juga
-- sudah ditentukan, termasuk extend waktu. nilainya bisa rupiah atau
-- persenan" (user, 2026-08-21). `service_packages` already had the pair
-- (`commission_type` + `commission_value`), but `extension_options` and
-- `add_ons` each had only a bare `commission numeric`, which can only
-- ever mean rupiah. Without this column an admin who wants "extension
-- 30 menit = 25% untuk terapis" has nowhere to put the 25 — and storing
-- 25 in a rupiah-only column would silently mean Rp25.
--
-- Default is 'fixed' so the existing rows keep their current meaning:
-- the seeded placeholder commission of 0 stays a rupiah 0, which is what
-- it already was. No existing value changes meaning.
--
-- The `commission_kind` enum ('fixed','percent') already exists from
-- 0001_init.sql — reused here rather than defining a parallel type.
-- ---------------------------------------------------------------------

alter table extension_options
  add column if not exists commission_type commission_kind not null default 'fixed';

alter table add_ons
  add column if not exists commission_type commission_kind not null default 'fixed';

-- Guard rails: a percentage outside 0..100 is always a data-entry error
-- (someone typing 4500 meaning "Rp45.000" into a percent field). Caught
-- at the database so a bug in the admin form can't quietly write a rule
-- that pays a therapist 45x the ticket price.
alter table service_packages
  drop constraint if exists service_packages_commission_pct_ck;
alter table service_packages
  add constraint service_packages_commission_pct_ck
  check (commission_type <> 'percent' or (commission_value >= 0 and commission_value <= 100));

alter table extension_options
  drop constraint if exists extension_options_commission_pct_ck;
alter table extension_options
  add constraint extension_options_commission_pct_ck
  check (commission_type <> 'percent' or (commission >= 0 and commission <= 100));

alter table add_ons
  drop constraint if exists add_ons_commission_pct_ck;
alter table add_ons
  add constraint add_ons_commission_pct_ck
  check (commission_type <> 'percent' or (commission >= 0 and commission <= 100));

-- A negative commission is never a real rule, whichever unit it is in.
alter table service_packages
  drop constraint if exists service_packages_commission_nonneg_ck;
alter table service_packages
  add constraint service_packages_commission_nonneg_ck check (commission_value >= 0);

alter table extension_options
  drop constraint if exists extension_options_commission_nonneg_ck;
alter table extension_options
  add constraint extension_options_commission_nonneg_ck check (commission >= 0);

alter table add_ons
  drop constraint if exists add_ons_commission_nonneg_ck;
alter table add_ons
  add constraint add_ons_commission_nonneg_ck check (commission >= 0);
