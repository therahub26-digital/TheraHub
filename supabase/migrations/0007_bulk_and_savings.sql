-- =====================================================================
-- 0007 — potongan massal + tabungan yang benar-benar tercatat
--
-- Dua kebutuhan nyata dari Amethyst (chat, 2026-08-21):
--
--   1. "pemotongan untuk seluruh terapis bulan ini atau beberapa bulan
--      ke depan, dengan nilai sekian" — mis. seragam baru yang berlaku
--      untuk semua orang.
--
--   2. "untuk tabungan, nilai totalnya seharusnya ada di management dan
--      di terapis; kalau pencairan juga akan muncul di payroll" — biasa
--      dicairkan menjelang Lebaran.
--
-- Keduanya TIDAK diselesaikan dengan tabel baru berisi "aturan" yang
-- dievaluasi ulang tiap kali payslip dibaca. Potongan tetap disimpan
-- sebagai baris per orang per periode (payroll_adjustments, 0006),
-- karena baris yang sudah terbit harus membeku: kalau nominalnya ikut
-- berubah saat aturannya diedit, slip bulan lalu ikut berubah, dan gaji
-- yang sudah dibayarkan jadi tidak cocok dengan catatannya. Aksi massal
-- di sini hanya alat input — ia MENERBITKAN baris-baris itu sekaligus.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. batch_id — supaya satu aksi massal bisa dibatalkan sebagai satu unit
--
-- Tanpa ini, "seragam baru, 12 orang, 3 bulan ke depan" = 36 baris yang
-- kalau salah nominal harus dihapus satu per satu. Itu bukan sekadar
-- merepotkan: potongan yang gagal dihapus adalah uang yang tetap diambil
-- dari orang yang tidak lagi berutang. Batch id membuat pembatalannya
-- satu tindakan, dan membuat baris-baris yang lahir bersama tetap bisa
-- dikenali sebagai satu keputusan.
--
-- Nullable: baris yang diinput manual satu-satu (jalur 0006) tidak punya
-- batch, dan itu wajar — bukan data yang hilang.
-- ---------------------------------------------------------------------
alter table payroll_adjustments
  add column if not exists batch_id uuid;

comment on column payroll_adjustments.batch_id is
  'Menandai baris yang dibuat oleh satu aksi massal. NULL untuk baris yang diinput satu per satu.';

create index if not exists payroll_adjustments_batch_idx
  on payroll_adjustments (batch_id)
  where batch_id is not null;


-- ---------------------------------------------------------------------
-- 2. tabungan: periode, sumber, dan kunci idempotensi
--
-- savings_entries sudah ada sejak 0001, tapi belum pernah diisi data
-- nyata — halaman payslip masih membaca savingsOf() dari mock. Begitu
-- payroll mulai menuliskan setoran betulan, ada satu bahaya yang harus
-- ditutup lebih dulu:
--
--   runPayroll() sengaja IDEMPOTEN (upsert on employee_id,period) karena
--   alasan paling umum menjalankannya ulang adalah ada transaksi susulan.
--   Kalau setiap run menyisipkan baris tabungan baru, menjalankan ulang
--   periode yang sama akan MENGGANDAKAN setoran seseorang. Saldo tabungan
--   adalah uang yang nyata-nyata dipegang perusahaan atas nama karyawan;
--   menggandakannya karena tombol ditekan dua kali tidak bisa diterima.
--
-- Maka: setoran dari payroll diberi `ref` yang deterministik
-- ('payroll:2026-08') dan unik per karyawan, sehingga run kedua MEMPERBAIKI
-- baris yang sama, bukan menambah baris baru.
-- ---------------------------------------------------------------------
alter table savings_entries
  add column if not exists period text,
  add column if not exists outlet_id uuid references outlets(id) on delete cascade,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references app_users(id) on delete set null;

comment on column savings_entries.period is
  'Periode payroll yang melahirkan baris ini (YYYY-MM). NULL untuk baris yang dicatat di luar siklus payroll.';
comment on column savings_entries.ref is
  'Kunci idempotensi. Setoran dari payroll memakai ''payroll:<periode>'' supaya run ulang memperbarui, bukan menggandakan.';

-- Unik per (karyawan, ref) hanya untuk baris yang PUNYA ref. Baris
-- manual tanpa ref tetap boleh berulang — dua penarikan tunai di bulan
-- yang sama adalah kejadian yang sah, bukan duplikat.
create unique index if not exists savings_entries_ref_idx
  on savings_entries (employee_id, ref)
  where ref is not null;

create index if not exists savings_entries_employee_idx
  on savings_entries (employee_id, date);


-- ---------------------------------------------------------------------
-- 3. RLS untuk kolom baru — tidak ada yang berubah
--
-- savings_entries_self_read dan savings_entries_manage (0002) sudah
-- memakai employee_id, jadi kolom tambahan otomatis ikut terlindungi:
-- karyawan membaca barisnya sendiri, manager outlet dan admin/owner yang
-- boleh menulis. Sengaja dicatat di sini supaya jelas ini sudah
-- dipertimbangkan, bukan terlewat.
-- ---------------------------------------------------------------------
