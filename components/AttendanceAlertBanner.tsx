"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// Banner alert absensi di portal terapis (PWA/"aplikasi android") —
// pasangan tampilan dari lib/attendanceAlert.ts. Muncul di Beranda dan
// di halaman Absensi saat jendela alert aktif (T−5 menit s/d seterusnya)
// dan belum ada check-in / keterangan.
//
// Bisa DIMATIKAN (tombol ✕) — permintaan eksplisit Adjie 2026-10-15:
// "setelah dimatikan peringatan bisa dimatikan". Dismissal disimpan di
// sessionStorage per-tanggal (bukan state server, sesuai §6.4 — alert
// ini tidak pernah punya baris database). sessionStorage dipilih di atas
// localStorage dengan sengaja: tutup-buka aplikasi menghidupkan lagi
// alert hari yang sama, jadi "dimatikan" berarti "sudah saya lihat,
// jangan ganggu sesi ini", bukan bisu permanen. Semua akses storage
// dibungkus try/catch — private mode / storage diblokir tidak boleh
// mematahkan render.
// ---------------------------------------------------------------------

export default function AttendanceAlertBanner({
  date,
  workStart,
  minutesLate,
  showAttendanceLink,
}: {
  /** Tanggal hari ini "YYYY-MM-DD" — kunci dismissal per hari. */
  date: string;
  workStart: string;
  /** null = jendela T−5 (belum lewat jam masuk); angka = sudah telat sekian menit. */
  minutesLate: number | null;
  /** false di halaman Absensi sendiri (tombol check-in sudah di layar yang sama). */
  showAttendanceLink: boolean;
}) {
  const storageKey = `attendance-alert-dismissed:${date}`;
  // Mulai tersembunyi sampai efek di bawah membaca sessionStorage —
  // menghindari kedip banner pada orang yang sudah menutupnya, dan
  // menghindari hydration mismatch (server tidak tahu isi storage).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
    } catch {
      // storage tidak tersedia — tampilkan saja, lebih baik alert dobel
      // daripada alert hilang.
    }
    setVisible(true);
  }, [storageKey]);

  if (!visible) return null;

  const late = minutesLate !== null;

  return (
    <div
      className="m-card"
      role="alert"
      style={{
        background: late ? "var(--danger-soft)" : "var(--warning-soft)",
        border: `1px solid ${late ? "var(--danger)" : "var(--warning)"}`,
        position: "relative",
      }}
    >
      <button
        aria-label="Tutup peringatan absensi"
        title="Tutup peringatan — muncul lagi saat aplikasi dibuka ulang"
        onClick={() => {
          try {
            sessionStorage.setItem(storageKey, "1");
          } catch {
            // gagal menyimpan = dismissal hanya berlaku sampai navigasi —
            // tetap ditutup untuk sesi render ini.
          }
          setVisible(false);
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 26,
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text-2)",
          cursor: "pointer",
        }}
      >
        <Icon name="x" size={13} />
      </button>

      <div className="row g2" style={{ marginBottom: 6, paddingRight: 30 }}>
        <Icon name="bell-ring" size={16} style={{ color: late ? "var(--danger)" : "var(--warning)" }} />
        <span className="small bold" style={{ color: "var(--text-1)" }}>
          {late ? `Lewat jam masuk ${workStart} — belum absen` : `${workStart} sebentar lagi — belum absen`}
        </span>
      </div>
      <div className="tiny dim" style={{ marginBottom: 10 }}>
        {late
          ? `Anda terhitung terlambat ${minutesLate} menit dan belum ada keterangan. Absen sekarang, atau kirim keterangan (sakit dadakan, keperluan, atau ijin masuk siang) — langsung tercatat dan terlihat manager.`
          : `Jam masuk outlet Anda ${workStart}. Absen sekarang, atau kirim keterangan bila berhalangan — keterangan langsung tercatat tanpa perlu persetujuan.`}
      </div>
      <div className="row g2 wrap">
        {showAttendanceLink && (
          <Link href="/therapist/attendance" className="m-btn m-btn-primary">
            <Icon name="map-pin-check" size={15} /> Absen Sekarang
          </Link>
        )}
        <Link href="/therapist/attendance#keterangan" className="m-btn m-btn-ghost">
          <Icon name="calendar-plus" size={15} /> Kirim Keterangan
        </Link>
      </div>
    </div>
  );
}
