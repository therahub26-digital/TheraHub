"use client";

import Icon from "@/components/Icon";

/** Tombol cetak browser — dipakai halaman QR Kamar (window.print butuh Client Component). */
export default function PrintButton() {
  return (
    <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
      <Icon name="printer" size={14} /> Cetak
    </button>
  );
}
