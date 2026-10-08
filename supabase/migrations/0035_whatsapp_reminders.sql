-- =====================================================================
-- 0035 — Reminder WhatsApp 15 menit (Fonnte)  ·  BELUM DITERAPKAN
-- Spesifikasi: project doc "therahub-spec-reminder-wa" (6 Okt 2026).
--
-- Dua tabel baru:
--   tenant_integrations — token Fonnte + dua saklar, satu baris per tenant.
--     TOKEN ADALAH RAHASIA: klien (authenticated) hanya diberi hak baca
--     atas kolom non-rahasia. device_token hanya bisa ditulis/dibaca lewat
--     service role (server action yang sudah memvalidasi admin, dan
--     endpoint cron). Pola sama dengan lib/data/platform.ts.
--   message_log — satu baris per (booking, jenis pesan). UNIQUE
--     (booking_id, kind) adalah jaminan "tidak pernah kirim dobel",
--     pola yang sama dengan `ref` unik di payroll.
--
-- Dua saklar default FALSE: reminder_therapist khususnya tidak boleh
-- menyala sebelum kontak terapis diganti nomor asli (saat ini fabrikasi).
-- =====================================================================

create table if not exists public.tenant_integrations (
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  provider           text not null check (provider in ('fonnte')),
  device_token       text,
  device_token_last4 text,
  reminder_customer  boolean not null default false,
  reminder_therapist boolean not null default false,
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, provider)
);

alter table public.tenant_integrations enable row level security;

drop policy if exists tenant_integrations_admin_read on public.tenant_integrations;
create policy tenant_integrations_admin_read on public.tenant_integrations
  for select to authenticated
  using (tenant_id = _effective_tenant_id() and _is_admin_or_owner());

drop policy if exists tenant_integrations_admin_update on public.tenant_integrations;
create policy tenant_integrations_admin_update on public.tenant_integrations
  for update to authenticated
  using (tenant_id = _effective_tenant_id() and _is_admin_or_owner())
  with check (tenant_id = _effective_tenant_id() and _is_admin_or_owner());

-- Hak kolom: tanpa ini, policy di atas tetap membiarkan device_token terbaca.
revoke all on public.tenant_integrations from authenticated, anon;
grant select (tenant_id, provider, device_token_last4, reminder_customer, reminder_therapist, updated_at)
  on public.tenant_integrations to authenticated;
grant update (reminder_customer, reminder_therapist, updated_at)
  on public.tenant_integrations to authenticated;

create table if not exists public.message_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  outlet_id         uuid not null references public.outlets(id) on delete cascade,
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  kind              text not null check (kind in ('REMINDER_CUSTOMER', 'REMINDER_THERAPIST')),
  recipient_phone   text,
  status            text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts          int  not null default 0,
  provider_response jsonb,
  error             text,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  unique (booking_id, kind)
);

create index if not exists message_log_tenant_created_idx on public.message_log(tenant_id, created_at desc);
create index if not exists message_log_status_idx on public.message_log(status, created_at);

alter table public.message_log enable row level security;

-- Baca saja: staf outlet itu, atau admin/owner tenant. Tidak ada policy
-- INSERT/UPDATE/DELETE — hanya service role (endpoint cron) yang menulis.
drop policy if exists message_log_staff_read on public.message_log;
create policy message_log_staff_read on public.message_log
  for select to authenticated
  using (
    (_is_admin_or_owner() and tenant_id = _effective_tenant_id())
    or _is_outlet_staff(outlet_id)
  );

revoke insert, update, delete on public.message_log from authenticated, anon;

-- Rollback kalau perlu:
--   drop table if exists public.message_log;
--   drop table if exists public.tenant_integrations;
--
-- ---------------------------------------------------------------------
-- PEMICU (jalankan SETELAH CRON_SECRET diisi di Vercel & Vault Supabase;
-- ganti <DOMAIN> dan <CRON_SECRET>). Perlu ekstensi pg_cron dan pg_net.
--
--   select cron.schedule(
--     'therahub-reminders', '* * * * *',
--     $$ select net.http_post(
--          url     := 'https://<DOMAIN>/api/cron/reminders',
--          headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--        ) $$
--   );
--
-- Matikan:  select cron.unschedule('therahub-reminders');
-- ---------------------------------------------------------------------
