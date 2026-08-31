"use client";

import { useEffect, useState, type FormEvent } from "react";
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
/**
 * Pindah halaman setelah login.
 *
 * ⚠️ 2026-08-31 — dulu `router.push()`. Itu navigasi LUNAK: Next.js
 * mengambil payload halaman lewat jaringan dulu, baru berpindah. Kalau
 * pengambilan itu gagal di sinyal jelek, Next.js bisa diam saja — tidak
 * pindah, tidak ada error, layar tetap di halaman login seolah tombolnya
 * tidak pernah ditekan. Dari lapangan: terapis "login tapi tidak pernah
 * masuk ke halaman awal".
 *
 * `window.location.assign()` adalah navigasi biasa milik browser:
 * browsernya sendiri yang menangani lambat/putus, menampilkan indikator
 * muatnya, dan cookie sesi pasti ikut terkirim. Lebih lambat beberapa
 * ratus milidetik di jaringan bagus — dan itu harga yang murah untuk
 * berhenti gagal senyap di jaringan jelek.
 */
function go(href: string) {
  window.location.assign(href);
}

async function resolveAndRoute(supabase: SupabaseClient, user: User, setError: (m: string) => void) {
  const { data: staffRow } = await supabase.from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (staffRow?.role) {
    go(ROLE_HOME[staffRow.role] ?? "/");
    return;
  }

  const { data: customerRow } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (customerRow) {
    go(ROLE_HOME.customer);
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
    go(ROLE_HOME.customer);
    return;
  }

  setError("Login berhasil, tapi akun ini belum terhubung ke peran manapun. Hubungi admin tenant Anda.");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [routing, setRouting] = useState(false);
  // Sinyal jelek: beri tahu orangnya bahwa loginnya BERHASIL dan yang lambat
  // adalah perpindahan halaman — supaya dia menunggu, bukan menekan ulang.
  const [slow, setSlow] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handles the "clicked the email activation link" arrival: @supabase/ssr's
  // browser client auto-exchanges the ?code=... param for a session on
  // init when it's the same browser that started signUp(). If that
  // happened, route immediately instead of making the person log in
  // again right after confirming their email.
  // Kalau perpindahan halaman lewat 6 detik, katakan terus terang bahwa
  // loginnya SUDAH berhasil dan yang lambat adalah jaringannya. Tanpa ini
  // orang menyimpulkan sendiri bahwa loginnya gagal, lalu menekan ulang —
  // dan tekanan berulang di jaringan jelek justru memperlambat semuanya.
  useEffect(() => {
    if (!routing) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [routing]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await resolveAndRoute(supabase, session.user, setError);
      }
      setCheckingSession(false);
    });
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

    // Navigasi diserahkan ke browser (lihat `go`). JANGAN mematikan status
    // "memproses" di sini: kalau jaringannya lambat, tombol akan hidup lagi
    // sementara halaman baru masih dalam perjalanan — dan orang yang mengira
    // tombolnya tidak berfungsi akan menekannya lagi.
    setRouting(true);
    await resolveAndRoute(supabase, data.user, (m) => {
      setError(m);
      setRouting(false);
      setLoading(false);
    });
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

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading || routing || checkingSession} style={{ marginTop: 6 }}>
              {checkingSession ? "Memeriksa sesi…" : routing ? "Mengalihkan…" : loading ? "Memproses…" : "Masuk"}
            </button>

            {routing && slow && (
              <div className="tiny" style={{ marginTop: 8, textAlign: "center", color: "var(--warning)" }}>
                Login Anda <strong>berhasil</strong> — halaman berikutnya sedang dimuat.
                Jaringan sedang lambat; mohon tunggu dan jangan menekan Masuk lagi.
              </div>
            )}
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
