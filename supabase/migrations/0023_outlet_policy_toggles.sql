-- ---------------------------------------------------------------------
-- 0023_outlet_policy_toggles.sql
--
-- STATUS: DRAFT — BELUM DITERAPKAN. Jalankan lewat Supabase SQL Editor,
-- lalu perbarui baris migrasi ini di supabase/migrations/README.md
-- (status + catatan) di commit yang sama, sesuai aturan file itu.
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
-- Yang diubah
-- -----------
-- 1. Dua kolom boolean baru, default true (outlet yang sudah ada tidak
--    berubah perilakunya — pajak & service charge tetap aktif seperti
--    sebelumnya sampai manager/admin sengaja mematikannya).
-- 2. late_policy diberi nilai tambahan 'NONE' (tidak ada kebijakan
--    keterlambatan). Constraint CHECK lama pada late_policy dicari
--    dinamis lewat pg_constraint (bukan di-drop by name) karena baseline
--    0001 diterapkan lewat dashboard, jadi nama constraint persisnya
--    tidak diketahui dari file migrasi mana pun di repo ini.
-- ---------------------------------------------------------------------

alter table outlets
  add column if not exists tax_enabled boolean not null default true,
  add column if not exists service_charge_enabled boolean not null default true;

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'outlets'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%late_policy%'
  loop
    execute format('alter table outlets drop constraint %I', c.conname);
  end loop;
end $$;

alter table outlets
  add constraint outlets_late_policy_check
  check (late_policy in ('FULL_DURATION', 'FIXED_SLOT', 'GRACE_PERIOD', 'NONE'));

-- Rollback kalau perlu:
--   alter table outlets drop constraint if exists outlets_late_policy_check;
--   alter table outlets drop column if exists tax_enabled;
--   alter table outlets drop column if exists service_charge_enabled;
--   -- (constraint lama tanpa 'NONE' tidak dipulihkan otomatis — tulis ulang
--   --  manual kalau benar-benar perlu rollback penuh)
