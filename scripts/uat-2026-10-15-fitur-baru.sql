-- ============================================================
-- scripts/uat-2026-10-15-fitur-baru.sql
-- UAT DATABASE fitur 2026-10-15 — migrasi 0036, 0037, 0038, 0039
-- + premis RLS fitur pindah kamar.
--
-- CARA PAKAI: tempel SELURUH isi file ke SQL Editor Supabase → Run.
-- Hasilnya satu tabel: no · skenario · diharapkan · hasil · catatan.
-- Kriteria lulus: kolom `hasil` tidak ada yang 'G' (gagal).
-- 'N/A' = data demo tidak menyediakan prasyarat (mis. tidak ada akun
-- kasir) — bukan kegagalan, tapi dicatat.
--
-- AMAN DI PRODUKSI: seluruh percobaan tulis (fixture, insert pengajuan,
-- penilaian, update kamar) terjadi di dalam SATU sub-transaksi yang
-- sengaja digagalkan di akhir (RAISE 'UAT_ROLLBACK') — semuanya batal.
-- Yang tersisa hanya isi tabel hasil di layar. Tidak perlu mengedit
-- apa pun: identitas uji dipilih otomatis dari app_users/customers.
--
-- Kenapa bentuk fungsi, bukan begin…rollback biasa: SQL Editor Supabase
-- hanya menampilkan hasil STATEMENT TERAKHIR. Skrip yang diakhiri
-- `rollback;` tampil "Success. No rows returned" — hasil ujinya hilang.
-- Fungsi pg_temp ini menyimpan hasil di variabel (yang selamat dari
-- rollback sub-transaksi) lalu mengembalikannya sebagai tabel.
--
-- Prasyarat: 0036, 0037, 0038 SUDAH, dan 0039 sudah dijalankan.
-- Sebelum 0039: R5a, R5b, R11, R12 diharapkan G (itu justru celah yang
-- ditutup 0039 — uji ini membuktikan celahnya ada/tertutup).
-- ============================================================

create or replace function pg_temp.uat_fitur_20261015()
returns table (no text, skenario text, diharapkan text, hasil text, catatan text)
language plpgsql
as $fn$
declare
  res jsonb := '[]'::jsonb;
  n int;
  v text;
  -- identitas
  mgr_sub uuid; mgr_outlet uuid;
  th_sub uuid; th_emp uuid; th_outlet uuid;
  th2_emp uuid;           -- terapis lain, outlet sama
  far_emp uuid; far_outlet uuid;  -- terapis outlet lain
  ks_sub uuid;
  cu_sub uuid; cu_id uuid; cu_tenant uuid;
  pb_id uuid; pb_emp uuid; pb_outlet uuid; pb_date date;   -- booking PAID milik customer uji
  wrong_emp uuid;                                          -- terapis yang TIDAK melayani booking pb
  np_id uuid; np_emp uuid; np_outlet uuid; np_date date;   -- booking non-PAID milik customer uji
  ob_id uuid; ob_cust uuid; ob_emp uuid; ob_outlet uuid; ob_date date; ob_tenant uuid; -- booking PAID customer lain (fixture review)
  own_bk uuid; own_room uuid;     -- booking milik terapis uji
  oth_bk uuid;                    -- booking milik terapis lain
  own_sess uuid;
  d1 date := current_date + 200;
  d2 date := current_date + 201;
  d3 date := current_date + 202;
  d4 date := current_date + 203;
  per text := to_char(current_date, 'YYYY-MM');
begin
  -- ---------------------------------------------------------- penemuan identitas (sebagai postgres)
  select au.auth_user_id, au.outlet_id into mgr_sub, mgr_outlet
    from app_users au where au.role = 'manager' and au.auth_user_id is not null and au.outlet_id is not null
    order by au.outlet_id limit 1;

  select au.auth_user_id, au.employee_id, e.outlet_id into th_sub, th_emp, th_outlet
    from app_users au join employees e on e.id = au.employee_id
   where au.role = 'therapist' and au.auth_user_id is not null
   order by (e.outlet_id = mgr_outlet) desc nulls last limit 1;

  select id into th2_emp from employees
   where outlet_id = th_outlet and is_therapist and id <> th_emp order by name limit 1;
  select id, outlet_id into far_emp, far_outlet from employees
   where outlet_id <> coalesce(mgr_outlet, th_outlet) and is_therapist order by name limit 1;

  select auth_user_id into ks_sub from app_users where role = 'kasir' and auth_user_id is not null limit 1;

  select c.auth_user_id, c.id, c.tenant_id into cu_sub, cu_id, cu_tenant
    from customers c
   where c.auth_user_id is not null
     and exists (select 1 from bookings b where b.customer_id = c.id and b.status = 'PAID' and b.therapist_id is not null
                   and not exists (select 1 from customer_reviews r where r.booking_id = b.id))
   limit 1;
  if cu_id is not null then
    select b.id, b.therapist_id, b.outlet_id, b.date into pb_id, pb_emp, pb_outlet, pb_date
      from bookings b
     where b.customer_id = cu_id and b.status = 'PAID' and b.therapist_id is not null
       and not exists (select 1 from customer_reviews r where r.booking_id = b.id)
     order by b.date desc limit 1;
    select id into wrong_emp from employees where is_therapist and id <> pb_emp order by (outlet_id = pb_outlet) desc, name limit 1;
    select b.id, b.therapist_id, b.outlet_id, b.date into np_id, np_emp, np_outlet, np_date
      from bookings b
     where b.customer_id = cu_id and b.status <> 'PAID' and b.therapist_id is not null
       and not exists (select 1 from customer_reviews r where r.booking_id = b.id)
     limit 1;
  end if;

  -- booking PAID milik customer LAIN, di outlet terapis uji, BUKAN milik terapis uji (fixture review pihak ketiga)
  select b.id, b.customer_id, b.therapist_id, b.outlet_id, b.date, o.tenant_id
    into ob_id, ob_cust, ob_emp, ob_outlet, ob_date, ob_tenant
    from bookings b join outlets o on o.id = b.outlet_id
   where b.status = 'PAID' and b.therapist_id is not null and b.therapist_id <> th_emp
     and b.customer_id is distinct from cu_id
     and b.outlet_id = coalesce(mgr_outlet, th_outlet)
     and not exists (select 1 from customer_reviews r where r.booking_id = b.id)
   limit 1;

  select b.id, b.room_id into own_bk, own_room from bookings b where b.therapist_id = th_emp order by b.date desc limit 1;
  select b.id into oth_bk from bookings b where b.therapist_id <> th_emp and b.outlet_id = th_outlet order by b.date desc limit 1;
  select s.id into own_sess from sessions s where s.therapist_id = th_emp order by s.id limit 1;

  res := res || jsonb_build_object('no','00','skenario','Identitas uji ditemukan otomatis','diharapkan','manager, terapis, customer ada',
    'hasil', case when mgr_sub is not null and th_sub is not null and cu_sub is not null then 'L' else 'N/A' end,
    'catatan', format('manager=%s terapis=%s kasir=%s customer=%s bookingPAID=%s fixture3rd=%s',
      mgr_sub is not null, th_sub is not null, ks_sub is not null, cu_sub is not null, pb_id is not null, ob_id is not null));

  -- ========================================================== semua tulis di sub-transaksi ini
  begin
    -- ------------------------------------------------ 0036 (sebagai postgres)
    select count(*) into n from outlets
     where work_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or work_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    res := res || jsonb_build_object('no','M36a','skenario','Semua outlet punya jam masuk/pulang HH:mm','diharapkan','0 outlet bermasalah',
      'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s outlet bermasalah; contoh: %s', n,
      (select string_agg(name || ' ' || work_start_time || '–' || work_end_time, '; ') from outlets)));

    begin
      update outlets set work_start_time = '25:00' where id = coalesce(mgr_outlet, th_outlet);
      res := res || jsonb_build_object('no','M36b','skenario','Jam masuk "25:00" ditolak CHECK','diharapkan','ditolak','hasil','G','catatan','UPDATE diterima — CHECK tidak bekerja');
    exception when check_violation then
      res := res || jsonb_build_object('no','M36b','skenario','Jam masuk "25:00" ditolak CHECK','diharapkan','ditolak','hasil','L','catatan',sqlerrm);
    end;

    -- ------------------------------------------------ fixture pihak ketiga (sebagai postgres)
    if ob_id is not null then
      insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating, comment)
      values (ob_tenant, ob_id, ob_cust, ob_emp, ob_outlet, ob_date, 4, '[UAT fixture]');
    end if;
    if th_emp is not null then
      insert into therapist_management_reviews (employee_id, outlet_id, period, rating, note)
      values (th_emp, th_outlet, '2000-01', 3, '[UAT fixture]');
    end if;

    -- ================================================ sebagai TERAPIS
    if th_sub is not null then
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', th_sub, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', th_sub::text, true);

      -- 0036c / 0037: LATE diterima & tercatat otomatis tanpa exception
      begin
        insert into employee_leave_requests (employee_id, outlet_id, date, type, note, status, requested_at)
        values (th_emp, th_outlet, d3, 'LATE', '[UAT] ijin masuk siang', 'PENDING', now());
        res := res || jsonb_build_object('no','M36c','skenario','Terapis kirim jenis LATE (Ijin Masuk Siang)','diharapkan','diterima','hasil','L','catatan','CHECK 0036 menerima LATE');
      exception when others then
        res := res || jsonb_build_object('no','M36c','skenario','Terapis kirim jenis LATE (Ijin Masuk Siang)','diharapkan','diterima','hasil','G','catatan',sqlerrm);
      end;

      begin
        insert into employee_leave_requests (employee_id, outlet_id, date, type, note, status, requested_at)
        values (th_emp, th_outlet, d1, 'LEAVE', '[UAT] sakit', 'PENDING', now());
        insert into employee_leave_requests (employee_id, outlet_id, date, type, note, status, requested_at)
        values (th_emp, th_outlet, d2, 'OFF', '[UAT] libur', 'PENDING', now());
      exception when others then
        res := res || jsonb_build_object('no','T0','skenario','Terapis kirim LEAVE & OFF','diharapkan','diterima','hasil','G','catatan',sqlerrm);
      end;

      -- T5: insert langsung APPROVED (melewati pencatatan) → RLS tetap menolak
      begin
        insert into employee_leave_requests (employee_id, outlet_id, date, type, status, requested_at)
        values (th_emp, th_outlet, d4, 'OFF', 'APPROVED', now());
        res := res || jsonb_build_object('no','T5','skenario','Terapis insert langsung status APPROVED','diharapkan','ditolak RLS','hasil','G','catatan','diterima — policy insert terapis bocor');
      exception when others then
        res := res || jsonb_build_object('no','T5','skenario','Terapis insert langsung status APPROVED','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
      end;

      -- T6: tulis exception jadwal langsung → ditolak (RLS tidak dilonggarkan oleh 0037)
      begin
        insert into employee_schedule_exceptions (employee_id, outlet_id, date, type, note)
        values (th_emp, th_outlet, d4, 'OFF', '[UAT]');
        res := res || jsonb_build_object('no','T6','skenario','Terapis tulis langsung ke employee_schedule_exceptions','diharapkan','ditolak RLS','hasil','G','catatan','diterima — terapis bisa meliburkan diri tanpa jejak pengajuan');
      exception when others then
        res := res || jsonb_build_object('no','T6','skenario','Terapis tulis langsung ke employee_schedule_exceptions','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
      end;

      -- T7: pengajuan atas nama terapis lain → ditolak
      if th2_emp is not null then
        begin
          insert into employee_leave_requests (employee_id, outlet_id, date, type, status, requested_at)
          values (th2_emp, th_outlet, d4, 'LEAVE', 'PENDING', now());
          res := res || jsonb_build_object('no','T7','skenario','Terapis kirim keterangan atas nama terapis lain','diharapkan','ditolak RLS','hasil','G','catatan','diterima');
        exception when others then
          res := res || jsonb_build_object('no','T7','skenario','Terapis kirim keterangan atas nama terapis lain','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
        end;
      end if;

      -- R7: terapis tidak bisa membaca/menulis penilaian manajemen (fixture dirinya sendiri ada)
      select count(*) into n from therapist_management_reviews;
      res := res || jsonb_build_object('no','R7a','skenario','Terapis membaca penilaian manajemen (termasuk tentang dirinya)','diharapkan','0 baris',
        'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris terlihat', n));
      begin
        insert into therapist_management_reviews (employee_id, outlet_id, period, rating) values (th_emp, th_outlet, per, 5);
        res := res || jsonb_build_object('no','R7b','skenario','Terapis menilai dirinya sendiri','diharapkan','ditolak RLS','hasil','G','catatan','diterima');
      exception when others then
        res := res || jsonb_build_object('no','R7b','skenario','Terapis menilai dirinya sendiri','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
      end;

      -- R12: terapis tidak bisa membaca penilaian tamu untuk rekan kerja (0039)
      if ob_id is not null then
        select count(*) into n from customer_reviews where booking_id = ob_id;
        res := res || jsonb_build_object('no','R12','skenario','Terapis membaca penilaian tamu untuk terapis lain','diharapkan','0 baris (0039)',
          'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris terlihat', n));
      else
        res := res || jsonb_build_object('no','R12','skenario','Terapis membaca penilaian tamu untuk terapis lain','diharapkan','0 baris (0039)','hasil','N/A','catatan','tidak ada booking PAID pihak ketiga untuk fixture');
      end if;

      -- K1: premis bug pindah kamar — terapis tidak melihat booking terapis lain
      select count(*) into n from bookings where therapist_id <> th_emp;
      res := res || jsonb_build_object('no','K1','skenario','Terapis melihat booking terapis lain (premis temuan pindah kamar)','diharapkan','0 baris → cek kamar WAJIB lewat admin client',
        'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris terlihat; perbaikan roomMove.ts memakai admin client untuk pengecekan', n));

      -- K2: update booking terapis lain → 0 baris
      if oth_bk is not null then
        with u as (update bookings set room_id = room_id where id = oth_bk returning 1) select count(*) into n from u;
        res := res || jsonb_build_object('no','K2','skenario','Terapis memindah kamar booking terapis lain','diharapkan','0 baris terdampak',
          'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris', n));
      end if;

      -- K3: update kamar booking miliknya → diizinkan (dasar fitur pindah kamar)
      if own_bk is not null then
        begin
          with u as (update bookings set room_id = room_id where id = own_bk returning 1) select count(*) into n from u;
          res := res || jsonb_build_object('no','K3','skenario','Terapis mengubah kamar booking miliknya','diharapkan','1 baris (policy 0012)',
            'hasil', case when n = 1 then 'L' else 'G' end, 'catatan', format('%s baris', n));
        exception when others then
          res := res || jsonb_build_object('no','K3','skenario','Terapis mengubah kamar booking miliknya','diharapkan','1 baris (policy 0012)','hasil','G','catatan',sqlerrm);
        end;
      else
        res := res || jsonb_build_object('no','K3','skenario','Terapis mengubah kamar booking miliknya','diharapkan','1 baris','hasil','N/A','catatan','terapis uji belum punya booking');
      end if;
      if own_sess is not null then
        begin
          with u as (update sessions set room_id = room_id where id = own_sess returning 1) select count(*) into n from u;
          res := res || jsonb_build_object('no','K4','skenario','Terapis mengubah kamar sesinya sendiri','diharapkan','1 baris (sessions_therapist)',
            'hasil', case when n = 1 then 'L' else 'G' end, 'catatan', format('%s baris', n));
        exception when others then
          res := res || jsonb_build_object('no','K4','skenario','Terapis mengubah kamar sesinya sendiri','diharapkan','1 baris','hasil','G','catatan',sqlerrm);
        end;
      end if;

      reset role;
    else
      res := res || jsonb_build_object('no','T*','skenario','Uji sebagai terapis','diharapkan','-','hasil','N/A','catatan','tidak ada akun terapis ber-login');
    end if;

    -- ------------------------------------------------ verifikasi trigger 0037 (sebagai postgres)
    if th_emp is not null then
      select status || ' / ' || coalesce(decision_note, '-') into v from employee_leave_requests where employee_id = th_emp and date = d1;
      res := res || jsonb_build_object('no','T1','skenario','Cuti/Sakit langsung tercatat tanpa ACC','diharapkan','APPROVED / Tercatat otomatis…',
        'hasil', case when v like 'APPROVED / Tercatat otomatis%' then 'L' else 'G' end, 'catatan', coalesce(v, 'baris tidak ditemukan'));

      select type into v from employee_schedule_exceptions where employee_id = th_emp and date = d1;
      res := res || jsonb_build_object('no','T2','skenario','Cuti/Sakit → otomatis tidak bekerja (exception LEAVE)','diharapkan','exception LEAVE',
        'hasil', case when v = 'LEAVE' then 'L' else 'G' end, 'catatan', coalesce(v, 'tidak ada exception'));

      select type into v from employee_schedule_exceptions where employee_id = th_emp and date = d2;
      res := res || jsonb_build_object('no','T3','skenario','Libur → otomatis tidak bekerja (exception OFF)','diharapkan','exception OFF',
        'hasil', case when v = 'OFF' then 'L' else 'G' end, 'catatan', coalesce(v, 'tidak ada exception'));

      select status into v from employee_leave_requests where employee_id = th_emp and date = d3;
      select count(*) into n from employee_schedule_exceptions where employee_id = th_emp and date = d3;
      res := res || jsonb_build_object('no','T4','skenario','Ijin Masuk Siang tercatat, TETAP bekerja','diharapkan','APPROVED, 0 exception',
        'hasil', case when v = 'APPROVED' and n = 0 then 'L' else 'G' end, 'catatan', format('status=%s exception=%s', coalesce(v,'-'), n));
    end if;

    -- ================================================ sebagai CUSTOMER
    if cu_sub is not null and pb_id is not null then
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', cu_sub, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', cu_sub::text, true);

      -- R3: rating di luar 1–5
      begin
        insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating)
        values (cu_tenant, pb_id, cu_id, pb_emp, pb_outlet, pb_date, 6);
        res := res || jsonb_build_object('no','R3','skenario','Bintang 6','diharapkan','ditolak CHECK','hasil','G','catatan','diterima');
      exception when others then
        res := res || jsonb_build_object('no','R3','skenario','Bintang 6','diharapkan','ditolak','hasil','L','catatan',sqlerrm);
      end;

      -- R5a: booking sendiri yang PAID, tapi bintang diatribusikan ke terapis lain (0039)
      begin
        insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating)
        values (cu_tenant, pb_id, cu_id, wrong_emp, pb_outlet, pb_date, 1);
        res := res || jsonb_build_object('no','R5a','skenario','Tamu menilai terapis yang TIDAK melayaninya (lewat API langsung)','diharapkan','ditolak RLS (0039)','hasil','G','catatan','diterima — celah 0038; jalankan 0039');
      exception when others then
        res := res || jsonb_build_object('no','R5a','skenario','Tamu menilai terapis yang TIDAK melayaninya (lewat API langsung)','diharapkan','ditolak RLS (0039)','hasil','L','catatan',sqlerrm);
      end;

      -- R5b: booking sendiri yang belum/tidak dibayar (0039)
      if np_id is not null then
        begin
          insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating)
          values (cu_tenant, np_id, cu_id, np_emp, np_outlet, np_date, 2);
          res := res || jsonb_build_object('no','R5b','skenario','Tamu menilai kunjungan yang belum dibayar/batal','diharapkan','ditolak RLS (0039)','hasil','G','catatan','diterima — celah 0038; jalankan 0039');
        exception when others then
          res := res || jsonb_build_object('no','R5b','skenario','Tamu menilai kunjungan yang belum dibayar/batal','diharapkan','ditolak RLS (0039)','hasil','L','catatan',sqlerrm);
        end;
      else
        res := res || jsonb_build_object('no','R5b','skenario','Tamu menilai kunjungan yang belum dibayar/batal','diharapkan','ditolak','hasil','N/A','catatan','customer uji tidak punya booking non-PAID');
      end if;

      -- R4: atas nama customer lain
      if ob_cust is not null then
        begin
          insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating)
          values (cu_tenant, pb_id, ob_cust, pb_emp, pb_outlet, pb_date, 5);
          res := res || jsonb_build_object('no','R4','skenario','Tamu mengirim penilaian atas nama tamu lain','diharapkan','ditolak RLS','hasil','G','catatan','diterima');
        exception when others then
          res := res || jsonb_build_object('no','R4','skenario','Tamu mengirim penilaian atas nama tamu lain','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
        end;
      end if;

      -- R1: jalur sah
      begin
        insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating, comment)
        values (cu_tenant, pb_id, cu_id, pb_emp, pb_outlet, pb_date, 5, '[UAT] pelayanan bagus');
        res := res || jsonb_build_object('no','R1','skenario','Tamu menilai kunjungan PAID miliknya','diharapkan','diterima','hasil','L','catatan','bintang 5 tersimpan');
      exception when others then
        res := res || jsonb_build_object('no','R1','skenario','Tamu menilai kunjungan PAID miliknya','diharapkan','diterima','hasil','G','catatan',sqlerrm);
      end;

      -- R2: kunjungan yang sama dua kali
      begin
        insert into customer_reviews (tenant_id, booking_id, customer_id, employee_id, outlet_id, visit_date, rating)
        values (cu_tenant, pb_id, cu_id, pb_emp, pb_outlet, pb_date, 4);
        res := res || jsonb_build_object('no','R2','skenario','Menilai kunjungan yang sama dua kali','diharapkan','ditolak UNIQUE','hasil','G','catatan','diterima');
      exception when unique_violation then
        res := res || jsonb_build_object('no','R2','skenario','Menilai kunjungan yang sama dua kali','diharapkan','ditolak UNIQUE','hasil','L','catatan',sqlerrm);
      when others then
        res := res || jsonb_build_object('no','R2','skenario','Menilai kunjungan yang sama dua kali','diharapkan','ditolak UNIQUE','hasil','L','catatan','ditolak: ' || sqlerrm);
      end;

      -- R13: penilaian tidak bisa diedit/dihapus
      with u as (update customer_reviews set rating = 1 where booking_id = pb_id returning 1) select count(*) into n from u;
      res := res || jsonb_build_object('no','R13a','skenario','Tamu mengubah penilaiannya sendiri','diharapkan','0 baris (tidak ada policy UPDATE)',
        'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris', n));
      with u as (delete from customer_reviews where booking_id = pb_id returning 1) select count(*) into n from u;
      res := res || jsonb_build_object('no','R13b','skenario','Tamu menghapus penilaiannya sendiri','diharapkan','0 baris',
        'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris', n));

      -- R6: tidak melihat penilaian tamu lain
      if ob_id is not null then
        select count(*) into n from customer_reviews where customer_id <> cu_id;
        res := res || jsonb_build_object('no','R6','skenario','Tamu membaca penilaian tamu lain','diharapkan','0 baris',
          'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris terlihat', n));
      end if;

      reset role;
    else
      res := res || jsonb_build_object('no','R1–R6','skenario','Uji sebagai customer','diharapkan','-','hasil','N/A','catatan','tidak ada customer ber-login yang punya kunjungan PAID belum dinilai');
    end if;

    -- ================================================ sebagai KASIR
    if ks_sub is not null and th_emp is not null then
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', ks_sub, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', ks_sub::text, true);
      begin
        insert into therapist_management_reviews (employee_id, outlet_id, period, rating) values (th_emp, th_outlet, per, 4);
        res := res || jsonb_build_object('no','R8','skenario','Kasir memberi penilaian manajemen','diharapkan','ditolak RLS','hasil','G','catatan','diterima');
      exception when others then
        res := res || jsonb_build_object('no','R8','skenario','Kasir memberi penilaian manajemen','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
      end;
      if ob_id is not null then
        select count(*) into n from customer_reviews;
        res := res || jsonb_build_object('no','R12k','skenario','Kasir membaca penilaian tamu','diharapkan','0 baris (0039)',
          'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris terlihat', n));
      end if;
      reset role;
    end if;

    -- ================================================ sebagai MANAGER
    if mgr_sub is not null then
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', mgr_sub, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', mgr_sub::text, true);

      -- R9: penilaian terapis outlet sendiri + upsert bulan sama
      if th_outlet = mgr_outlet then
        begin
          insert into therapist_management_reviews (employee_id, outlet_id, period, rating, note)
          values (th_emp, mgr_outlet, per, 4, '[UAT] rapi')
          on conflict (employee_id, period) do update set rating = excluded.rating, note = excluded.note;
          insert into therapist_management_reviews (employee_id, outlet_id, period, rating, note)
          values (th_emp, mgr_outlet, per, 5, '[UAT] diperbarui')
          on conflict (employee_id, period) do update set rating = excluded.rating, note = excluded.note;
          select count(*), max(rating) into n, v from therapist_management_reviews where employee_id = th_emp and period = per;
          res := res || jsonb_build_object('no','R9','skenario','Manager menilai terapis outletnya, lalu menilai ulang bulan yang sama','diharapkan','1 baris, bintang 5',
            'hasil', case when n = 1 and v = '5' then 'L' else 'G' end, 'catatan', format('%s baris, bintang %s', n, v));
        exception when others then
          res := res || jsonb_build_object('no','R9','skenario','Manager menilai terapis outletnya','diharapkan','diterima','hasil','G','catatan',sqlerrm);
        end;
      else
        res := res || jsonb_build_object('no','R9','skenario','Manager menilai terapis outletnya','diharapkan','diterima','hasil','N/A','catatan','terapis ber-login tidak di outlet manager uji');
      end if;

      -- R10: outlet lain
      if far_emp is not null then
        begin
          insert into therapist_management_reviews (employee_id, outlet_id, period, rating) values (far_emp, far_outlet, per, 1);
          res := res || jsonb_build_object('no','R10','skenario','Manager menilai terapis outlet lain (outlet_id outlet lain)','diharapkan','ditolak RLS','hasil','G','catatan','diterima');
        exception when others then
          res := res || jsonb_build_object('no','R10','skenario','Manager menilai terapis outlet lain (outlet_id outlet lain)','diharapkan','ditolak RLS','hasil','L','catatan',sqlerrm);
        end;
        -- R11: outlet_id miliknya, employee outlet lain (0039)
        begin
          insert into therapist_management_reviews (employee_id, outlet_id, period, rating) values (far_emp, mgr_outlet, per, 1);
          res := res || jsonb_build_object('no','R11','skenario','Manager menilai terapis outlet lain dengan outlet_id miliknya','diharapkan','ditolak RLS (0039)','hasil','G','catatan','diterima — celah 0038; jalankan 0039');
        exception when others then
          res := res || jsonb_build_object('no','R11','skenario','Manager menilai terapis outlet lain dengan outlet_id miliknya','diharapkan','ditolak RLS (0039)','hasil','L','catatan',sqlerrm);
        end;
      else
        res := res || jsonb_build_object('no','R10–11','skenario','Manager menilai terapis outlet lain','diharapkan','ditolak','hasil','N/A','catatan','hanya ada satu outlet ber-terapis');
      end if;

      -- R14: manager membaca penilaian tamu outletnya
      if ob_id is not null and ob_outlet = mgr_outlet then
        select count(*) into n from customer_reviews where booking_id = ob_id;
        res := res || jsonb_build_object('no','R14','skenario','Manager membaca penilaian tamu di outletnya','diharapkan','1 baris',
          'hasil', case when n = 1 then 'L' else 'G' end, 'catatan', format('%s baris', n));
      end if;

      -- K5: manager tetap bisa melihat booking semua terapis outletnya (layar monitor kamar)
      select count(*) into n from bookings where outlet_id = mgr_outlet;
      res := res || jsonb_build_object('no','K5','skenario','Manager melihat booking outletnya (monitor kamar)','diharapkan','> 0',
        'hasil', case when n > 0 then 'L' else 'N/A' end, 'catatan', format('%s booking', n));

      reset role;
    end if;

    raise exception 'UAT_ROLLBACK';
  exception when others then
    if sqlerrm <> 'UAT_ROLLBACK' then
      res := res || jsonb_build_object('no','ERR','skenario','Harness berhenti tak terduga','diharapkan','-','hasil','G','catatan',sqlerrm);
    end if;
  end;

  -- pastikan tidak ada yang tersimpan
  select count(*) into n from employee_leave_requests where note like '[UAT]%';
  select count(*) + n into n from customer_reviews where comment like '[UAT%';
  select count(*) + n into n from therapist_management_reviews where note like '[UAT%';
  res := res || jsonb_build_object('no','ZZ','skenario','Semua tulis uji dibatalkan','diharapkan','0 baris [UAT] tersisa',
    'hasil', case when n = 0 then 'L' else 'G' end, 'catatan', format('%s baris tersisa', n));

  return query
    select x->>'no', x->>'skenario', x->>'diharapkan', x->>'hasil', x->>'catatan'
      from jsonb_array_elements(res) x;
end
$fn$;

select * from pg_temp.uat_fitur_20261015();
