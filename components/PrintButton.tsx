"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// Tombol cetak + PRATINJAU CETAK (2026-10-23, Adjie: "semua laporan bisa
// di preview cetak"). Dipakai semua laporan (Laporan Lengkap, Keuangan,
// Kinerja Terapis, Reports) dan QR Kamar.
//
// Pratinjau = mode tampilan di dalam aplikasi, tanpa membuka dialog
// printer: kelas `print-preview` dipasang di <html> → CSS di globals.css
// (blok "PRATINJAU CETAK") menyembunyikan menu/tombol, menampilkan kop
// laporan, dan menaruh isi di lembar A4 putih bertema terang. Dari situ
// pengguna menekan "Cetak / Simpan PDF" (dialog printer browser) atau
// "Tutup pratinjau". Tema asli dikembalikan saat ditutup.
// ---------------------------------------------------------------------

function printNow() {
  window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

export default function PrintButton({ label = "Cetak", preview = true }: { label?: string; preview?: boolean }) {
  const [active, setActive] = useState(false);
  const savedTheme = useRef<string | null>(null);

  const close = useCallback(() => {
    const html = document.documentElement;
    html.classList.remove("print-preview");
    if (savedTheme.current) html.setAttribute("data-theme", savedTheme.current);
    setActive(false);
  }, []);

  const open = useCallback(() => {
    const html = document.documentElement;
    savedTheme.current = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "light");
    html.classList.add("print-preview");
    setActive(true);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  // Tutup pratinjau bila komponen hilang (pindah halaman).
  useEffect(() => () => {
    document.documentElement.classList.remove("print-preview");
    if (savedTheme.current) document.documentElement.setAttribute("data-theme", savedTheme.current);
  }, []);

  return (
    <>
      {preview && (
        <button type="button" className="btn btn-ghost btn-sm no-print" onClick={open} title="Lihat tampilan A4 sebelum dicetak">
          <Icon name="eye" size={14} /> Pratinjau cetak
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary btn-sm no-print"
        title="Tip: matikan 'Headers and footers' di pengaturan cetak"
        onClick={printNow}
      >
        <Icon name="printer" size={14} /> {label}
      </button>
      {active && typeof document !== "undefined" && createPortal(
        <div className="print-preview-bar no-print" role="toolbar" aria-label="Pratinjau cetak">
          <span className="print-preview-title"><Icon name="eye" size={15} /> Pratinjau cetak · A4</span>
          <span className="print-preview-hint">Tampilan ini sama dengan hasil cetak / PDF. Tekan Esc untuk kembali.</span>
          <span className="print-preview-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}><Icon name="x" size={14} /> Tutup pratinjau</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={printNow}><Icon name="printer" size={14} /> {label}</button>
          </span>
        </div>,
        document.body
      )}
    </>
  );
}
