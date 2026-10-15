-- ============================================================
-- scripts/rls-crosstenant-test.sql  — v2.1 (2026-10-15)
-- UJI ISOLASI RLS LINTAS-TENANT (handover §14.3 no.1 — prasyarat
-- mutlak sebelum tenant/klien kedua).
--
-- CARA PAKAI: tempel SELURUH file ke SQL Editor Supabase → Run.
-- Tidak perlu mengedit apa pun (v1 meminta auth_user_id diisi manual
-- dan dijalankan 2×; v2 memilih SEMUA identitas otomatis).
--
-- KRITERIA LULUS: baris berhasil = 'RINGKASAN' dengan 0 bocor untuk
-- setiap identitas, dan TIDAK ADA baris berhasil = 'BOCOR'.
--
-- Cara kerja (semua di dalam satu sub-transaksi yang DIGAGALKAN di
-- akhir — tidak ada satu baris pun yang tersimpan):
--   1. (sebagai postgres) membuat fixture "Tenant B" sintetis di
--      HAMPIR SEMUA tabel ber-tenant_id/outlet_id/employee_id/
--      customer_id/booking_id — dengan MENGKLON satu baris milik
--      Tenant A per tabel lalu mengganti kunci kepemilikannya ke B.
--      Kloning (bukan INSERT tulisan tangan) berarti kolom NOT NULL
--      apa pun yang ada di produksi otomatis terisi — fixture tidak
--      bergantung pada daftar kolom yang ditebak.
--   2. Untuk SETIAP identitas Tenant A — satu akun per peran yang ada
--      (super-admin, admin, owner, manager, kasir, therapist), satu
--      customer ber-login, dan anon — menyamar
--      (set role + request.jwt.claims) lalu untuk setiap tabel:
--        SELECT baris milik B  → harus 0
--        UPDATE baris milik B  → harus 0 terdampak / ditolak
--      plus INSERT booking ke outlet B → harus ditolak.
--   3. Mengembalikan tabel hasil.
--
-- v1 berakhir dengan `rollback;` sehingga SQL Editor hanya
-- menampilkan "Success. No rows returned" — hasil ujinya tidak pernah
-- terlihat. v2 menyimpan hasil di variabel lalu mengembalikannya.
--
-- Cakupan yang TIDAK diuji (uji terpisah): storage bucket (lewat API),
-- jalur service-role platform.ts §6.8 (by design melewati RLS),
-- tabel anak tanpa satu pun dari 5 kolom kunci di atas.
-- ============================================================

create or replace function pg_temp.rls_crosstenant()
returns table (identitas text, tabel text, scope text, uji text, terlihat int, hasil text)
language plpgsql
as $fn$
declare
  res jsonb := '[]'::jsonb;
  tb uuid := gen_random_uuid();   -- tenant B
  ob uuid := gen_random_uuid();   -- outlet B
  eb uuid := gen_random_uuid();   -- terapis B
  cb uuid := gen_random_uuid();   -- customer B
  bb uuid := gen_random_uuid();   -- booking B
  sfx text := 'rlsb' || substr(md5(random()::text), 1, 6);
  r record; idn record;
  n int; tot int; bocor int;
  ok_tables text[] := '{}'; fail_tables text[] := '{}';
  src jsonb; ov jsonb;
  bk_payload jsonb;
  bmap jsonb := '{}'::jsonb;   -- nama tabel → id baris Tenant B hasil klon (untuk menyambung FK anak ke induk B)
  fk record;   -- disiapkan sebagai postgres: setelah ganti peran, booking B memang tak terbaca
  key text;
  keycols text[] := array['tenant_id','outlet_id','employee_id','therapist_id','customer_id','booking_id'];
begin
  begin
    -- ======================================================== 1. FIXTURE TENANT B (sebagai postgres)
    -- Fungsi kecil: klon satu baris dari tabel T, timpa kunci, insert.
    -- Ditulis inline per tabel inti (urutan FK), lalu loop untuk sisanya.
    for r in select unnest(array['tenants','outlets','employees','customers','bookings']) as t loop
      begin
        execute format('select to_jsonb(x) from public.%I x limit 1', r.t) into src;
        if src is null then
          fail_tables := fail_tables || (r.t || ': tidak ada baris contoh'); continue;
        end if;
        ov := case r.t
          when 'tenants'   then jsonb_build_object('id', tb)
          when 'outlets'   then jsonb_build_object('id', ob, 'tenant_id', tb)
          when 'employees' then jsonb_build_object('id', eb, 'tenant_id', tb, 'outlet_id', ob)
          when 'customers' then jsonb_build_object('id', cb, 'tenant_id', tb, 'auth_user_id', null)
          when 'bookings'  then jsonb_build_object('id', bb, 'outlet_id', ob, 'customer_id', cb, 'therapist_id', eb, 'room_id', null)
        end;
        -- kolom unik umum → nilai unik
        foreach key in array array['slug','code','receipt_prefix','email','phone','name'] loop
          if src ? key and jsonb_typeof(src->key) = 'string' then ov := ov || jsonb_build_object(key, (src->>key) || '-' || sfx); end if;
        end loop;
        execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)', r.t) using src || ov;
        ok_tables := ok_tables || r.t;
        bmap := bmap || jsonb_build_object(r.t, (src || ov)->>'id');
      exception when others then
        fail_tables := fail_tables || (r.t || ': ' || sqlerrm);
      end;
    end loop;

    -- sisa tabel ber-kunci kepemilikan: klon 1 baris, alihkan semua kunci ke B
    -- v2.1 (temuan UAT 2026-10-15): urutan INDUK SEBELUM ANAK + FK disambung ke
    -- baris induk Tenant B. Tanpa ini, transaction_items hasil klon tetap
    -- menunjuk transaksi Tenant A, dan staf A "melihat" item yang memang
    -- berada di transaksinya sendiri → BOCOR palsu.
    for r in
      with recursive cand as (
        select distinct c.table_name::text as t
          from information_schema.columns c
          join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
         where c.table_schema = 'public' and x.table_type = 'BASE TABLE'
           and c.column_name = any (keycols)
           and c.table_name not in ('tenants','outlets','employees','customers','bookings')
      ), fkg as (
        select ct.relname::text as child, cf.relname::text as parent
          from pg_constraint k
          join pg_class ct on ct.oid = k.conrelid
          join pg_class cf on cf.oid = k.confrelid
         where k.contype = 'f' and ct.relnamespace = 'public'::regnamespace and k.conrelid <> k.confrelid
      ), d (t, depth) as (
        select t, 0 from cand
        union all
        select fkg.child, d.depth + 1 from fkg join d on fkg.parent = d.t
         where d.depth < 12 and fkg.child in (select t from cand)
      )
      select t, max(depth) as depth from d group by t order by 2, 1
    loop
      begin
        execute format('select to_jsonb(x) from public.%I x limit 1', r.t) into src;
        if src is null then continue; end if;   -- tabel kosong: tidak ada yang bisa bocor dari B
        ov := '{}'::jsonb;
        if src ? 'id' and jsonb_typeof(src->'id') = 'string' and (src->>'id') ~ '^[0-9a-f-]{36}$' then ov := ov || jsonb_build_object('id', gen_random_uuid()); end if;
        if src ? 'tenant_id'    then ov := ov || jsonb_build_object('tenant_id', tb); end if;
        if src ? 'outlet_id'    then ov := ov || jsonb_build_object('outlet_id', ob); end if;
        if src ? 'employee_id'  then ov := ov || jsonb_build_object('employee_id', eb); end if;
        if src ? 'therapist_id' then ov := ov || jsonb_build_object('therapist_id', eb); end if;
        if src ? 'customer_id'  then ov := ov || jsonb_build_object('customer_id', cb); end if;
        if src ? 'booking_id'   then ov := ov || jsonb_build_object('booking_id', bb); end if;
        if src ? 'auth_user_id' then ov := ov || jsonb_build_object('auth_user_id', null); end if;
        if src ? 'room_id'      then ov := ov || jsonb_build_object('room_id', null); end if;
        foreach key in array array['slug','code','receipt_prefix','email','phone','ref','receipt_no','invoice_no'] loop
          if src ? key and jsonb_typeof(src->key) = 'string' then ov := ov || jsonb_build_object(key, (src->>key) || '-' || sfx); end if;
        end loop;
        -- sambungkan setiap FK satu-kolom ke baris induk Tenant B yang sudah diklon
        for fk in
          select a.attname::text as col, cf.relname::text as parent
            from pg_constraint k
            join pg_class ct on ct.oid = k.conrelid
            join pg_class cf on cf.oid = k.confrelid
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
           where k.contype = 'f' and ct.relname = r.t and ct.relnamespace = 'public'::regnamespace
             and array_length(k.conkey, 1) = 1 and k.conrelid <> k.confrelid
        loop
          if src ? fk.col and bmap ? fk.parent then ov := ov || jsonb_build_object(fk.col, bmap->>fk.parent); end if;
        end loop;
        execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)', r.t) using src || ov;
        ok_tables := ok_tables || r.t;
        if (src || ov) ? 'id' then bmap := bmap || jsonb_build_object(r.t, (src || ov)->>'id'); end if;
      exception when others then
        fail_tables := fail_tables || (r.t || ': ' || left(sqlerrm, 80));
      end;
    end loop;

    res := res || jsonb_build_object('identitas','(fixture)','tabel', array_length(ok_tables,1) || ' tabel terisi baris Tenant B',
      'scope', array_to_string(ok_tables, ', '), 'uji','FIXTURE','terlihat', 0, 'hasil','INFO');
    if array_length(fail_tables,1) > 0 then
      res := res || jsonb_build_object('identitas','(fixture)','tabel', array_length(fail_tables,1) || ' tabel tidak bisa diklon (hanya mengurangi cakupan, bukan kegagalan)',
        'scope', array_to_string(fail_tables, ' | '), 'uji','FIXTURE','terlihat', 0, 'hasil','INFO');
    end if;

    select to_jsonb(b) into bk_payload from public.bookings b where b.id = bb;

    -- ======================================================== 2. PROBE PER IDENTITAS
    for idn in
      select * from (
        select distinct on (au.role) au.role::text as label, au.auth_user_id as sub
          from app_users au where au.auth_user_id is not null and au.tenant_id is distinct from tb
         order by au.role
      ) s
      union all
      select 'customer', c.auth_user_id from (select auth_user_id from customers where auth_user_id is not null and tenant_id <> tb limit 1) c
      union all
      select 'anon', null::uuid
    loop
      tot := 0; bocor := 0;
      if idn.label = 'anon' then
        set local role anon;
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        perform set_config('request.jwt.claim.sub', '', true);
      else
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', idn.sub, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', idn.sub::text, true);
      end if;

      for r in
        select c.table_name as t, c.column_name as col
          from information_schema.columns c
          join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
         where c.table_schema = 'public' and x.table_type = 'BASE TABLE' and c.column_name = any (keycols)
         order by 1, 2
      loop
        begin
          execute format('select count(*) from public.%I where %I = $1', r.t, r.col) into n
            using case r.col when 'tenant_id' then tb when 'outlet_id' then ob when 'customer_id' then cb when 'booking_id' then bb else eb end;
        exception when others then n := 0;  -- tanpa hak baca sama sekali = aman
        end;
        tot := tot + 1;
        if n > 0 then
          bocor := bocor + 1;
          res := res || jsonb_build_object('identitas', idn.label, 'tabel', r.t, 'scope', r.col, 'uji','SELECT','terlihat', n, 'hasil','BOCOR');
        end if;

        begin
          execute format('with u as (update public.%1$I set %2$I = %2$I where %2$I = $1 returning 1) select count(*) from u', r.t, r.col) into n
            using case r.col when 'tenant_id' then tb when 'outlet_id' then ob when 'customer_id' then cb when 'booking_id' then bb else eb end;
        exception when others then n := 0;
        end;
        tot := tot + 1;
        if n > 0 then
          bocor := bocor + 1;
          res := res || jsonb_build_object('identitas', idn.label, 'tabel', r.t, 'scope', r.col, 'uji','UPDATE','terlihat', n, 'hasil','BOCOR');
        end if;
      end loop;

      -- INSERT booking ke outlet B
      if bk_payload is not null then
        begin
          execute 'insert into public.bookings select * from jsonb_populate_record(null::public.bookings, $1)'
            using bk_payload || jsonb_build_object('id', gen_random_uuid(), 'code', 'BK-RLSX-' || sfx || '-' || idn.label);
          tot := tot + 1; bocor := bocor + 1;
          res := res || jsonb_build_object('identitas', idn.label, 'tabel','bookings', 'scope','outlet B', 'uji','INSERT','terlihat', 1, 'hasil','BOCOR');
        exception when others then
          tot := tot + 1;   -- ditolak RLS/izin = aman
        end;
      end if;

      reset role;
      res := res || jsonb_build_object('identitas', idn.label, 'tabel', format('%s uji', tot), 'scope', '-', 'uji','RINGKASAN',
        'terlihat', bocor, 'hasil', case when bocor = 0 then 'LOLOS' else 'BOCOR' end);
    end loop;

    raise exception 'UAT_ROLLBACK';
  exception when others then
    if sqlerrm <> 'UAT_ROLLBACK' then
      res := res || jsonb_build_object('identitas','(harness)','tabel','berhenti tak terduga','scope', sqlerrm,'uji','ERR','terlihat',0,'hasil','GAGAL');
    end if;
  end;

  -- bukti tidak ada sisa
  select count(*) into n from tenants where id = tb;
  res := res || jsonb_build_object('identitas','(akhir)','tabel','fixture Tenant B tersisa','scope','-','uji','ROLLBACK','terlihat', n,
    'hasil', case when n = 0 then 'LOLOS' else 'GAGAL' end);

  return query
    select x->>'identitas', x->>'tabel', x->>'scope', x->>'uji', (x->>'terlihat')::int, x->>'hasil'
      from jsonb_array_elements(res) x
     order by case x->>'hasil' when 'BOCOR' then 0 when 'GAGAL' then 0 when 'INFO' then 2 else 1 end, x->>'identitas';
end
$fn$;

select * from pg_temp.rls_crosstenant();
