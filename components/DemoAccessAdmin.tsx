"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import {
  createDemoMarketer, resetDemoMarketerPassword, setDemoMarketerActive, setDemoMarketerExpiry,
} from "@/lib/actions/demoMarketers";

// Form & tombol halaman Super Admin → Akses Demo (2026-10-24).

const DEMO_URL = "https://demo.therahub.biz.id/demo";

function shareText(name: string, email: string, password: string) {
  return `Halo ${name}, ini akses demo TheraHub (Royal Spa):\n${DEMO_URL}\nEmail: ${email}\nPassword: ${password}\n\nAkun ini khusus untuk Anda — mohon tidak dibagikan, setiap akses tercatat.`;
}

function PasswordReveal({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(name, email, password);
  return (
    <div className="card card-pad" style={{ borderColor: "var(--accent)", marginTop: 10 }}>
      <div className="small strong" style={{ color: "var(--text-1)" }}>Password untuk {name}</div>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 20, letterSpacing: 1, margin: "6px 0" }}>{password}</div>
      <div className="tiny dim">Hanya ditampilkan sekali. Kirim ke yang bersangkutan sekarang; bila hilang, gunakan Reset password.</div>
      <div className="row g2" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); }}>
          <Icon name="copy" size={13} /> {copied ? "Tersalin" : "Salin pesan"}
        </button>
        <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          <Icon name="send" size={13} /> Kirim via WhatsApp
        </a>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}

export function NewDemoMarketerForm() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", email: "", expiresAt: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (created) return <PasswordReveal {...created} onClose={() => { setCreated(null); setOpen(false); }} />;
  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => { setV({ name: "", email: "", expiresAt: "", note: "" }); setError(null); setOpen(true); }}>
        <Icon name="plus" size={14} /> Akun marketing baru
      </button>
    );
  }
  return (
    <div className="card card-pad stack g2" style={{ maxWidth: 520 }}>
      <div className="small strong" style={{ color: "var(--text-1)" }}>Akun marketing baru</div>
      <div className="row g2 wrap">
        <label className="stack g1" style={{ flex: 1, minWidth: 180 }}>
          <span className="tiny dim">Nama</span>
          <input className="input" value={v.name} disabled={isPending} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="mis. Budi (marketing Bandung)" />
        </label>
        <label className="stack g1" style={{ flex: 1, minWidth: 180 }}>
          <span className="tiny dim">Email</span>
          <input className="input" type="email" value={v.email} disabled={isPending} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </label>
      </div>
      <div className="row g2 wrap">
        <label className="stack g1" style={{ flex: 1, minWidth: 180 }}>
          <span className="tiny dim">Berlaku sampai (kosong = tanpa batas)</span>
          <input className="input" type="date" value={v.expiresAt} disabled={isPending} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1, minWidth: 180 }}>
          <span className="tiny dim">Catatan (opsional)</span>
          <input className="input" value={v.note} disabled={isPending} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="mis. freelance, wilayah Jakarta" />
        </label>
      </div>
      {error && <div className="tiny" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm" disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await createDemoMarketer({ name: v.name, email: v.email, expiresAt: v.expiresAt || null, note: v.note });
              if (r.ok) setCreated({ name: v.name.trim(), email: v.email.trim().toLowerCase(), password: r.password });
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Buat akun"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </div>
  );
}

export function DemoMarketerActions({ id, name, email, active, expiresAt }: { id: string; name: string; email: string; active: boolean; expiresAt: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [editExpiry, setEditExpiry] = useState(false);
  const [expiry, setExpiry] = useState(expiresAt ? expiresAt.slice(0, 10) : "");

  const run = (fn: () => Promise<{ ok: boolean; error?: string; password?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Gagal.");
      else if (r.password) setPassword(r.password);
    });
  };

  if (password) return <PasswordReveal name={name} email={email} password={password} onClose={() => setPassword(null)} />;

  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <div className="row g1 wrap" style={{ justifyContent: "flex-end" }}>
        {active ? (
          <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={isPending}
            onClick={() => { if (confirm(`Nonaktifkan akses demo ${name}? Sesi yang sedang berjalan langsung tertutup.`)) run(() => setDemoMarketerActive(id, false)); }}>
            <Icon name="x" size={12} /> Nonaktifkan
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => run(() => setDemoMarketerActive(id, true))}>
            <Icon name="check" size={12} /> Aktifkan
          </button>
        )}
        <button className="btn btn-ghost btn-sm" disabled={isPending}
          onClick={() => { if (confirm(`Buat password baru untuk ${name}? Password lama langsung tidak berlaku.`)) run(() => resetDemoMarketerPassword(id)); }}>
          <Icon name="lock" size={12} /> Reset password
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setEditExpiry((x) => !x)}>
          <Icon name="calendar" size={12} /> Masa berlaku
        </button>
      </div>
      {editExpiry && (
        <div className="row g1">
          <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} style={{ width: 160 }} />
          <button className="btn btn-primary btn-sm" disabled={isPending} onClick={() => { run(() => setDemoMarketerExpiry(id, expiry || null)); setEditExpiry(false); }}>Simpan</button>
        </div>
      )}
      {error && <div className="tiny" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
