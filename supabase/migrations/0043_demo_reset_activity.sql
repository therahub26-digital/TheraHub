-- 0043_demo_reset_activity.sql
-- ---------------------------------------------------------------------
-- Reset aktivitas tenant DEMO "Royal Spa" (2026-10-20, permintaan Adjie:
-- akun demo marketing di mesin yang sama, data dikembalikan tiap malam).
--
-- Royal Spa tinggal di database PRODUKSI yang sama dengan tenant lain
-- (keputusan Adjie: Supabase sama, Vercel terpisah). Karena itu fungsi ini
-- dibuat sesempit mungkin:
--   * HANYA menerima slug 'royal-spa' — slug lain langsung exception.
--     Tidak ada parameter yang bisa diarahkan ke tenant sungguhan.
--   * Tidak pernah TRUNCATE. Setiap DELETE dibatasi outlet/tenant/booking/
--     transaksi/sesi/karyawan/customer milik Royal Spa.
--   * Data master (outlet, kamar, katalog, karyawan, akun, customer seed,
--     produk) TIDAK dihapus — seed route menimpanya kembali ke nilai awal.
--   * Hanya service_role yang boleh EXECUTE (anon/authenticated dicabut).
--
-- Kenapa dinamis (information_schema + pg_constraint), bukan daftar tabel
-- tulisan tangan: baseline 0001 tidak punya file migrasi, dan tabel
-- aktivitas terus bertambah (booking_deposits, customer_reviews, ...).
-- Daftar tetap akan basi diam-diam dan reset gagal karena FK; pendekatan
-- ini menemukan tabel anak sendiri dan mengulang sampai tidak ada kemajuan.
--
-- Pemakaian (dari seed route, admin client):
--   select public.demo_reset_activity('royal-spa');
-- ---------------------------------------------------------------------

create or replace function public.demo_reset_activity(p_tenant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_outlets uuid[];
  v_keep text[] := array[
    'tenants','plans','outlets','rooms','service_categories','service_types',
    'service_packages','service_package_allowed_extensions','extension_options',
    'add_ons','outlet_profiles','outlet_facilities','outlet_gallery_photos',
    'payroll_settings','promotions','products','product_stocks','petty_cash',
    'employees','app_users','customers','employee_personal_data',
    'tenant_integrations'
  ];
  v_scope jsonb := '{}'::jsonb;      -- table -> where clause
  r record;
  v_where text;
  v_pass int;
  v_progress boolean;
  v_n bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_blocked text[] := '{}';
  v_level int;
begin
  if p_tenant_slug is distinct from 'royal-spa' then
    raise exception 'demo_reset_activity hanya untuk tenant demo royal-spa (diminta: %)', p_tenant_slug;
  end if;

  select id into v_tenant from tenants where slug = p_tenant_slug;
  if v_tenant is null then
    return jsonb_build_object('ok', true, 'note', 'tenant royal-spa belum ada');
  end if;
  select array_agg(id) into v_outlets from outlets where tenant_id = v_tenant;
  if v_outlets is null then
    return jsonb_build_object('ok', true, 'note', 'tenant royal-spa belum punya outlet');
  end if;

  -- Himpunan id yang dipakai untuk men-scope tabel anak.
  drop table if exists _demo_b; drop table if exists _demo_t; drop table if exists _demo_s;
  drop table if exists _demo_e; drop table if exists _demo_c; drop table if exists _demo_u;
  create temp table _demo_b on commit drop as select id from bookings where outlet_id = any(v_outlets);
  create temp table _demo_t on commit drop as select id from transactions where outlet_id = any(v_outlets);
  create temp table _demo_s on commit drop as select id from sessions where outlet_id = any(v_outlets);
  create temp table _demo_e on commit drop as select id from employees where tenant_id = v_tenant;
  create temp table _demo_c on commit drop as select id from customers where tenant_id = v_tenant;
  create temp table _demo_u on commit drop as select id from app_users where tenant_id = v_tenant;

  -- 1. Scope langsung dari nama kolom.
  for r in
    select c.table_name,
           bool_or(c.column_name = 'outlet_id')      as has_outlet,
           bool_or(c.column_name = 'booking_id')     as has_booking,
           bool_or(c.column_name = 'transaction_id') as has_tx,
           bool_or(c.column_name = 'session_id')     as has_session,
           bool_or(c.column_name = 'employee_id')    as has_emp,
           bool_or(c.column_name = 'therapist_id')   as has_ther,
           bool_or(c.column_name = 'customer_id')    as has_cust,
           bool_or(c.column_name = 'tenant_id')      as has_tenant
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and not (c.table_name = any(v_keep))
      and c.table_name not like '\_demo\_%'
    group by c.table_name
  loop
    v_where := null;
    if r.has_outlet  then v_where := coalesce(v_where || ' or ', '') || format('outlet_id = any(%L::uuid[])', v_outlets); end if;
    if r.has_booking then v_where := coalesce(v_where || ' or ', '') || 'booking_id in (select id from _demo_b)'; end if;
    if r.has_tx      then v_where := coalesce(v_where || ' or ', '') || 'transaction_id in (select id from _demo_t)'; end if;
    if r.has_session then v_where := coalesce(v_where || ' or ', '') || 'session_id in (select id from _demo_s)'; end if;
    if r.has_emp     then v_where := coalesce(v_where || ' or ', '') || 'employee_id in (select id from _demo_e)'; end if;
    if r.has_ther    then v_where := coalesce(v_where || ' or ', '') || 'therapist_id in (select id from _demo_e)'; end if;
    if r.has_cust    then v_where := coalesce(v_where || ' or ', '') || 'customer_id in (select id from _demo_c)'; end if;
    if r.has_tenant  then v_where := coalesce(v_where || ' or ', '') || format('tenant_id = %L::uuid', v_tenant); end if;
    if v_where is not null then
      v_scope := v_scope || jsonb_build_object(r.table_name, v_where);
    end if;
  end loop;

  -- 2. Tabel anak tanpa kolom scope sendiri (mis. purchase_order_items):
  --    turunkan scope lewat foreign key ke tabel yang sudah ber-scope.
  for v_level in 1..3 loop
    for r in
      select cl.relname as child, att.attname as col, pcl.relname as parent, patt.attname as pcol
      from pg_constraint con
      join pg_class cl   on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
      join pg_class pcl  on pcl.oid = con.confrelid
      join pg_attribute att  on att.attrelid = con.conrelid  and att.attnum  = con.conkey[1]
      join pg_attribute patt on patt.attrelid = con.confrelid and patt.attnum = con.confkey[1]
      where con.contype = 'f' and array_length(con.conkey, 1) = 1
    loop
      if not (r.child = any(v_keep)) and v_scope ? r.parent and not (v_scope ? r.child) then
        v_scope := v_scope || jsonb_build_object(
          r.child, format('%I in (select %I from %I where %s)', r.col, r.pcol, r.parent, v_scope ->> r.parent));
      end if;
    end loop;
  end loop;

  -- 3. Hapus berulang sampai tidak ada kemajuan; FK yang belum lepas
  --    dicoba lagi di putaran berikutnya setelah anaknya terhapus.
  for v_pass in 1..8 loop
    v_progress := false;
    v_blocked := '{}';
    for r in select key as tbl, value #>> '{}' as cond from jsonb_each(v_scope) loop
      begin
        execute format('delete from %I where %s', r.tbl, r.cond);
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_progress := true;
          v_deleted := v_deleted || jsonb_build_object(r.tbl, coalesce((v_deleted ->> r.tbl)::bigint, 0) + v_n);
        end if;
      exception when foreign_key_violation then
        v_blocked := v_blocked || r.tbl;
      end;
    end loop;
    exit when not v_progress;
  end loop;

  -- 4. Customer tambahan yang dibuat pengunjung demo (bukan seed).
  begin
    delete from customers
    where tenant_id = v_tenant and auth_user_id is null
      and coalesce(notes, '') <> '[royal-demo]';
    get diagnostics v_n = row_count;
    if v_n > 0 then v_deleted := v_deleted || jsonb_build_object('customers(extra)', v_n); end if;
  exception when foreign_key_violation then
    v_blocked := v_blocked || 'customers(extra)'::text;
  end;

  return jsonb_build_object('ok', cardinality(v_blocked) = 0, 'deleted', v_deleted, 'blocked', to_jsonb(v_blocked));
end;
$$;

revoke all on function public.demo_reset_activity(text) from public;
revoke all on function public.demo_reset_activity(text) from anon, authenticated;
grant execute on function public.demo_reset_activity(text) to service_role;
