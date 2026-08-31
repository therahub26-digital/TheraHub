"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------
// Customer self-registration — added 2026-08-22, user request: "konsumen
// harus aktivasi pendaftaran lewat email". Public page (no session
// needed to view it), only writes a Supabase Auth user via signUp() --
// the actual `customers` row is created later, client-side, the first
// time this identity logs in successfully post email-confirmation (see
// app/login/page.tsx's onAuthenticated()). That split matters: while the
// email is unconfirmed there IS no session yet (Supabase withholds one
// until "Confirm email" is satisfied — a project-level Auth setting,
// on by default, this page does not and cannot change it from here), so
// there is no way to satisfy customers_insert_self's `auth_user_id =
// auth.uid()` check at signUp time. Registration name/phone/chosen
// outlet ride along in the auth user's own metadata (`options.data`)
// until that first login, where they get read back out and written into
// the real row (see supabase/migrations/0016_customer_self_signup.sql
// for the RLS side of this).
// ---------------------------------------------------------------------

type OutletOption = { id: string; name: string; city: string; tenantId: string };

export default function RegisterPage() {
  const [outlets, setOutlets] = useState<OutletOption[] | null>(null);
  const [outletsError, setOutletsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("outlets")
      .select("id, name, city, tenant_id")
      .order("name")
      .then(({ data, error: err }) => {
        // Dua sebab yang berbeda, dulu diberi satu pesan yang sama —
        // dan pesan itu menyuruh "coba lagi" untuk keadaan yang tidak akan
        // berubah dengan mencoba lagi. Tenant yang belum mempublikasikan
        // satu outlet pun membuat pendaftaran customer mati total, dan
        // tidak ada di layar yang memberi tahu kenapa.
        if (err) {
          setOutletsError("Tidak bisa memuat daftar outlet saat ini. Periksa koneksi Anda lalu coba lagi.");
          return;
        }
        if (!data || data.length === 0) {
          setOutletsError(
            "Belum ada outlet yang dipublikasikan, jadi pendaftaran belum bisa dilakukan. Hubungi outlet Anda — mereka perlu mempublikasikan profil outletnya lebih dulu."
          );
          return;
        }
        const opts = data.map((o) => ({ id: o.id, name: o.name as string, city: o.city as string, tenantId: o.tenant_id as string }));
        setOutlets(opts);
        setOutletId(opts[0].id);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Nama tidak boleh kosong.");
    if (!phone.trim()) return setError("Nomor HP tidak boleh kosong.");
    if (password.length < 6) return setError("Password minimal 6 karakter.");
    const outlet = outlets?.find((o) => o.id === outletId);
    if (!outlet) return setError("Pilih outlet yang biasa Anda kunjungi.");

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Read back client-side after email confirmation, see file header.
        data: { pending_customer: true, name: name.trim(), phone: phone.trim(), tenant_id: outlet.tenantId },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes("already registered")
          ? "Email ini sudah terdaftar. Silakan masuk, atau reset password kalau lupa."
          : signUpError.message
      );
      setLoading(false);
      return;
    }

    // Supabase returns a user with an empty `identities` array for an
    // email that's already registered but unconfirmed, WITHOUT an error
    // (to avoid leaking which emails exist) — treat it the same way.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("Email ini sudah terdaftar. Silakan masuk, atau cek email lama untuk link aktivasi.");
      setLoading(false);
      return;
    }

    setLoading(false);
    setDone(true);
  }

  if (done) {
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
          <div className="card anim-in" style={{ width: "100%", maxWidth: 420, padding: 28, textAlign: "center" }}>
            <Icon name="circle-check" size={34} style={{ color: "var(--accent)", marginBottom: 12 }} />
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Cek email Anda</h1>
            <p className="muted small" style={{ marginBottom: 4, lineHeight: 1.6 }}>
              Kami sudah kirim link aktivasi ke <strong style={{ color: "var(--text-1)" }}>{email}</strong>.
              Buka email itu dan klik link-nya untuk mengaktifkan akun.
            </p>
            <p className="muted small" style={{ marginBottom: 18, lineHeight: 1.6 }}>
              Setelah aktivasi, kembali ke sini dan masuk dengan email &amp; password yang tadi Anda buat.
            </p>
            <Link href="/login" className="btn btn-primary btn-block">Ke halaman masuk</Link>
          </div>
        </main>
      </div>
    );
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
        <div className="card anim-in" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
          <h1 style={{ fontSize: 21, marginBottom: 4 }}>Daftar Akun Customer</h1>
          <p className="muted small" style={{ marginBottom: 22 }}>
            Booking, cek membership, dan riwayat kunjungan Anda dari mana saja.
          </p>

          <form onSubmit={onSubmit} className="col g3">
            <div className="field">
              <label>Nama Lengkap</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Anda" />
            </div>

            <div className="field">
              <label>Nomor HP</label>
              <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
            </div>

            <div className="field">
              <label>Email</label>
              <input
                type="email" className="input" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com"
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password" className="input" required autoComplete="new-password" minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter"
              />
            </div>

            <div className="field">
              <label>Outlet yang biasa Anda kunjungi</label>
              {outletsError ? (
                <div className="tiny" style={{ color: "var(--danger)" }}>{outletsError}</div>
              ) : (
                <select className="select" required disabled={!outlets} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                  {!outlets && <option>Memuat outlet…</option>}
                  {outlets?.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} — {o.city}</option>
                  ))}
                </select>
              )}
            </div>

            {error && (
              <div className="tiny" style={{ color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading || !outlets} style={{ marginTop: 6 }}>
              {loading ? "Memproses…" : "Daftar"}
            </button>
          </form>

          <div className="tiny dim" style={{ marginTop: 18, textAlign: "center" }}>
            Sudah punya akun? <Link href="/login">Masuk</Link>.
          </div>
        </div>
      </main>
    </div>
  );
}
