-- ---------------------------------------------------------------------
-- 0037_leave_request_auto_record.sql
--
-- STATUS: DRAFT — belum dijalankan ke produksi.
-- Jalankan SETELAH 0036 (butuh jenis 'LATE' di CHECK), dan SEBELUM
-- deploy kode gelombang ini — tanpa trigger ini kode tetap aman
-- (pengajuan sekadar tinggal PENDING dan alur ACC lama masih bekerja),
-- tapi perilaku "tercatat otomatis" yang diminta belum terjadi.
--
-- Latar belakang (Adjie, 2026-10-15, revisi atas alur ACC):
--   "tidak usah minta ijin, hanya pemberitahuan dan tercatat saja,
--    takutnya si manager terlewatkan. kecuali kalau sakit berarti
--    otomatis tidak bekerja hari itu"
--
-- Artinya: keterangan terapis TIDAK lagi menunggu persetujuan
-- manager/kasir. Begitu terkirim ia langsung tercatat (supaya tidak ada
-- yang menggantung di antrean yang bisa terlewat), dan manager cukup
-- MELIHATNYA — di kartu "Absensi Menjelang Jam Masuk" dan daftar
-- keterangan di Cek Jadwal Terapis. Konsekuensi per jenis:
--   - LEAVE (Cuti/Sakit) dan OFF (Libur) = tidak bekerja hari itu →
--     exception jadwal ditulis OTOMATIS saat pengajuan masuk (terapis
--     langsung tak bisa dibooking, sama seperti efek ACC dulu).
--   - LATE (Ijin Masuk Siang) = tetap bekerja → hanya tercatat; tidak
--     pernah menulis exception.
--
-- KENAPA TRIGGER, bukan di kode aplikasi: RLS memang dirancang supaya
-- terapis TIDAK bisa menulis employee_schedule_exceptions (policy
-- schedule_exceptions_write: staf outlet saja) dan TIDAK bisa meng-
-- insert pengajuan berstatus selain PENDING (policy
-- employee_leave_requests_therapist_insert). Kedua pagar itu sengaja
-- TIDAK dilonggarkan — pengajuan tetap masuk sebagai PENDING lewat
-- jalur RLS biasa, lalu trigger AFTER INSERT ber-SECURITY DEFINER di
-- bawah yang menaikkannya: set APPROVED + tulis exception. Satu titik
-- eskalasi yang bisa dibaca dalam satu layar (pola yang sama dengan
-- §6.8 handover), bukan pelonggaran policy.
--
-- Catatan frame waktu (§6.1): decided_at di-set = requested_at (nilai
-- wall-clock yang ditulis aplikasi), BUKAN now() — now() Postgres adalah
-- UTC asli dan akan meleset 7 jam dari seluruh kolom bisnis lain.
--
-- Alur ACC lama (approve/reject) tetap ada di kode untuk baris PENDING
-- warisan sebelum migrasi ini; baris baru tidak akan pernah PENDING.
--
-- Verifikasi setelah dijalankan:
--   select tgname from pg_trigger
--    where tgrelid = 'employee_leave_requests'::regclass
--      and tgname = 'leave_request_auto_record';
-- ---------------------------------------------------------------------

create or replace function _auto_record_leave_request() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Naikkan pengajuan yang baru masuk jadi tercatat. decided_by NULL =
  -- tidak ada orang yang memutuskan; decision_note yang menjelaskannya.
  update employee_leave_requests
     set status = 'APPROVED',
         decided_at = new.requested_at,
         decision_note = 'Tercatat otomatis — pemberitahuan, tanpa persetujuan'
   where id = new.id
     and status = 'PENDING';

  -- Cuti/Sakit & Libur = tidak bekerja hari itu → exception jadwal,
  -- persis baris yang dulu ditulis approveLeaveRequest(). LATE tidak.
  if new.type in ('OFF', 'LEAVE') then
    insert into employee_schedule_exceptions (employee_id, outlet_id, date, type, note)
    values (
      new.employee_id,
      new.outlet_id,
      new.date,
      new.type,
      coalesce(new.note, case when new.type = 'OFF' then 'Libur — tercatat otomatis' else 'Cuti/Sakit — tercatat otomatis' end)
    )
    on conflict (employee_id, date)
    do update set type = excluded.type, note = excluded.note;
  end if;

  return null; -- AFTER trigger
end;
$$;

drop trigger if exists leave_request_auto_record on employee_leave_requests;
create trigger leave_request_auto_record
  after insert on employee_leave_requests
  for each row execute function _auto_record_leave_request();

-- Rollback kalau perlu (mengembalikan alur ACC manual):
--   drop trigger if exists leave_request_auto_record on employee_leave_requests;
--   drop function if exists _auto_record_leave_request();
