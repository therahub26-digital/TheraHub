"use client";

import { useState } from "react";

type R = { role: string; label: string; person: string; desc: string };

export async function switchDemoRole(role: string): Promise<string | null> {
  const res = await fetch("/api/demo/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    if (res.status === 401) window.location.assign("/demo");
    return data.error ?? "Gagal pindah peran.";
  }
  // Navigasi penuh (bukan router.push) — sama seperti login biasa, supaya
  // cookie sesi baru pasti ikut terkirim dan layout dirender ulang.
  window.location.assign(data.redirect);
  return null;
}

export default function DemoRolePicker({ roles }: { roles: R[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function go(role: string) {
    setBusy(role);
    setError("");
    const err = await switchDemoRole(role);
    if (err) {
      setError(err);
      setBusy(null);
    }
  }

  return (
    <div className="col g3">
      <div className="demo-roles">
        {roles.map((r) => (
          <button key={r.role} className="demo-role" onClick={() => go(r.role)} disabled={busy !== null}>
            <b>{r.label}</b>
            <span>{r.person}</span>
            <small>{busy === r.role ? "Membuka…" : r.desc}</small>
          </button>
        ))}
      </div>
      {error && <div className="demo-err" role="alert">{error}</div>}
    </div>
  );
}
