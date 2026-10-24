import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { isDemoMode, DEMO_GATE_COOKIE, DEMO_GATE_TTL_SEC } from "@/lib/demo/config";
import { checkMarketingCredentials, signGate } from "@/lib/demo/gate";
import { findMarketerByEmail, isMarketerUsable, logDemoEvent, recentFailures, verifyPassword } from "@/lib/demo/marketers";
import { createAdminClient } from "@/lib/supabase/admin";

// Gerbang marketing demo Royal Spa. Hanya hidup di deploy DEMO_MODE=1.
//
// 2026-10-24: setiap marketing punya akun sendiri (tabel demo_marketers,
// dikelola Super Admin → Akses Demo). Akun utama dari env tetap berlaku
// sebagai akun pemilik. Setiap percobaan dicatat di demo_access_log; 5 kali
// gagal dalam 15 menit (per email atau per IP) → ditahan sementara.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { email?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body kosong → ditolak di bawah */
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const h = await headers();

  // Jeda kecil seragam: memperlambat tebak-tebakan tanpa membocorkan apa pun.
  await new Promise((r) => setTimeout(r, 400));

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email dan password wajib diisi." }, { status: 400 });
  }

  if ((await recentFailures(email, h)) >= 5) {
    await logDemoEvent(h, { event: "LOGIN_BLOCKED", email, detail: "5+ gagal dalam 15 menit" });
    return NextResponse.json({ ok: false, error: "Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi." }, { status: 429 });
  }

  let marketerId: string | null = null;
  let ok = checkMarketingCredentials(email, password);
  let reason = "";
  if (!ok) {
    const marketer = await findMarketerByEmail(email);
    if (marketer && (await verifyPassword(password, marketer.password_hash))) {
      if (isMarketerUsable(marketer)) {
        ok = true;
        marketerId = marketer.id;
      } else {
        reason = marketer.active ? "Akses demo ini sudah kedaluwarsa. Hubungi admin TheraHub." : "Akses demo ini sudah dinonaktifkan. Hubungi admin TheraHub.";
        await logDemoEvent(h, { event: "DENIED", email, marketerId: marketer.id, detail: marketer.active ? "kedaluwarsa" : "nonaktif" });
        return NextResponse.json({ ok: false, error: reason }, { status: 403 });
      }
    }
  }

  if (!ok) {
    await logDemoEvent(h, { event: "LOGIN_FAIL", email });
    return NextResponse.json({ ok: false, error: "Email atau password salah." }, { status: 401 });
  }

  const token = await signGate(email);
  if (!token) return NextResponse.json({ ok: false, error: "DEMO_GATE_SECRET belum diatur di server." }, { status: 500 });

  await logDemoEvent(h, { event: "LOGIN_OK", email, marketerId });
  if (marketerId) {
    await createAdminClient().from("demo_marketers").update({ last_login_at: new Date().toISOString() }).eq("id", marketerId);
  }

  (await cookies()).set(DEMO_GATE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEMO_GATE_TTL_SEC,
  });
  return NextResponse.json({ ok: true });
}
