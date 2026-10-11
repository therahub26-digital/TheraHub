-- ============================================================
-- scripts/rls-crosstenant-test.sql
-- STATUS: DRAFT — belum pernah dijalankan
--
-- UJI ISOLASI RLS LINTAS-TENANT (handover §14.3 no.1 — prasyarat
-- mutlak sebelum tenant/klien kedua).
--
-- Cara kerja: SELURUH skrip berjalan dalam SATU transaksi yang
-- diakhiri ROLLBACK. Di dalamnya:
--   1. (sebagai postgres) buat fixture minimal "Tenant B": tenant +
--      outlet + customer + booking korban.
--   2. Berpindah identitas jadi user login Tenant A
--      (set role authenticated + request.jwt.claims.sub).
--   3. Probe otomatis SEMUA tabel public yang punya kolom tenant_id,
--      dan SEMUA tabel yang punya outlet_id (scope lewat outlet):
--      - SELECT baris Tenant B  → harus 0 baris
--      - UPDATE baris Tenant B  → harus 0 baris terdampak / ditolak
--   4. Probe INSERT lintas-tenant (booking ke outlet B) → harus gagal.
--   5. Tampilkan tabel hasil, lalu ROLLBACK — fixture lenyap,
--      percobaan tulis lenyap, database kembali persis seperti semula.
--
-- Karena rollback total, skrip ini aman dijalankan di produksi —
-- tapi tetap jalankan di luar jam sibuk, dan di staging dulu bila ada.
--
-- SEBELUM MENJALANKAN — isi dua nilai:
--   (a) :SUB — auth_user_id user Tenant A yang dipakai menyamar.
--       Uji minimal dengan DUA identitas terpisah (jalankan skrip 2×):
--       admin (hak terluas dalam tenant) dan kasir.
--       Cari nilainya:  select email, role, auth_user_id from app_users;
--   Ganti teks  <<GANTI_AUTH_USER_ID>>  di bawah dengan UUID tersebut.
--
-- KRITERIA LULUS: semua baris hasil = 'LOLOS'. Satu saja 'BOCOR'
-- berarti policy tabel itu harus diperbaiki sebelum tenant kedua.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Tabel hasil + konfigurasi (dibuat sebagai postgres,
--    di-grant supaya tetap bisa ditulis setelah ganti role)
-- ------------------------------------------------------------
create temp table _rls_results (
  tabel     text,
  scope     text,          -- 'tenant_id' | 'outlet_id' | 'insert'
  uji       text,          -- 'SELECT' | 'UPDATE' | 'INSERT'
  terlihat  int,           -- baris tenant B yang terlihat/terdampak
  verdict   text
) on commit drop;
grant select, insert on _rls_results to authenticated;

create temp table _cfg on commit drop as
select '<<GANTI_AUTH_USER_ID>>'::text as sub_a;
grant select on _cfg to authenticated;

-- ------------------------------------------------------------
-- 1. Fixture Tenant B (akan di-ROLLBACK — tidak pernah tersimpan)
-- ------------------------------------------------------------
create temp table _fx on commit drop as
with t as (
  insert into tenants (name, slug, legal_name, plan, status, city, admin_email)
  values ('RLS Probe Tenant B', 'rls-probe-b', 'RLS Probe B', 'business', 'ACTIVE',
          'Bandung', 'rls-probe-b@example.test')
  returning id
), o as (
  insert into outlets (tenant_id, code, name, address, city, phone, lat, lng,
                       geofence_radius, accuracy_threshold, open_hours, status,
                       manager_name, tax_pct, service_charge_pct, receipt_prefix)
  select id, 'RLSB-01', 'RLS Probe Outlet B', 'Jl. Probe 1', 'Bandung', '0800',
         -6.9, 107.6, 100, 45, '10:00-21:00', 'ACTIVE', 'Probe Mgr', 10, 5, 'RLSB'
  from t returning id, tenant_id
), c as (
  insert into customers (tenant_id, name, phone)
  select tenant_id, 'RLS Probe Customer B', '0899-rls-probe' from o
  returning id, tenant_id
), b as (
  insert into bookings (code, outlet_id, customer_id, package_id, duration_min,
                        price, date, scheduled_start, scheduled_end, status,
                        source, add_on_ids)
  select 'BK-RLSPROBE-0001', o.id, c.id,
         (select id from service_packages limit 1), -- paket mana pun, hanya FK
         90, 180000, current_date,
         (current_date::text || 'T10:00:00+00:00')::timestamptz,
         (current_date::text || 'T11:30:00+00:00')::timestamptz,
         'BOOKED', 'Walk-in', '{}'
  from o, c returning id, outlet_id
)
select (select id from t)        as tenant_b,
       (select id from o)        as outlet_b,
       (select id from b)        as booking_b;
grant select on _fx to authenticated;

-- ------------------------------------------------------------
-- 2. Menyamar sebagai user login Tenant A
-- ------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select sub_a from _cfg), 'role', 'authenticated')::text,
  true
);

-- Sanity check identitas — HARUS mengembalikan UUID (bukan null) dan
-- tenant_id yang BUKAN tenant_b. Kalau null, format claims tidak cocok
-- dengan versi auth.uid() project ini — berhenti, laporkan.
select auth.uid()                                  as uid_tersimulasi,
       (select tenant_id from app_users
         where auth_user_id = auth.uid())          as tenant_a,
       (select tenant_b from _fx)                  as tenant_b;

-- ------------------------------------------------------------
-- 3. Probe otomatis seluruh tabel ber-tenant_id dan ber-outlet_id
-- ------------------------------------------------------------
do $$
declare
  r record;
  n int;
  tb uuid := (select tenant_b from _fx);
  ob uuid := (select outlet_b from _fx);
begin
  -- 3a. tabel dengan kolom tenant_id
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'tenant_id'
      and t.table_type = 'BASE TABLE'
    order by 1
  loop
    execute format('select count(*) from public.%I where tenant_id = $1', r.table_name)
      into n using tb;
    insert into _rls_results values
      (r.table_name, 'tenant_id', 'SELECT', n, case when n = 0 then 'LOLOS' else 'BOCOR' end);

    begin
      execute format(
        'with u as (update public.%I set tenant_id = tenant_id where tenant_id = $1 returning 1) select count(*) from u',
        r.table_name) into n using tb;
      insert into _rls_results values
        (r.table_name, 'tenant_id', 'UPDATE', n, case when n = 0 then 'LOLOS' else 'BOCOR' end);
    exception when others then
      -- penolakan keras (mis. kolom generated / permission) juga berarti aman
      insert into _rls_results values (r.table_name, 'tenant_id', 'UPDATE', 0, 'LOLOS (ditolak)');
    end;
  end loop;

  -- 3b. tabel dengan kolom outlet_id (scope lewat outlet milik tenant B)
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'outlet_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'outlets'
    order by 1
  loop
    execute format('select count(*) from public.%I where outlet_id = $1', r.table_name)
      into n using ob;
    insert into _rls_results values
      (r.table_name, 'outlet_id', 'SELECT', n, case when n = 0 then 'LOLOS' else 'BOCOR' end);

    begin
      execute format(
        'with u as (update public.%I set outlet_id = outlet_id where outlet_id = $1 returning 1) select count(*) from u',
        r.table_name) into n using ob;
      insert into _rls_results values
        (r.table_name, 'outlet_id', 'UPDATE', n, case when n = 0 then 'LOLOS' else 'BOCOR' end);
    exception when others then
      insert into _rls_results values (r.table_name, 'outlet_id', 'UPDATE', 0, 'LOLOS (ditolak)');
    end;
  end loop;

  -- 3c. INSERT lintas-tenant: booking ke outlet milik Tenant B
  begin
    execute 'insert into bookings (code, outlet_id, customer_id, package_id, duration_min,
             price, date, scheduled_start, scheduled_end, status, source, add_on_ids)
             select $2, $1, c.id, (select id from service_packages limit 1), 90, 180000,
             current_date, now(), now() + interval ''90 minutes'', ''BOOKED'', ''Walk-in'', ''{}''
             from customers c limit 1'
      using ob, 'BK-RLSPROBE-X';
    insert into _rls_results values ('bookings', 'insert', 'INSERT', 1, 'BOCOR');
  exception when others then
    insert into _rls_results values ('bookings', 'insert', 'INSERT', 0, 'LOLOS (ditolak)');
  end;
end $$;

-- ------------------------------------------------------------
-- 4. Hasil — semua baris harus LOLOS
-- ------------------------------------------------------------
select * from _rls_results order by verdict desc, scope, tabel, uji;

select count(*) filter (where verdict like 'BOCOR%') as jumlah_bocor,
       count(*)                                      as total_uji
from _rls_results;

rollback;
-- ROLLBACK membatalkan fixture Tenant B dan semua percobaan tulis.
-- Catatan hasil temp table ikut hilang bersama rollback — SALIN hasil
-- SELECT di atas (yang tampil di layar) ke dokumen uji sebelum menutup.
--
-- Cakupan yang TIDAK diuji skrip ini (uji terpisah):
--   * Tabel anak tanpa tenant_id/outlet_id (transaction_items,
--     purchase_order_items, dst.) — terlindung lewat induknya; verifikasi
--     dengan membaca policy 0002 per tabel + spot-check aplikasi.
--   * Role anon (default-deny) — jalankan ulang bagian 2–3 dengan
--     `set local role anon` tanpa claims; semua harus 0/ditolak.
--   * Identitas customer (auth lewat customers.auth_user_id) — ulangi
--     dengan sub = auth_user_id customer Tenant A.
--   * Storage policies (bucket foto) — uji lewat API storage, bukan SQL.
--   * Jalur service-role (platform.ts §6.8) — by design melewati RLS;
--     yang diuji adalah validasi di depannya (sudah: C1–C4 UAT super-admin).
