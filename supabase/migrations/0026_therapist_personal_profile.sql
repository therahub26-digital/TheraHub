-- ---------------------------------------------------------------------
-- 0026_therapist_personal_profile.sql
--
-- STATUS: DRAFT — BELUM DITERAPKAN. Jalankan manual lewat Supabase SQL
-- Editor, lalu update header ini jadi "SUDAH DITERAPKAN" setelah
-- diverifikasi (pola yang sama seperti 0022/0023/0024/0025).
--
-- Latar belakang
-- --------------
-- User (2026-08-25): "buatkan profil terapis berisi foto profil dan data
-- pribadi terapis seperti nama, alamat, ktp, tempat tgl lahir, no
-- rekening, untuk kepentingan manager. manager bisa cek profil masing2
-- therapist" — lalu ditambah kontak darurat + no HP, lalu dikoreksi
-- eksplisit soal akses: "halaman 'Profil Terapis' baru, terapis juga
-- harus bisa edit" (bukan cuma Manager yang bisa edit).
--
-- Model akses final:
--   - Manager (outlet sendiri): lihat + edit semua terapis di outletnya.
--   - Admin/Owner (tenant): lihat semua, TIDAK BISA edit data pribadi ini.
--   - Terapis sendiri: lihat + edit profilnya sendiri saja.
--
-- Dicek dulu lewat information_schema.columns (2026-08-25) sebelum
-- menulis migrasi ini: tabel `employees` sudah punya nama, phone, email,
-- photo_url — tapi TIDAK ADA kolom address/NIK/tempat-tanggal
-- lahir/rekening bank/kontak darurat sama sekali. 29 kolom yang ada
-- dicek satu per satu lewat query string_agg, bukan diasumsikan.
--
-- Kenapa TABEL BARU (employee_personal_data), bukan kolom baru langsung
-- di `employees`
-- --------------------------------------------------------------------
-- RLS `employees_read` (0002) itu SELECT tenant-wide: siapa pun staff
-- yang login (kasir, terapis lain, dsb) bisa membaca SEMUA baris
-- employees di tenant-nya — termasuk kolom base_salary yang sudah ada
-- sekarang. Itu sudah jadi model kepercayaan yang dipakai sejak awal,
-- tapi menambah NIK/KTP dan nomor rekening di tabel yang sama akan
-- mewarisi kebocoran yang sama persis, hanya kali ini untuk data yang
-- jelas lebih sensitif secara hukum (NIK) dan finansial (rekening
-- bank). Tabel terpisah dengan RLS SELECT sendiri (bukan tenant-wide)
-- mencegah itu tanpa harus merombak RLS employees yang sudah dipakai
-- banyak fitur lain.
--
-- Kenapa TRIGGER di `employees` untuk photo_url
-- ----------------------------------------------
-- photo_url tetap kolom lama di `employees` (dipakai roster, booking,
-- galeri) — tidak dipindah. Supaya terapis bisa ganti foto profil
-- sendiri (bagian dari "Profil Terapis" ini), perlu jalur UPDATE baru
-- untuk baris miliknya sendiri. RLS `employees_write` (0002) yang lama
-- TIDAK punya klausa "baris sendiri" sama sekali — hanya admin/owner
-- tenant-wide atau manager outletnya. Policy self-write baru di bawah
-- membuka UPDATE untuk baris sendiri, TAPI RLS Postgres tidak bisa
-- membatasi per-kolom (row-level, bukan column-level) — kalau dibiarkan
-- begitu saja, terapis yang cukup paham bisa memanggil supabase client
-- langsung dari browser dan mengubah base_salary/status miliknya
-- sendiri, bukan cuma photo_url. Trigger _guard_employee_self_update()
-- di bawah menutup celah itu: siapa pun yang TIDAK lolos sebagai
-- admin/owner/manager (yaitu hanya lolos lewat policy self-write ini)
-- WAJIB hanya mengubah photo_url — kolom lain harus identik dengan nilai
-- lama, atau UPDATE ditolak.
--
-- Verifikasi setelah dijalankan
-- ------------------------------
-- select column_name from information_schema.columns
--   where table_name = 'employee_personal_data' order by ordinal_position;
-- select policyname, cmd from pg_policies where tablename = 'employee_personal_data';
-- select tgname from pg_trigger where tgrelid = 'employees'::regclass and not tgisinternal;
--
-- Rollback
-- --------
-- drop trigger if exists employees_self_update_guard on employees;
-- drop function if exists _guard_employee_self_update();
-- drop policy if exists employees_self_photo_write on employees;
-- drop table if exists employee_personal_data;
-- ---------------------------------------------------------------------

create table if not exists employee_personal_data (
  employee_id uuid primary key references employees(id) on delete cascade,
  address text,
  nik text,
  birth_place text,
  birth_date date,
  bank_name text,
  bank_account_number text,
  bank_account_holder text,
  emergency_contact_name text,
  emergency_contact_phone text,
  updated_at timestamptz not null default now()
);

alter table employee_personal_data enable row level security;

-- Lihat: Admin/Owner tenant-wide, Manager outlet sendiri, atau si terapis sendiri.
create policy employee_personal_data_read on employee_personal_data
  for select to authenticated using (
    employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id())
    or employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
    or employee_id = _current_employee_id()
  );

-- Edit: Manager outlet sendiri, atau si terapis sendiri. Admin/Owner
-- SENGAJA tidak diberi akses tulis di sini — sesuai keputusan user
-- ("Admin/Owner bisa lihat, tidak bisa edit").
create policy employee_personal_data_write on employee_personal_data
  for all to authenticated
  using (
    employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
    or employee_id = _current_employee_id()
  )
  with check (
    employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
    or employee_id = _current_employee_id()
  );

-- Izinkan terapis mengganti foto profil sendiri (photo_url masih di
-- tabel employees yang lama — lihat catatan trigger di atas).
create policy employees_self_photo_write on employees
  for update to authenticated
  using (id = _current_employee_id())
  with check (id = _current_employee_id());

create or replace function _guard_employee_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Admin/owner tenant-wide dan manager outlet sendiri tetap boleh
  -- mengubah kolom apa pun (perilaku lama, tidak berubah).
  if _is_admin_or_owner() or _is_manager_here(old.outlet_id) then
    return new;
  end if;

  -- Sampai di sini berarti baris ini hanya lolos lewat
  -- employees_self_photo_write di atas — terapis mengedit barisnya
  -- sendiri. Batasi HANYA photo_url yang boleh berubah.
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.outlet_id is distinct from old.outlet_id
     or new.code is distinct from old.code
     or new.name is distinct from old.name
     or new.job_role is distinct from old.job_role
     or new.grade is distinct from old.grade
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.join_date is distinct from old.join_date
     or new.status is distinct from old.status
     or new.contract_type is distinct from old.contract_type
     or new.base_salary is distinct from old.base_salary
     or new.fixed_allowance is distinct from old.fixed_allowance
     or new.avatar_tone is distinct from old.avatar_tone
     or new.is_therapist is distinct from old.is_therapist
     or new.skills is distinct from old.skills
     or new.therapist_grade is distinct from old.therapist_grade
     or new.max_sessions_per_day is distinct from old.max_sessions_per_day
     or new.presence is distinct from old.presence
     or new.featured is distinct from old.featured
     or new.featured_badge is distinct from old.featured_badge
     or new.bio is distinct from old.bio
     or new.referred_by_employee_id is distinct from old.referred_by_employee_id
     or new.referral_fee_type is distinct from old.referral_fee_type
     or new.referral_fee_value is distinct from old.referral_fee_value
     or new.gallery_urls is distinct from old.gallery_urls
  then
    raise exception 'Terapis hanya boleh mengubah foto profil sendiri di halaman ini.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_self_update_guard on employees;
create trigger employees_self_update_guard
  before update on employees
  for each row execute function _guard_employee_self_update();
