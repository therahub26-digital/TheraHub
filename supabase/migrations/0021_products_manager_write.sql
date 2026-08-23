-- ---------------------------------------------------------------------
-- 0021_products_manager_write.sql
--
-- DRAFT — BELUM DIJALANKAN KE PRODUKSI. Menunggu persetujuan eksplisit.
--
-- Latar belakang
-- --------------
-- Permintaan user (2026-08-23): "buatkan penjualan produk makanan ringan
-- dan minuman", dengan keputusan lanjutan bahwa MANAGER OUTLET juga boleh
-- menambah/memberi harga produk (bukan hanya admin/owner).
--
-- Kondisi sekarang: satu-satunya policy tulis di `products` adalah
-- `products_write` (0002_rls_policies.sql) yang di-gate `_is_admin_or_owner()`
-- — super-admin, admin, owner. Manager yang menekan tombol "Produk Baru"
-- ditolak RLS dan hanya melihat "Gagal menyimpan produk." Itulah sebabnya
-- form NewProductForm selama ini sengaja tidak dipasang di halaman
-- /manager/inventory (lihat komentar di app/manager/inventory/page.tsx).
--
-- Yang diubah
-- -----------
-- Menambah DUA policy baru (INSERT dan UPDATE) untuk role `manager`,
-- dibatasi tenant-nya sendiri. Policy lama `products_write` TIDAK diubah
-- dan TIDAK dihapus — admin/owner tetap punya akses penuh seperti semula.
--
-- Catatan desain yang perlu disadari sebelum menyetujui:
--
-- 1. Tabel `products` bersifat TENANT-WIDE, bukan per-outlet (tidak ada
--    kolom outlet_id — stok per outlet ada di `product_stocks`). Artinya
--    manager Cikawao yang menambah "Air Mineral 600ml" membuat produk itu
--    ada juga di daftar produk Mekarwangi (dengan stok 0). Ini konsekuensi
--    bentuk tabelnya, bukan bug — tapi kalau yang diinginkan katalog
--    terpisah per outlet, itu perubahan skema yang jauh lebih besar dan
--    bukan migrasi ini.
--
-- 2. UPDATE diberikan karena harga jual perlu bisa dikoreksi manager.
--    Konsekuensinya manager juga bisa mengubah harga produk retail dan
--    consumable milik tenant, bukan cuma makanan/minuman. Kalau ini terlalu
--    luas, katakan — batasannya bisa dipersempit ke
--    `category in ('Food & Beverage','Retail Product')`.
--
-- 3. DELETE sengaja TIDAK diberikan. Produk yang sudah pernah terjual
--    punya jejak di `stock_movements` dan `transaction_items`; menghapusnya
--    merusak riwayat transaksi yang sudah dibayar. Untuk menonaktifkan
--    produk, kosongkan harga jualnya (produk tanpa sell_price tidak
--    ditawarkan di POS).
-- ---------------------------------------------------------------------

create policy products_manager_insert on products
  for insert to authenticated
  with check (
    tenant_id = _current_tenant_id()
    and _current_role() = 'manager'
  );

create policy products_manager_update on products
  for update to authenticated
  using (
    tenant_id = _current_tenant_id()
    and _current_role() = 'manager'
  )
  with check (
    tenant_id = _current_tenant_id()
    and _current_role() = 'manager'
  );

-- Rollback kalau perlu:
--   drop policy if exists products_manager_insert on products;
--   drop policy if exists products_manager_update on products;
