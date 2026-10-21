"use client";

import { useState } from "react";

// Tombol reset data demo dengan konfirmasi di halaman (bukan confirm()).
export default function DemoResetButton() {
  const [stage, setStage] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setStage("busy");
    setMsg("");
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return window.location.assign("/demo");
      if (!res.ok || !data.ok) {
        setStage("error");
        setMsg(data.error ?? "Reset gagal. Coba sekali lagi; kalau tetap gagal, cek log Vercel.");
        return;
      }
      setStage("done");
      setMsg(`Selesai dalam ${data.seconds} detik. Data kembali ke awal dengan kondisi hari ini yang sedang berjalan.`);
    } catch {
      setStage("error");
      setMsg("Koneksi terputus saat reset. Tunggu sebentar lalu coba lagi.");
    }
  }

  return (
    <div className="demo-reset">
      {stage === "idle" || stage === "done" || stage === "error" ? (
        <>
          <div>
            <b>Reset data demo</b>
            <p>Kembalikan booking, transaksi, absensi, dan perubahan pengaturan ke kondisi awal. Hari ini langsung terisi tamu yang sedang dipijat, menunggu, dan belum bayar.</p>
          </div>
          <button className="demo-reset-btn" onClick={() => setStage("confirm")}>Reset data</button>
        </>
      ) : stage === "confirm" ? (
        <>
          <div>
            <b>Reset sekarang?</b>
            <p>Semua perubahan di demo sejak reset terakhir akan hilang. Butuh sekitar 30 detik.</p>
          </div>
          <div className="row g2">
            <button className="demo-reset-btn ghost" onClick={() => setStage("idle")}>Batal</button>
            <button className="demo-reset-btn" onClick={run}>Ya, reset</button>
          </div>
        </>
      ) : (
        <div>
          <b>Mereset data…</b>
          <p>Menyiapkan 60 hari riwayat dan kondisi hari ini. Jangan tutup halaman.</p>
        </div>
      )}
      {msg && <p className={stage === "error" ? "demo-reset-msg err" : "demo-reset-msg"} role="status">{msg}</p>}
    </div>
  );
}
