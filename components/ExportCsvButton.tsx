"use client";

import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// Tombol ekspor CSV — ditambahkan 2026-08-24 (backlog 4.5).
//
// Pola pemakaian: CSV-nya dibangun di SERVER (halaman sudah memuat
// datanya untuk ditampilkan, jadi membangun string CSV di sana praktis
// gratis), komponen ini hanya menerima string jadi dan mengurus unduhannya.
// Konsekuensinya komponen client ini tidak perlu tahu apa pun soal bentuk
// data, tidak perlu memanggil API, dan tidak menambah query ke database.
//
// Kenapa Blob + <a download> dan bukan route handler: tidak ada permintaan
// jaringan sama sekali, jadi tidak ada jalur baru yang perlu diamankan —
// data yang diekspor persis data yang sudah boleh dilihat pengguna di
// layar yang sama, di bawah RLS yang sama. Route /api/export/... berarti
// menulis ulang pengecekan izin itu dari nol, dengan risiko salah.
//
// Saat tidak ada baris untuk diekspor, tombol tetap terlihat tapi
// `disabled` dengan alasan yang jujur — konvensi yang sama dipakai di
// seluruh aplikasi sejak Gelombang 1 (lihat /manager/rooms).
// ---------------------------------------------------------------------

export default function ExportCsvButton({
  csv,
  filename,
  rowCount,
  label = "Export",
  emptyReason = "Tidak ada data untuk diekspor.",
}: {
  /** Isi file CSV yang sudah jadi (tanpa BOM) — bangun dengan lib/csv.ts. */
  csv: string;
  /** Nama file unduhan, mis. "transaksi-2026-08-24.csv". */
  filename: string;
  /** Jumlah baris data (di luar header), untuk menonaktifkan saat kosong. */
  rowCount: number;
  label?: string;
  emptyReason?: string;
}) {
  const empty = rowCount === 0;

  function download() {
    // BOM "﻿" wajib: tanpa itu Excel di Windows membaca file sebagai
    // ANSI dan merusak setiap nama yang mengandung karakter non-ASCII.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Dilepas supaya blob-nya tidak menggantung di memori sampai tab ditutup.
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className="btn btn-quiet btn-sm"
      type="button"
      onClick={empty ? undefined : download}
      disabled={empty}
      title={empty ? emptyReason : `Unduh ${rowCount} baris sebagai ${filename}`}
    >
      <Icon name="download" size={13} /> {label}
    </button>
  );
}
