-- STATUS: DRAFT — BELUM DITERAPKAN
--
-- Adjie (2026-08-25), item 3/3 dari permintaan 3-item: "master inisial:
-- dibuatkan opsi saja mana yg akan di aktifkan, kalau di amet baru 1
-- layanan, sisanya optional dan bisa diedit, tambahkan atau dihapus."
-- Dijawab lewat pertanyaan pilihan ganda: Master Initial dijadikan
-- "editor master tenant sungguhan" (bukan cuma tampilan contoh) —
-- "ini nanti untuk aplikasi tenant yg lain, tapi harus sesuai dengan
-- yang sudah terbangun juga".
--
-- `service_types` (dicek lewat information_schema.columns read-only ke
-- production) sebelumnya TIDAK punya kolom untuk menandai jenis layanan
-- mana yang sedang aktif dipakai tenant vs. cuma tersedia sebagai opsi
-- master yang belum dipakai. Amethyst saat ini cuma punya 1 layanan
-- sungguhan (Traditional Massage / Basic Shiatsu + Therapy PM) — jenis
-- layanan lain yang ditambahkan lewat Master Initial harus bisa dibuat
-- "belum aktif" dulu tanpa langsung bisa dipilih di Manager > Catalog
-- saat membuat paket baru (lihat lib/actions/masterCatalog.ts dan
-- perubahan filter di app/manager/catalog/page.tsx).
--
-- default true supaya baris yang sudah ada (jenis layanan yang memang
-- sudah dipakai untuk paket sungguhan) tidak berubah perilaku begitu
-- migrasi ini jalan.
--
-- Tidak ada perubahan RLS di migrasi ini — service_types_write (migrasi
-- 0002) sudah "for all" (mencakup UPDATE kolom baru ini) untuk
-- admin/owner tenant sendiri, jadi kolom baru otomatis ikut tercakup.

alter table service_types add column if not exists active boolean not null default true;

-- Verifikasi setelah dijalankan (read-only):
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'service_types' and column_name = 'active';
-- Harus mengembalikan 1 baris: active | boolean | NO | true

-- Rollback (kalau perlu dibatalkan):
--   alter table service_types drop column if exists active;
