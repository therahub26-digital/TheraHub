-- ---------------------------------------------------------------------
-- 0005_payroll_settings.sql
--
-- Declares WHICH payroll components a given outlet actually uses.
--
-- Why this exists: `payroll_items` (0001) already carries ten components
-- — fixed, allowance, variable, bonus, thr, late_penalty,
-- absence_penalty, savings, loan, other_deductions. What the schema
-- never said is which of them are in play at a particular business.
--
-- Amethyst pays its therapists **commission only** (user, 2026-08-21):
-- the roster is freelance/"lepas", so base salary and allowance are
-- genuinely zero. But the same user immediately noted that "spa yg lain
-- belum tentu seperti itu" — other spas will not necessarily work that
-- way. Hardcoding commission-only would turn a product into one
-- customer's app, and would have to be unpicked at the first tenant
-- that pays a base wage.
--
-- So the component set is DATA, per outlet, exactly like the commission
-- rule (0004) is data per package rather than a constant in code.
--
-- The presence of a row is itself the signal that an admin has decided.
-- No row = payroll not configured yet, and the payroll run refuses to
-- produce payslips rather than emitting a page of zeros — the same
-- "unset is not zero" rule the commission module follows, and for the
-- same reason: a payslip stating Rp0 is a claim about someone's wages.
-- ---------------------------------------------------------------------

create type payroll_component as enum (
  'FIXED',            -- monthly base wage, from employees.base_salary
  'ALLOWANCE',        -- fixed allowance, from employees.fixed_allowance
  'COMMISSION',       -- per-treatment commission, from commission_entries
  'BONUS',
  'THR',              -- Indonesian statutory religious-holiday allowance
  'LATE_PENALTY',
  'ABSENCE_PENALTY',
  'SAVINGS',          -- employer-held savings deduction
  'LOAN',
  'OTHER_DEDUCTIONS'
);

create table payroll_settings (
  outlet_id     uuid primary key references outlets(id) on delete cascade,
  -- Which components this outlet's payslips are made of. Order is not
  -- significant; the UI renders them in a fixed canonical order.
  components    payroll_component[] not null,
  -- 'YYYY-MM' periods for now. Split into its own column rather than
  -- assumed, because a weekly/biweekly payroll is a realistic ask from a
  -- future tenant and hardcoding "month" into the period string format
  -- would be another thing to unpick later.
  period_type   text not null default 'MONTHLY' check (period_type in ('MONTHLY')),
  note          text,
  updated_at    timestamptz not null default now(),
  -- An empty component list is never a real payroll policy — it would
  -- generate payslips of nothing at all.
  constraint payroll_settings_components_nonempty check (array_length(components, 1) >= 1)
);

alter table payroll_settings enable row level security;

-- Same shape as the other outlet-scoped config policies in 0002: staff
-- of the tenant may read, and only admin/owner/manager may change it.
-- Payroll structure decides what people are paid; a kasir or therapist
-- must not be able to add themselves a component.
create policy payroll_settings_read on payroll_settings
  for select to authenticated using (
    outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
  );

-- Mirrors payroll_items_manage in 0002 exactly, using the same helpers,
-- so payroll structure and payroll figures are governed identically.
create policy payroll_settings_manage on payroll_settings
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

-- Seed Amethyst's two outlets as commission-only, which is their real
-- policy today. Done as an INSERT over the existing rows rather than a
-- table default so that a NEW outlet still starts unconfigured and has
-- to be decided deliberately — inheriting Amethyst's policy silently is
-- exactly the product-vs-one-customer mistake this table prevents.
insert into payroll_settings (outlet_id, components, note)
select id, '{COMMISSION}'::payroll_component[],
       'Terapis Amethyst berstatus lepas — penghasilan murni dari komisi per treatment (dikonfirmasi 2026-08-21).'
from outlets
on conflict (outlet_id) do nothing;
