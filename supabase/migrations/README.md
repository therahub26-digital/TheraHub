# Status migrasi TheraHub

Dokumen ini ada karena masalah nyata: beberapa header migrasi tetap menulis
`DRAFT — BELUM DITERAPKAN` berbulan-bulan setelah migrasinya benar-benar
dijalankan, dan komentar basi itu menyesatkan orang (dan sesi Claude)
berikutnya yang membaca kode. Satu tempat untuk status, di sebelah file-nya.

**Aturan**: setiap kali sebuah migrasi dijalankan ke produksi, perbarui baris
di tabel ini **dan** header file `.sql`-nya di commit yang sama.

| # | File | Status | Catatan |
|---|---|---|---|
| 0001 | *(tidak ada file)* | **Live** | Baseline 39 tabel + 34 enum, diterapkan lewat dashboard sebelum repo memakai file migrasi — itu sebabnya tidak ada `0001_init.sql` di folder ini |
| 0002 | `0002_rls_policies.sql` | **Live** | RLS per role |
| 0003 | `0003_employee_photo.sql` | **Live** | |
| 0004 | `0004_commission_setup.sql` | **Live** | |
| 0005 | `0005_payroll_settings.sql` | **Live** | |
| 0006 | `0006_payroll_adjustments.sql` | **Live** | |
| 0007 | `0007_bulk_and_savings.sql` | **Live** | |
| 0008 | `0008_referral_fee.sql` | **Live** | |
| 0009 | `0009_referral_promo_and_extension_sale.sql` | **Live** | |
| 0010–0017 | `0010…0017_*.sql` | **Live** | Perbaikan RLS, room alerts, alarm sound, self-signup, gallery/booking window |
| 0018 | *(tidak ada file)* | — | Nomor tidak terpakai |
| 0019 | *(tidak ada file)* | **Live (lewat dashboard)** | INSERT policy `notifications` untuk staff. Tidak pernah tercatat sebagai file; notifikasi check-in memang sampai ke terapis di produksi. Lihat `lib/notify.ts` |
| 0020 | `0020_inventory_expenses.sql` | **Live** (2026-08-23) | Inventory & Expenses manager berjalan dengan data asli |
| 0021 | `0021_products_manager_write.sql` | **Live** (dikonfirmasi 2026-08-24) | `products_manager_insert` & `products_manager_update` ditemukan di `pg_policies` |
| 0022 | `0022_employee_leave_requests.sql` | **Live** (2026-08-23) | Dijalankan user sendiri, diverifikasi lewat `to_regclass` + `pg_policies` |
| 0023 | `0023_outlet_policy_toggles.sql` | **DRAFT — belum diterapkan** | Toggle on/off pajak & service charge per outlet + `late_policy = 'NONE'`. Kode checkout (`lib/actions/transactions.ts`) sudah bergantung pada kolom ini — jalankan sebelum mencoba transaksi POS baru |

## 0021 — dikonfirmasi live (2026-08-24)

Dicek lewat SQL Editor Supabase:

```sql
select policyname
  from pg_policies
 where tablename = 'products'
   and policyname ilike '%manager%';
```

Hasilnya dua baris (`products_manager_insert`, `products_manager_update`) —
migrasi sudah diterapkan ke produksi. Backlog 7.1 selesai.
