-- 0046 — Akun marketing demo per orang + log aktivitas (2026-10-24)
--
-- Sebelumnya gerbang demo (demo.therahub.biz.id/demo) memakai SATU email &
-- password marketing bersama dari env, tanpa catatan siapa yang masuk.
-- Sekarang setiap marketing punya akun sendiri (dibuat Super Admin di
-- portal produksi → Akses Demo), dan setiap login / gagal login / ganti
-- peran / reset / keluar dicatat.
--
-- Kedua tabel HANYA diakses lewat service role (route API demo & aksi
-- Super Admin yang sudah memverifikasi peran). RLS dinyalakan TANPA policy,
-- sehingga anon & authenticated tidak bisa membaca hash password atau log.
-- Aman dijalankan ulang.

create table if not exists public.demo_marketers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  active boolean not null default true,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  last_login_at timestamptz
);
create unique index if not exists demo_marketers_email_key on public.demo_marketers (lower(email));

create table if not exists public.demo_access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  marketer_id uuid references public.demo_marketers(id) on delete set null,
  email text,
  event text not null check (event in ('LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED', 'SWITCH', 'RESET', 'LOGOUT', 'DENIED')),
  role text,
  ip text,
  city text,
  country text,
  user_agent text,
  detail text
);
create index if not exists demo_access_log_at_idx on public.demo_access_log (at desc);
create index if not exists demo_access_log_marketer_idx on public.demo_access_log (marketer_id, at desc);
create index if not exists demo_access_log_email_at_idx on public.demo_access_log (lower(email), at desc);

alter table public.demo_marketers enable row level security;
alter table public.demo_access_log enable row level security;
revoke all on public.demo_marketers from anon, authenticated;
revoke all on public.demo_access_log from anon, authenticated;

select 'demo_marketers' as tabel, count(*) from public.demo_marketers
union all
select 'demo_access_log', count(*) from public.demo_access_log;
