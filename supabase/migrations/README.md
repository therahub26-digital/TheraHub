# Status migrasi TheraHub

Dokumen ini ada karena masalah nyata: beberapa header migrasi tetap menulis
`DRAFT — BELUM DITERAPKAN` berbulan-bulan setelah migrasinya benar-benar
dijalankan, dan komentar basi itu menyesatkan orang (dan sesi Claude)
berikutnya yang membaca kode. Satu tempat untuk status, di sebelah file-nya.

**Aturan**: setiap kali sebuah migrasi dijalankan ke produksi, perbarui baris
di tabel ini **dan** header file `.sql`-nya di commit yang sama.

> ⚠️ **Aturan di atas berhenti diikuti antara 0024 dan 0031** (2026-08-25).
> Tabel ini tidak pernah diperbarui setelah 0023, dan lima header file
> (`0024`, `0025`, `0026`, `0029`, `0030`) masih menulis "DRAFT — BELUM
> DITERAPKAN" padahal fiturnya sudah live di produksi. Diperbaiki 2026-08-26
> setelah audit dokumentasi. **Justru inilah masalah yang membuat file ini
> dibuat** — jangan biarkan terulang: satu commit, dua tempat, setiap kali.

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
| 0023 | `0023_outlet_policy_toggles.sql` | **Live (2026-08-24)** | Toggle on/off pajak & service charge per outlet + `late_policy = 'NONE'` (nilai enum ditambah via `ALTER TYPE ... ADD VALUE`, revisi setelah percobaan pertama gagal karena late_policy adalah enum, bukan text+CHECK). Dikonfirmasi jalan di Supabase SQL Editor |
| 0024 | `0024_leave_request_type.sql` | **Live (2026-08-25)** | `employee_leave_requests.type` (`OFF`/`LEAVE`). Diuji end-to-end: terapis ajukan "Libur" → kasir setujui → badge benar. Kolom dikonfirmasi ulang 2026-08-26 |
| 0025 | `0025_tenant_business_profile.sql` | **Live (2026-08-25)** | Kolom identitas/kontak/footer/logo/background di `tenants`, policy `tenants_write_admin` (sebelumnya `tenants` tidak punya policy UPDATE sama sekali), bucket `tenant-branding`. Kolom dikonfirmasi ulang 2026-08-26 |
| 0026 | `0026_therapist_personal_profile.sql` | **Live (2026-08-25)** | Tabel `employee_personal_data` + policy `employees_self_photo_write` + trigger `_guard_employee_self_update()`. Dibuktikan lewat uji end-to-end: data pribadi tersimpan & kembali setelah reload |
| 0027 | `0027_therapist_self_photo_upload.sql` | **Live (2026-08-25)** | Klausa self-upload di `therapist_photos_insert`. Diverifikasi langsung lewat `pg_policy`/`pg_get_expr()` — sempat dilaporkan "masih belum bisa" karena migrasinya memang belum di-*Run* |
| 0028 | `0028_outlet_photos_bucket.sql` | **Live (2026-08-25)** | Bucket `outlet-photos` + 4 policy. Dikonfirmasi lewat screenshot: foto ruko Cikawao terunggah & tampil di halaman publik |
| 0029 | `0029_outlet_profile_photo.sql` | **Live** — dikonfirmasi 2026-08-26 | `outlet_profiles.profile_photo_url`. **Satu-satunya migrasi yang statusnya sempat benar-benar tidak pasti** — header menulis "DRAFT" dan tidak ada catatan bahwa ia dijalankan. Kolomnya load-bearing (`lib/actions/outletProfile.ts` pakai select eksplisit), jadi ini dicek khusus lewat `information_schema.columns` |
| 0030 | `0030_service_type_active.sql` | **Live (2026-08-25)** | `service_types.active`. Master Initial live di produksi lewat `6db0be9`. Kolom dikonfirmasi ulang 2026-08-26 |
| 0031 | `0031_outlet_timezone.sql` | **Live (2026-08-25)** | `outlets.timezone` (`text not null default 'Asia/Jakarta'`). Aditif, **belum dipakai kode manapun** — prasyarat untuk timezone Tahap 3 |

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
