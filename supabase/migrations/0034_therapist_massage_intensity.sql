-- =====================================================================
-- 0034 — Tingkat pijatan terapis (SUDAH DITERAPKAN — dijalankan Adjie
-- via SQL Editor 2026-09-04, "Success. No rows returned")
--
-- Untuk landing page publik per tenant (2026-09-04, permintaan Adjie:
-- website tenant menampilkan galeri terapis dengan badge Strong /
-- Medium / Medium Strong, "bisa diedit oleh admin").
--
-- NULLABLE dan TANPA default — "belum diatur ≠ nol" (konvensi §13.6):
-- terapis yang tingkat pijatannya belum diputuskan admin tidak boleh
-- diam-diam tampil sebagai "Medium". Landing hanya menampilkan badge
-- kalau kolom ini terisi.
--
-- CHECK constraint membatasi ke tiga nilai yang dipakai UI, supaya teks
-- bebas ("kuat", "strong ", "MEDIUM-STRONG") tidak pernah masuk dan
-- badge di landing tidak pernah menampilkan nilai tak dikenal.
-- =====================================================================

alter table public.employees
  add column if not exists massage_intensity text
  check (massage_intensity in ('STRONG', 'MEDIUM', 'MEDIUM_STRONG'));

comment on column public.employees.massage_intensity is
  'Tingkat pijatan untuk landing publik (STRONG/MEDIUM/MEDIUM_STRONG). NULL = belum diatur admin — jangan ditampilkan, jangan dianggap Medium.';
