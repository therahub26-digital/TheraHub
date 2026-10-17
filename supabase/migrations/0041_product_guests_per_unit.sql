-- =====================================================================
-- 0041 — Takaran bahan per unit (perkiraan "1 botol ≈ N tamu")
-- STATUS: BELUM DITERAPKAN. Jalankan sekali di SQL Editor project SG.
-- Idempoten: aman dijalankan ulang.
--
-- LATAR (keputusan Adjie 17 Okt 2026):
-- Pemakaian bahan treatment (lotion, minyak, dll.) TIDAK pasti per tamu,
-- jadi tidak memakai resep tetap per layanan. Yang dicatat:
--   1. Takaran perkiraan per unit stok: 1 botol ≈ N tamu  (kolom ini).
--   2. Pemakaian sebenarnya = unit yang DIKELUARKAN dari gudang ke ruang
--      treatment (stock_movements type TREATMENT_USAGE, ditulis aksi
--      "Keluarkan ke Ruang Treatment" di /manager/inventory).
-- Laporan Bulanan membandingkan unit terpakai dengan perkiraan dari
-- jumlah tamu (kunjungan ÷ N) -> wajar / boros.
--
-- KEBIJAKAN HARGA: tidak perlu kolom baru. products.sell_price yang
-- sudah ada menjadi kebijakan tiap spa (tenant):
--   sell_price kosong  -> bahan tidak ditagihkan ke tamu (masuk biaya)
--   sell_price terisi  -> bahan bisa dijual di kasir sebagai item produk
-- =====================================================================

alter table public.products
  add column if not exists guests_per_unit numeric(10, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_guests_per_unit_positive'
  ) then
    alter table public.products
      add constraint products_guests_per_unit_positive
      check (guests_per_unit is null or guests_per_unit > 0);
  end if;
end $$;

comment on column public.products.guests_per_unit is
  'Perkiraan jumlah tamu yang dilayani per 1 unit stok (mis. 1 botol lotion ≈ 25 tamu). NULL = tidak diperkirakan.';

-- Cek hasil:
-- select name, category, uom, guests_per_unit from products order by category, name;
