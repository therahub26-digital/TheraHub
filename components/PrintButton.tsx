"use client";

import Icon from "@/components/Icon";

/** Tombol cetak browser — dipakai halaman QR Kamar (window.print butuh Client Component). */
export default function PrintButton({ label = "Cetak" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary btn-sm no-print" onClick={() => window.print()}>
      <Icon name="printer" size={14} /> {label}
    </button>
  );
}
