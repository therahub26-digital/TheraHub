"use client";

import Icon from "@/components/Icon";

/** Tombol cetak browser — dipakai halaman QR Kamar (window.print butuh Client Component). */
export default function PrintButton({ label = "Cetak" }: { label?: string }) {
  function printPage() {
    window.dispatchEvent(new Event("resize"));
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm no-print"
      title="Tip: matikan 'Headers and footers' di pengaturan cetak"
      onClick={printPage}
    >
      <Icon name="printer" size={14} /> {label}
    </button>
  );
}
