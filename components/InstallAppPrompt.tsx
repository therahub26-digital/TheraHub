"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// Ajakan memasang aplikasi ke layar utama (2026-08-31).
//
// Manifest saja tidak cukup: di Android, memasang PWA tersembunyi di
// menu titik-tiga Chrome ("Tambahkan ke Layar Utama"), dan tidak ada
// terapis yang akan menemukannya sendiri. Tanpa ajakan ini, seluruh
// pekerjaan manifest tidak berguna — orangnya tetap membuka lewat tab.
//
// Chrome menembakkan `beforeinstallprompt` HANYA kalau syarat pemasangan
// terpenuhi (manifest sah, service worker aktif, HTTPS) dan aplikasinya
// belum terpasang. Jadi keberadaan event ini sekaligus jadi pemeriksaan:
// kalau tidak ditembakkan, tidak ada yang ditampilkan — bukan tombol
// yang menjanjikan sesuatu lalu gagal.
//
// iOS/Safari tidak mendukung event ini sama sekali; di sana pemasangan
// harus lewat tombol Bagikan → "Tambah ke Layar Utama". Sengaja TIDAK
// dibuatkan instruksi terpisah di sini: terapis Amethyst memakai Android,
// dan instruksi untuk perangkat yang tidak dipakai siapa pun hanya
// menambah teks yang harus dirawat.
// ---------------------------------------------------------------------

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "therahub-install-dismissed";

export default function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Mode penyamaran / penyimpanan diblokir — tetap tampilkan ajakannya.
    }

    function onPrompt(e: Event) {
      e.preventDefault(); // tahan, supaya kita yang menentukan kapan menampilkannya
      setDeferred(e as InstallPromptEvent);
      setHidden(false);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Tidak apa-apa: paling buruk ajakannya muncul lagi lain kali.
    }
  }

  async function install() {
    if (!deferred) return;
    setHidden(true);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Kalau ditolak, jangan bertanya lagi terus-menerus.
    if (outcome === "dismissed") dismiss();
    setDeferred(null);
  }

  if (hidden || !deferred) return null;

  return (
    <div
      role="region"
      aria-label="Pasang aplikasi"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 84,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--r-md)",
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      <Icon name="smartphone" size={18} style={{ flexShrink: 0, color: "var(--accent)" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small bold" style={{ color: "var(--text-1)" }}>
          Pasang di layar utama
        </div>
        <div className="tiny dim">Buka langsung tanpa mencari tab browser.</div>
      </div>
      <button type="button" className="btn btn-quiet btn-sm" onClick={dismiss}>
        Nanti
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={install}>
        Pasang
      </button>
    </div>
  );
}
