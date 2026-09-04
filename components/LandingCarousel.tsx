"use client";

import { useRef } from "react";

// ---------------------------------------------------------------------
// Panah geser untuk deretan kartu terapis di landing publik tenant
// (revisi Adjie 2026-09-04: "foto terapis bisa discroll ke samping").
// Deretannya sendiri sudah overflow-x sejak awal — masalahnya di
// desktop tidak ada penanda bahwa ia bisa digeser, dan menggeser pakai
// mouse canggung. Mockup memakai chevron kiri/kanan; ini meniru itu.
// Scroll sentuh/trackpad tetap jalan seperti biasa.
// ---------------------------------------------------------------------

export default function LandingCarousel({ children }: { children: React.ReactNode }) {
  const rel = useRef<HTMLDivElement>(null);

  function geser(arah: -1 | 1) {
    const el = rel.current;
    if (!el) return;
    el.scrollBy({ left: arah * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className="lp-caro">
      <button type="button" className="lp-caro-btn lp-caro-prev" aria-label="Geser ke kiri" onClick={() => geser(-1)}>
        ‹
      </button>
      <div className="lp-therapists" ref={rel}>
        {children}
      </div>
      <button type="button" className="lp-caro-btn lp-caro-next" aria-label="Geser ke kanan" onClick={() => geser(1)}>
        ›
      </button>
    </div>
  );
}
