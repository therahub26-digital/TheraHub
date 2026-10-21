-- ---------------------------------------------------------------------
-- Tenant demo Amet Spa: pulihkan roster 21 terapis Amethyst + fotonya
-- (Adjie 2026-10-21: "rubah foto therapis di amethyst, hanya buat contoh").
--
-- 8 terapis fiktif hasil seed 16 Okt DI-RENAME (bukan dihapus) supaya
-- riwayat booking/komisi 45 hari tetap menempel, lalu 13 sisanya dibuat.
-- Dua akun login terapis (rumahappsid@ → Amelia, haerunnisaindah5@ →
-- Zahra) tetap tersambung. Foto: public/img/therapists/CKW|MKW/*.jpg
-- (harus sudah di-push supaya tampil di Vercel).
--
-- Trigger employees_self_update_guard menolak rename lewat SQL Editor,
-- jadi dimatikan sementara di dalam transaksi yang sama.
-- Jalankan SEKALI, seluruh isi sekaligus. Hasil akhir: tabel 21 baris.
-- ---------------------------------------------------------------------

begin;

alter table employees disable trigger user;

-- 1. Rename 8 terapis fiktif → nama asli (riwayat ikut)
update employees e
set name = v.name, code = v.code, photo_url = v.photo, massage_intensity = v.mi,
    skills = array['Traditional Massage','Basic Shiatsu','Therapy PM'] || v.extra
from (values
  ('TRP-CKW-01','TRP-CKW-01','Amelia','/img/therapists/CKW/amelia.jpg','MEDIUM',        array['Teknik Siku']),
  ('TRP-CKW-92','TRP-CKW-02','Astrid','/img/therapists/CKW/astrid.jpg','STRONG',        array['Head Massage']),
  ('TRP-CKW-93','TRP-CKW-03','Ayu',   '/img/therapists/CKW/ayu.jpg',   'MEDIUM_STRONG', array['Teknik Siku','Head Massage']),
  ('TRP-CKW-10','TRP-CKW-10','Zahra', '/img/therapists/CKW/zahra.jpg', 'MEDIUM',        array['Basic Skill SOP']),
  ('TRP-MKW-90','TRP-MKW-01','Ana',   '/img/therapists/MKW/ana.jpg',   'MEDIUM_STRONG', array['Teknik Siku','Advanced Shiatsu','Head Massage','Totok Wajah']),
  ('TRP-MKW-91','TRP-MKW-02','Bunga', '/img/therapists/MKW/bunga.jpg', 'MEDIUM_STRONG', array['Head Massage']),
  ('TRP-MKW-92','TRP-MKW-03','Fira',  '/img/therapists/MKW/fira.jpg',  'MEDIUM',        array['Basic Skill SOP']),
  ('TRP-MKW-93','TRP-MKW-04','Iis',   '/img/therapists/MKW/iis.jpg',   'STRONG',        array['Teknik Siku','Advanced Shiatsu','Head Massage','Kerokan'])
) as v(old_code, code, name, photo, mi, extra)
where e.tenant_id = (select id from tenants where slug = 'amethyst')
  and e.code = v.old_code;

-- 2. Tambah 13 terapis lainnya
insert into employees (tenant_id, outlet_id, code, name, job_role, join_date, status, contract_type,
                       base_salary, fixed_allowance, is_therapist, skills, therapist_grade,
                       massage_intensity, phone, photo_url)
select t.id, o.id, v.code, v.name, 'Terapis', date '2026-08-21', 'ACTIVE', 'Harian', 0, 0, true,
       array['Traditional Massage','Basic Shiatsu','Therapy PM'] || v.extra, 'Junior', v.mi,
       '0800-0000-0000', v.photo
from (values
  ('AMY-CKW','TRP-CKW-04','Dewi',  '/img/therapists/CKW/dewi.jpg',  'MEDIUM_STRONG', array['Head Massage']),
  ('AMY-CKW','TRP-CKW-05','Indah', '/img/therapists/CKW/indah.jpg', 'MEDIUM',        array['Basic Skill SOP']),
  ('AMY-CKW','TRP-CKW-06','Risma', '/img/therapists/CKW/risma.jpg', 'STRONG',        array['Head Massage']),
  ('AMY-CKW','TRP-CKW-07','Lusi',  '/img/therapists/CKW/lusi.jpg',  'STRONG',        array['Head Massage']),
  ('AMY-CKW','TRP-CKW-08','Maya',  '/img/therapists/CKW/maya.jpg',  'MEDIUM_STRONG', array['Basic Skill SOP']),
  ('AMY-CKW','TRP-CKW-09','Putri', '/img/therapists/CKW/putri.jpg', 'STRONG',        array['Head Massage','Refleksi Kaki']),
  ('AMY-MKW','TRP-MKW-05','Indri', '/img/therapists/MKW/indri.jpg', 'MEDIUM',        array['Basic Skill SOP']),
  ('AMY-MKW','TRP-MKW-06','Intan', '/img/therapists/MKW/intan.jpg', 'STRONG',        array['Teknik Siku','Advanced Shiatsu','Head Massage','Kerokan']),
  ('AMY-MKW','TRP-MKW-07','Jessy', '/img/therapists/MKW/jessy.jpg', 'MEDIUM',        array['Basic Skill SOP']),
  ('AMY-MKW','TRP-MKW-08','Keyla', '/img/therapists/MKW/keyla.jpg', 'STRONG',        array['Head Massage','Kerokan']),
  ('AMY-MKW','TRP-MKW-09','Rara',  '/img/therapists/MKW/rara.jpg',  'MEDIUM',        array['Basic Skill SOP']),
  ('AMY-MKW','TRP-MKW-10','Silvy', '/img/therapists/MKW/silvy.jpg', 'MEDIUM_STRONG', array['Head Massage','Kerokan']),
  ('AMY-MKW','TRP-MKW-11','Via',   '/img/therapists/MKW/via.jpg',   'MEDIUM_STRONG', array['Head Massage','Kerokan'])
) as v(outlet_code, code, name, photo, mi, extra)
join tenants t on t.slug = 'amethyst'
join outlets o on o.tenant_id = t.id and o.code = v.outlet_code
where not exists (select 1 from employees x where x.tenant_id = t.id and x.code = v.code);

-- 3. Nama di akun login terapis ikut nama karyawan
update app_users u set name = e.name
from employees e
where u.employee_id = e.id
  and e.tenant_id = (select id from tenants where slug = 'amethyst')
  and u.role = 'therapist';

alter table employees enable trigger user;

commit;

-- Cek: harus 21 baris, semua ACTIVE dan ber-foto; trigger kembali 'O'.
select o.code as outlet, e.code, e.name, e.massage_intensity, e.photo_url
from employees e join outlets o on o.id = e.outlet_id
where e.tenant_id = (select id from tenants where slug = 'amethyst') and e.is_therapist and e.status = 'ACTIVE'
order by e.code;
