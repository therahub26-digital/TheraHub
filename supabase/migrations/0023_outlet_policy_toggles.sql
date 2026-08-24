-- ---------------------------------------------------------------------
-- 0023_outlet_policy_toggles.sql
--
-- STATUS: Live — diterapkan 2026-08-24 lewat Supabase SQL Editor (setelah
-- revisi ALTER TYPE, lihat catatan revisi di bawah). Kolom tax_enabled,
-- service_charge_enabled, dan nilai enum late_policy='NONE' sudah ada di DB.
--
-- Latar belakang
-- --------------
-- User feedback 2026-08-24 (screenshot /manager/settings): "untuk
-- kebijakan pajak, service charge dan kebijakan keterlambatan, sifatnya
-- optional bisa on/off tergantung masing2 outlet". Sebelum ini, ketiga
-- field itu (tax_pct, service_charge_pct, late_policy) selalu aktif —
-- outlet yang tidak memungut pajak/service charge sama sekali terpaksa
-- diisi 0%, dan tidak ada cara mematikan kebijakan keterlambatan.
--
-- PENTING — urutan deploy: kode yang membaca kolom tax_enabled /
-- service_charge_enabled (lib/actions/transactions.ts, checkout kasir)
-- ikut dalam commit yang sama dengan migrasi ini. Migrasi ini HARUS
-- dijalankan sebelum (atau sesaat setelah, sebelum ada transaksi POS
-- baru dicoba) kode itu berjalan — kalau belum, query checkout akan
-- gagal karena kolomnya belum ada.
--
-- Revisi 2026-08-24 (percobaan pertama gagal di Supabase SQL Editor):
-- late_policy ternyata kolom bertipe ENUM Postgres (bukan text + CHECK
-- seperti dugaan awal) — error "invalid input value for enum
-- late_policy: NONE" saat mencoba ADD CONSTRAINT ... CHECK (late_policy
-- in (...)). Diperbaiki: nilai 'NONE' ditambahkan ke enum yang sudah ada
-- lewat ALTER TYPE ... ADD VALUE, nama tipe enum dicari otomatis dari
-- pg_attribute (bukan di-hardcode) karena baseline 0001 diterapkan lewat
-- dashboard dan nama tipe persisnya tidak diketahui dari file migrasi
-- mana pun di repo ini. Blok CHECK constraint versi lama dihapus total
-- — tidak relevan untuk kolom enum.
--
-- Yang diubah
-- -----------
-- 1. Dua kolom boolean baru, default true (outlet yang sudah ada tidak
--    berubah perilakunya — pajak & service charge tetap aktif seperti
--    sebelumnya sampai manager/admin sengaja mematikannya).
-- 2. Nilai 'NONE' (tidak ada kebijakan keterlambatan) ditambahkan ke
--    enum late_policy yang sudah ada.
--
-- Catatan teknis: ALTER TYPE ... ADD VALUE tidak boleh dipakai untuk
-- perbandingan/cast di transaksi yang sama tempat ia ditambahkan (batasan
-- Postgres). Migrasi ini hanya menambahkan nilainya, tidak langsung
-- memakainya, jadi aman dijalankan sebagai satu batch.
-- ---------------------------------------------------------------------

alter table outlets
  add column if not exists tax_enabled boolean not null default true,
  add column if not exists service_charge_enabled boolean not null default true;

do $$
declare
  enum_type text;
begin
  select a.atttypid::regtype::text
  into enum_type
  from pg_attribute a
  where a.attrelid = 'outlets'::regclass
    and a.attname = 'late_policy'
    and a.attnum > 0
    and not a.attisdropped;

  if enum_type is null then
    raise exception 'Kolom outlets.late_policy tidak ditemukan — cek nama kolom/tabel.';
  end if;

  execute format('alter type %s add value if not exists %L', enum_type, 'NONE');
end $$;

-- Rollback kalau perlu:
--   alter table outlets drop column if exists tax_enabled;
--   alter table outlets drop column if exists service_charge_enabled;
--   -- Nilai 'NONE' pada enum late_policy TIDAK BISA di-drop lagi begitu
--   -- ditambahkan (batasan Postgres) — kalau benar-benar perlu rollback
--   -- penuh, enum harus dibuat ulang dari nol (buat tipe baru tanpa
--   -- 'NONE', migrasikan kolom, drop tipe lama).
