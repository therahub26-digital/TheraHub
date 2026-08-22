"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient, User } from "@supabase/supabase-js";
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

// ---------------------------------------------------------------------
// Resolves a signed-in identity to its portal, self-provisioning a
// `customers` row on first login if this identity registered via
// /register and hasn't logged in before (see that page's header for
// why the row isn't created at signUp time, and
// supabase/migrations/0016_customer_self_signup.sql for the RLS side).
// Shared between the password-login submit handler and the auto-detect
// effect below (email-confirmation links land back on THIS page with a
// session already established by the browser client's PKCE handling).
// ---------------------------------------------------------------------
async function resolveAndRoute(supabase: SupabaseClient, user: User, router: ReturnType<typeof useRouter>, setError: (m: string) => void) {
  const { data: staffRow } = await supabase.from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (staffRow?.role) {
    router.push(ROLE_HOME[staffRow.role] ?? "/");
    return;
  }

  const { data: customerRow } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (customerRow) {
    router.push(ROLE_HOME.customer);
    return;
  }

  const pending = user.user_metadata as { pending_customer?: boolean; name?: string; phone?: string; tenant_id?: string } | undefined;
  if (pending?.pending_customer && pending.tenant_id) {
    const { error: insertError } = await supabase.from("customers").insert({
      tenant_id: pending.tenant_id,
      name: pending.name ?? user.email ?? "Customer",
      phone: pending.phone ?? "",
      email: user.email,
      auth_user_id: user.id,
    });
    if (insertError) {
      setError("Akun berhasil diverifikasi, tapi gagal membuat profil customer. Hubungi outlet Anda.");
      return;
    }
    router.push(ROLE_HOME.customer);
    return;
  }

  setError("Login berhasil, tapi akun ini belum terhubung ke peran manapun. Hubungi admin tenant Anda.");
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handles the "clicked the email activation link" arrival: @supabase/ssr's
  // browser client auto-exchanges the ?code=... param for a session on
  // init when it's the same browser that started signUp(). If that
  // happened, route immediately instead of making the person log in
  // again right after confirming their email.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await resolveAndRoute(supabase, session.user, router, setError);
      }
      setCheckingSession(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError(
        signInError?.message === "Invalid login credentials"
          ? "Email atau password salah, atau akun belum diaktivasi lewat email."
          : signInError?.message ?? "Login gagal."
      );
      setLoading(false);
      return;
    }

    await resolveAndRoute(supabase, data.user, router, setError);
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
            Login dengan akun yang diberikan admin tenant Anda, atau akun customer Anda sendiri.
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

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading || checkingSession} style={{ marginTop: 6 }}>
              {checkingSession ? "Memeriksa sesi…" : loading ? "Memproses…" : "Masuk"}
            </button>
          </form>

          <div className="tiny dim" style={{ marginTop: 18, textAlign: "center" }}>
            Belum punya akun customer? <Link href="/register">Daftar di sini</Link>.
          </div>
          <div className="tiny dim" style={{ marginTop: 6, textAlign: "center" }}>
            Masih ingin lihat demo tanpa login? <Link href="/">Kembali ke halaman demo</Link>.
          </div>
        </div>
      </main>
    </div>
  );
}
