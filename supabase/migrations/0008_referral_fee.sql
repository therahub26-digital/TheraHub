-- ---------------------------------------------------------------------
-- 0008_referral_fee.sql
--
-- Real case (user, 2026-08-21): Zahra's real payslip carries a Rp5.000
-- deduction per treatment, paid out to Lusi — the therapist who recruited
-- her. "Apakah bisa diotomatiskan?" User asked whether this should be
-- automated, done per-transaction, or left fully manual.
--
-- Decision: computed once per payroll run (runPayroll(), lib/actions/
-- payroll.ts), NOT per-transaction. Reasons:
--   - Per-transaction (inside payForSession()) would add a second money
--     computation to the highest-stakes write path in the app — a guest
--     has just paid, and that action already has enough failure modes
--     documented in its own file header without adding a referral split
--     to it.
--   - Fully manual (typed by the manager every month) means counting how
--     many treatments the referred therapist did that period by hand —
--     exactly the kind of arithmetic a computer should do, and the kind
--     a human silently gets wrong.
--   - Payroll-run-time is the same shape as the existing savings-deposit
--     auto-write in runPayroll(): compute from real entries, write an
--     idempotent row, done. No new risk surface, reuses the pattern.
--
-- Two additions:
--   1. `employees.referred_by_employee_id` + a fee rule (type/value, same
--      fixed/percent shape as commission everywhere else in this app) —
--      "belum diatur ≠ nol": NULL means no referral relationship exists,
--      not a referral fee of zero.
--   2. `payroll_adjustments.ref`, mirroring `savings_entries.ref` (0007)
--      exactly — the idempotency key so re-running a period's payroll
--      updates the auto-generated referral lines in place instead of
--      duplicating them.
-- ---------------------------------------------------------------------

alter table employees
  add column if not exists referred_by_employee_id uuid references employees(id) on delete set null,
  add column if not exists referral_fee_type commission_kind,
  add column if not exists referral_fee_value numeric(12,2);

-- Same guard rails as 0004's commission columns: a percent above 100 or a
-- negative value is always a data-entry mistake, not a real rule.
alter table employees
  drop constraint if exists employees_referral_fee_pct_ck;
alter table employees
  add constraint employees_referral_fee_pct_ck
  check (referral_fee_type is distinct from 'percent' or (referral_fee_value >= 0 and referral_fee_value <= 100));

alter table employees
  drop constraint if exists employees_referral_fee_nonneg_ck;
alter table employees
  add constraint employees_referral_fee_nonneg_ck
  check (referral_fee_value is null or referral_fee_value >= 0);

-- An employee cannot have recruited themselves.
alter table employees
  drop constraint if exists employees_referral_not_self_ck;
alter table employees
  add constraint employees_referral_not_self_ck
  check (referred_by_employee_id is null or referred_by_employee_id <> id);

alter table payroll_adjustments
  add column if not exists ref text;

create unique index if not exists payroll_adjustments_ref_idx
  on payroll_adjustments (employee_id, ref) where ref is not null;
