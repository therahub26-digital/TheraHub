"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

// Role -> portal base route, mirrors lib/nav.ts ROLES[].base.
const ROLE_HOME: Record<string, string> = {
  "super-admin": "/super-admin",
  admin: "/admin",
  owner: "/owner",
  manager: "/manager",
  kasir: "/kasir",
  therapist: "/therapist",
  customer: "/customer",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError(signInError?.message === "Invalid login credentials" ? "Email atau password salah." : signInError?.message ?? "Login gagal.");
      setLoading(false);
      return;
    }

    // Resolve which portal this identity belongs to. Staff live in
    // app_users, customers live in customers — RLS lets each identity
    // read only its own row (see 0002_rls_policies.sql), so this is safe
    // to run from the browser client.
    const { data: staffRow } = await supabase.from("app_users").select("role").eq("auth_user_id", data.user.id).maybeSingle();

    if (staffRow?.role) {
      router.push(ROLE_HOME[staffRow.role] ?? "/");
      return;
    }

    const { data: customerRow } = await supabase.from("customers").select("id").eq("auth_user_id", data.user.id).maybeSingle();

    if (customerRow) {
      router.push(ROLE_HOME.customer);
      return;
    }

    setError("Login berhasil, tapi akun ini belum terhubung ke peran manapun. Hubungi admin tenant Anda.");
    setLoading(false);
  }

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />

      <header className="landing-top">
        <Link href="/" className="row g3" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Icon name="waves" size={21} strokeWidth={2.4} />
          </span>
          <div>
            <div className="brand-name" style={{ fontSize: 18 }}>TheraHub</div>
            <div className="tiny dim">Spa &amp; Massage Business Management</div>
          </div>
        </Link>
        <ThemeToggle />
      </header>

      <main style={{ display: "flex", justifyContent: "center", padding: "40px 20px 80px" }}>
        <div className="card anim-in" style={{ width: "100%", maxWidth: 400, padding: 28 }}>
          <h1 style={{ fontSize: 21, marginBottom: 4 }}>Masuk ke TheraHub</h1>
          <p className="muted small" style={{ marginBottom: 22 }}>
            Login dengan akun yang diberikan admin tenant Anda.
          </p>

          <form onSubmit={onSubmit} className="col g3">
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                className="input"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                className="input"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="tiny" style={{ color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading} style={{ marginTop: 6 }}>
              {loading ? "Memproses…" : "Masuk"}
            </button>
          </form>

          <div className="tiny dim" style={{ marginTop: 18, textAlign: "center" }}>
            Masih ingin lihat demo tanpa login? <Link href="/">Kembali ke halaman demo</Link>.
          </div>
        </div>
      </main>
    </div>
  );
}
