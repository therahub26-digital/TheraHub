-- ---------------------------------------------------------------------
-- 0024_leave_request_type.sql
--
-- STATUS: SUDAH DITERAPKAN. Header ini sempat tertinggal menulis "DRAFT"
-- berhari-hari setelah migrasinya benar-benar jalan — diperbaiki
-- 2026-08-26 setelah verifikasi read-only ke production:
--   select table_name, column_name from information_schema.columns
--    where table_schema='public' and (table_name, column_name)
--          in (('employee_leave_requests','type'), ...);
-- Kolom `type` terkonfirmasi ada. Fiturnya sendiri sudah diuji end-to-end
-- 2026-08-25 malam (terapis mengajukan "Libur" 28 Agustus → kasir
-- menyetujui di /kasir/schedule-check → badge "Libur" yang benar).
--
-- Latar belakang
-- --------------
-- User (2026-08-25): form "Ajukan Cuti / Libur" di portal terapis
-- sendiri (TherapistLeaveRequestForm.tsx) cuma punya field Tanggal +
-- Alasan — tidak ada pilihan JENIS (Cuti/Sakit vs Libur), padahal form
-- yang setara di sisi manager/kasir ("Rencana Libur/Cuti ke Depan",
-- LeavePlanBoard.tsx) sudah punya dropdown Jenis itu sejak awal.
--
-- Tabel employee_leave_requests (0022) belum punya kolom untuk ini —
-- approveLeaveRequest() di lib/actions/leaveRequests.ts selama ini
-- HARDCODE type:"LEAVE" saat menulis baris employee_schedule_exceptions
-- setelah pengajuan disetujui, jadi terapis yang sebenarnya minta
-- "Libur" (bukan sakit/cuti) akan tetap tercatat sebagai LEAVE begitu
-- disetujui. Kolom ini memperbaiki itu: terapis memilih jenisnya sendiri
-- saat mengajukan, dan approveLeaveRequest() memakai nilai itu apa
-- adanya alih-alih hardcode.
--
-- Kenapa default 'LEAVE': supaya baris lama (sebelum kolom ini ada)
-- tetap konsisten dengan perilaku hardcode sebelumnya, tidak diam-diam
-- berubah jadi 'OFF'.
-- ---------------------------------------------------------------------

alter table employee_leave_requests
  add column if not exists type text not null default 'LEAVE' check (type in ('OFF', 'LEAVE'));

-- Rollback kalau perlu:
--   alter table employee_leave_requests drop column if exists type;
