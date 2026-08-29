-- =====================================================================
-- TheraHub — Pre-flight uji end-to-end Fase 16 & 17
-- Jalankan SELURUH file ini di Supabase SQL Editor, SEKALI jalan.
-- Hasilnya: 8 tabel hasil. Kirim balik semuanya (screenshot / copy).
--
-- Tujuan: menangkap yang bisa menggagalkan uji SEBELUM Anda
-- menghabiskan sejam mengklik. Tidak ada satu pun perintah yang
-- MENGUBAH data — semuanya SELECT.
-- =====================================================================


-- ---------------------------------------------------------------
-- [1] Migrasi 0008 — kolom fee referral di employees
--     Harus 3 baris: referred_by_employee_id, referral_fee_type,
--     referral_fee_value.
-- ---------------------------------------------------------------
select '1. kolom 0008 (employees)' as cek, column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'employees'
  and column_name in ('referred_by_employee_id','referral_fee_type','referral_fee_value')
order by column_name;


-- ---------------------------------------------------------------
-- [2] Migrasi 0009 — kolom promo + kolom `ref` idempotency (0008)
--     Harus 3 baris: promotions.discount_amount,
--     promotions.new_customers_only, payroll_adjustments.ref.
-- ---------------------------------------------------------------
select '2. kolom 0009 + ref' as cek, table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_name = 'promotions' and column_name in ('discount_amount','new_customers_only'))
   or (table_name = 'payroll_adjustments' and column_name = 'ref')
order by table_name, column_name;


-- ---------------------------------------------------------------
-- [3] RLS policy promotions — harus ada promotions_read,
--     promotions_write, DAN promotions_redeem (yang terakhir yang
--     mengizinkan kasir menaikkan usage_count saat redeem).
-- ---------------------------------------------------------------
select '3. policy promotions' as cek, policyname, cmd, roles
from pg_policies
where tablename = 'promotions'
order by policyname;


-- ---------------------------------------------------------------
-- [4] ⚠️ PALING PENTING — struktur extension_requests.
--
--     Kode `requestExtension()` hanya menulis 6 kolom:
--       session_id, extension_id, requested_at, status,
--       conflict_check, reason
--
--     Kalau tabel ini punya kolom LAIN yang NOT NULL tanpa default
--     (mis. booking_code / therapist_name / customer_name /
--     room_name, sisa denormalisasi dari lib/types.ts), maka
--     Langkah 3d akan GAGAL dengan error "null value in column ...".
--
--     Baca kolom is_nullable = 'NO' DAN column_default kosong yang
--     BUKAN salah satu dari 6 nama di atas → itu blocker.
-- ---------------------------------------------------------------
select '4. extension_requests' as cek, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'extension_requests'
order by ordinal_position;


-- ---------------------------------------------------------------
-- [5] Promo AJAKTEMAN30 — sudah ter-seed & nominalnya terisi?
--     discount_amount NULL = "belum diatur" → payForSession() akan
--     MENOLAK kodenya (itu perilaku yang benar, tapi berarti
--     Langkah 3g gagal). Harus 30000.
-- ---------------------------------------------------------------
select '5. promo' as cek, o.code as outlet, p.code, p.discount_amount,
       p.new_customers_only, p.status, p.valid_from, p.valid_to,
       p.usage_count, p.max_usage
from promotions p
join outlets o on o.id = p.outlet_id
where p.code ilike 'AJAKTEMAN30'
order by o.code;


-- ---------------------------------------------------------------
-- [6] Komisi katalog — angka real, bukan placeholder.
--     Paket harus fixed / 55000. Extension 30 menit harus
--     price 50000, commission_type fixed, commission 15000.
--     Kalau extension masih 0 → Langkah 3h tidak akan
--     memunculkan baris komisi extension sama sekali.
-- ---------------------------------------------------------------
select '6a. paket' as cek, o.code as outlet, sp.name, sp.duration_min, sp.price,
       sp.commission_type, sp.commission_value
from service_packages sp
join outlets o on o.id = sp.outlet_id
order by o.code, sp.name;

select '6b. extension' as cek, o.code as outlet, e.name, e.duration_min, e.price,
       e.commission_type, e.commission
from extension_options e
join outlets o on o.id = e.outlet_id
order by o.code, e.duration_min;


-- ---------------------------------------------------------------
-- [7] Pajak & service charge outlet — dipakai memprediksi angka
--     yang harus keluar di Langkah 3g. Harusnya 10% dan 5%.
-- ---------------------------------------------------------------
select '7. outlet' as cek, code, name, service_charge_pct, tax_pct, receipt_prefix
from outlets
order by code;


-- ---------------------------------------------------------------
-- [8] Akun login uji — terapis mana yang dipakai akun
--     terapis@amethyst.test, dan apakah 6 akun staf ada.
--     Catat nama terapisnya: itu yang dipakai di Langkah 3a.
-- ---------------------------------------------------------------
select '8. akun' as cek, au.email, au.role, e.name as employee, e.code as employee_code,
       o.code as outlet, e.status
from app_users au
left join employees e on e.id = au.employee_id
left join outlets o on o.id = au.outlet_id
order by au.role, au.email;


-- ---------------------------------------------------------------
-- [9] Zahra & Lusi — ada, ACTIVE, di outlet yang sama, dan
--     relasi referralnya belum/sudah diatur (Langkah 2).
-- ---------------------------------------------------------------
select '9. zahra/lusi' as cek, e.code, e.name, e.status, o.code as outlet,
       e.referred_by_employee_id, r.name as perekrut,
       e.referral_fee_type, e.referral_fee_value
from employees e
join outlets o on o.id = e.outlet_id
left join employees r on r.id = e.referred_by_employee_id
where e.name ilike any (array['%zahra%','%lusi%'])
order by e.name;
