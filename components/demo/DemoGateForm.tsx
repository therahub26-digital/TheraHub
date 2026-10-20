"use client";

import { useState, type FormEvent } from "react";

export default function DemoGateForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/demo/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Gagal masuk. Coba lagi.");
        setBusy(false);
        return;
      }
      window.location.assign("/demo");
    } catch {
      setError("Koneksi terputus. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <form className="col g3" onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <div className="demo-err" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
        {busy ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}
