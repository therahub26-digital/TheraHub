"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { switchDemoRole } from "./DemoRolePicker";

type R = { role: string; label: string; home: string };

// Tombol mengambang "Ganti peran" — hanya dirender oleh app/layout.tsx di
// deploy DEMO_MODE=1 dengan gerbang marketing yang sah.
export default function DemoRoleSwitcher({ roles }: { roles: R[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = window.location.pathname;
    setCurrent(roles.find((r) => p === r.home || p.startsWith(r.home + "/"))?.role ?? null);
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [roles]);

  async function pick(role: string) {
    setBusy(true);
    const err = await switchDemoRole(role);
    if (err) {
      setBusy(false);
      alert(err);
    }
  }

  async function exit() {
    setBusy(true);
    await fetch("/api/demo/exit", { method: "POST" }).catch(() => null);
    window.location.assign("/demo");
  }

  const cur = roles.find((r) => r.role === current);
  return (
    <div className="demo-switch" ref={ref}>
      {open && (
        <div className="demo-switch-menu" role="menu">
          <div className="demo-switch-head">Ganti peran · tanpa password</div>
          {roles.map((r) => (
            <button key={r.role} role="menuitem" disabled={busy || r.role === current} onClick={() => pick(r.role)}>
              {r.label}
              {r.role === current && <span>aktif</span>}
            </button>
          ))}
          <Link href="/" className="demo-switch-sub">Website Royal Spa</Link>
          <button className="demo-switch-sub" onClick={exit} disabled={busy}>Keluar demo</button>
        </div>
      )}
      <button className="demo-switch-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={busy}>
        <span className="demo-switch-dot" />
        {busy ? "Membuka…" : `Demo · ${cur?.label ?? "Pilih peran"}`}
      </button>
    </div>
  );
}
