-- ---------------------------------------------------------------------
-- 0039_reviews_rls_tighten.sql
--
-- STATUS: LIVE — dijalankan Adjie via SQL Editor 2026-10-15 20:47, sukses.
-- Aman dijalankan kapan saja (hanya mengganti 3 policy, idempoten,
-- tanpa menyentuh data). Jalankan SEBELUM harness
-- scripts/uat-2026-10-15-fitur-baru.sql supaya uji R5/R11/R12 lolos.
--
-- Latar belakang: TEMUAN UAT 2026-10-15 (pembacaan ulang kode 0038).
-- Server action submitCustomerReview() memvalidasi kepemilikan booking,
-- status PAID, dan terapisnya — tapi RLS di belakangnya jauh lebih
-- longgar, dan RLS-lah pagar yang sesungguhnya (siapa pun yang memegang
-- JWT-nya bisa memanggil PostgREST langsung, melewati server action):
--
--   (1) customer_reviews_customer_insert hanya memeriksa
--       customer_id = dirinya. Tamu bisa menilai booking miliknya yang
--       CANCELLED/NO_SHOW/belum dibayar, mengisi employee_id terapis
--       LAIN (bintang 1 untuk orang yang tidak melayaninya), atau
--       memalsukan visit_date/outlet_id/tenant_id. Diperketat: baris
--       harus cocok persis dengan booking PAID milik tamu itu sendiri.
--
--   (2) customer_reviews_staff_read memberi baca ke SEMUA staf tenant —
--       termasuk terapis membaca komentar tamu tentang rekan kerjanya,
--       dan kasir yang tidak butuh. Disempitkan: admin/owner (tenant),
--       manager (outlet sendiri), dan terapis HANYA penilaian dirinya.
--
--   (3) therapist_management_reviews_staff tidak mengikat employee_id
--       ke outlet_id: manager outlet A bisa menulis penilaian untuk
--       terapis outlet B dengan outlet_id = A (lolos _is_manager_here).
--       WITH CHECK kini mewajibkan terapisnya memang milik outlet itu.
--
-- Verifikasi: jalankan scripts/uat-2026-10-15-fitur-baru.sql — R5, R11,
-- R12 harus LOLOS.
-- ---------------------------------------------------------------------

-- (1) Insert penilaian tamu: harus cocok dengan booking PAID miliknya.
-- Subquery bookings berjalan di bawah RLS tamu (bookings_customer) —
-- tamu memang hanya bisa melihat booking miliknya, jadi kecocokan di
-- sini sekaligus bukti kepemilikan. tenant_id dibandingkan dengan baris
-- customers milik tamu sendiri (terbaca lewat policy customer-self).
drop policy if exists customer_reviews_customer_insert on customer_reviews;
create policy customer_reviews_customer_insert on customer_reviews
  for insert to authenticated
  with check (
    customer_id = _current_customer_id()
    and tenant_id = (select c.tenant_id from customers c where c.id = _current_customer_id())
    and exists (
      select 1
        from bookings b
       where b.id = customer_reviews.booking_id
         and b.customer_id = _current_customer_id()
         and b.status = 'PAID'
         and b.therapist_id = customer_reviews.employee_id
         and b.outlet_id = customer_reviews.outlet_id
         and b.date = customer_reviews.visit_date
    )
  );

-- (2) Baca penilaian tamu: admin/owner, manager outletnya, terapis yang dinilai.
drop policy if exists customer_reviews_staff_read on customer_reviews;
create policy customer_reviews_staff_read on customer_reviews
  for select to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
    or employee_id = _current_employee_id()
  );

-- (3) Penilaian manajemen: terapis wajib milik outlet yang sama.
drop policy if exists therapist_management_reviews_staff on therapist_management_reviews;
create policy therapist_management_reviews_staff on therapist_management_reviews
  for all to authenticated
  using (
    _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  )
  with check (
    (
      _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
      or _is_manager_here(outlet_id)
    )
    and employee_id in (select e.id from employees e where e.outlet_id = therapist_management_reviews.outlet_id)
  );

-- Rollback kalau perlu: jalankan ulang blok policy dari 0038.
