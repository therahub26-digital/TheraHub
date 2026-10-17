-- =====================================================================
-- 0040 — Performa RLS (initplan) + index untuk foreign key
-- SUDAH DITERAPKAN ke produksi (therahub-project-sg, Singapore) 2026-10-17.
-- Idempoten: menjalankannya ulang tidak mengubah apa pun.
--
-- MASALAH (audit performa 2026-10-17, keluhan "aplikasi terasa lag"):
-- 127 dari 169 policy memanggil fungsi pengecek identitas
-- (_current_tenant_id(), _current_employee_id(), _is_admin_or_owner(),
-- _is_manager_here(x), ...) secara langsung. Fungsi itu SECURITY DEFINER
-- sehingga tidak bisa di-inline planner: ia dieksekusi ULANG UNTUK SETIAP
-- BARIS yang dipindai, masing-masing dengan lookup ke app_users.
-- Akibatnya (diukur sebagai manager Cikawao, EXPLAIN ANALYZE):
--   count(*) commission_entries   236 ms  ->  3,0 ms
--   select sessions               487 ms  ->  4,3 ms
--   select bookings               233 ms  ->  3,9 ms
--   select transaction_items      569 ms  ->  4,6 ms
--
-- PERBAIKAN (tanpa mengubah logika akses):
-- 1. Panggilan tanpa argumen dibungkus `(SELECT fn())` -> Postgres
--    menghitungnya SEKALI per query (InitPlan), bukan sekali per baris.
--    Aman karena fungsinya STABLE dan hanya bergantung pada auth.uid().
-- 2. _is_manager_here(x) / _is_outlet_staff(x) di-inline dengan isi
--    fungsinya sendiri (COALESCE(role = .. AND outlet = x, false)),
--    dengan role & outlet diambil lewat `(SELECT ...)` sekali per query.
--    Fungsi aslinya TIDAK dihapus/diubah (masih dipakai kode lain).
-- 3. Index untuk setiap foreign key yang kolom depannya belum ber-index
--    (70 FK) — mempercepat join dan subquery RLS `outlet_id IN (...)`.
--
-- VERIFIKASI saat diterapkan: jumlah baris yang terlihat oleh 8 akun +
-- anon di 57 tabel IDENTIK sebelum/sesudah (0 selisih).
--
-- PENTING untuk policy BARU: tulis `(select _current_tenant_id())`,
-- bukan `_current_tenant_id()` telanjang, atau jalankan ulang file ini.
-- =====================================================================

create or replace function pg_temp._rls_initplan(e text) returns text
language plpgsql immutable as $f$
begin
  if e is null then return null; end if;
  e := regexp_replace(e, '(public\.)?_is_manager_here\(([a-z_.]+)\)',
        'COALESCE(((SELECT _current_role()) = ''manager''::app_role AND (SELECT _current_outlet_id()) = (\2)), false)', 'g');
  e := regexp_replace(e, '(public\.)?_is_outlet_staff\(([a-z_.]+)\)',
        'COALESCE(((SELECT _current_role()) = ANY (ARRAY[''manager''::app_role, ''kasir''::app_role]) AND (SELECT _current_outlet_id()) = (\2)), false)', 'g');
  e := regexp_replace(e, '(?<!SELECT )((public\.)?(_current_[a-z_]+|_effective_tenant_id|_is_admin_or_owner)\(\))', '(SELECT \1)', 'g');
  e := regexp_replace(e, '(?<!SELECT )(auth\.(uid|jwt|role)\(\))', '(SELECT \1)', 'g');
  return e;
end $f$;

do $$
declare
  r record;
  nq text;
  nc text;
  n int := 0;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies where schemaname = 'public'
  loop
    nq := pg_temp._rls_initplan(r.qual);
    nc := pg_temp._rls_initplan(r.with_check);
    if nq is distinct from r.qual or nc is distinct from r.with_check then
      execute format('alter policy %I on public.%I', r.policyname, r.tablename)
        || case when r.qual is not null then format(' using (%s)', nq) else '' end
        || case when r.with_check is not null then format(' with check (%s)', nc) else '' end;
      n := n + 1;
    end if;
  end loop;
  raise notice '0040: % policy ditulis ulang', n;
end $$;

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct c.conrelid::regclass as tbl, cl.relname as tname, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)',
                   left('idx_' || r.tname || '_' || r.col, 63), r.tbl, r.col);
    n := n + 1;
  end loop;
  raise notice '0040: % index FK dibuat', n;
end $$;

analyze;
