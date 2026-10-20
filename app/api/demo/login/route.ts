import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDemoMode, DEMO_GATE_COOKIE, DEMO_GATE_TTL_SEC } from "@/lib/demo/config";
import { checkMarketingCredentials, signGate } from "@/lib/demo/gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshToday } from "@/lib/demo/royalSpaSeed";

// Gerbang marketing demo Royal Spa. Hanya hidup di deploy DEMO_MODE=1.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { email?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body kosong → ditolak di bawah */
  }
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  // Jeda kecil seragam: memperlambat tebak-tebakan tanpa membocorkan apa pun.
  await new Promise((r) => setTimeout(r, 400));

  if (!checkMarketingCredentials(email, password)) {
    return NextResponse.json({ ok: false, error: "Email atau password marketing salah." }, { status: 401 });
  }
  const token = await signGate(email.trim().toLowerCase());
  if (!token) return NextResponse.json({ ok: false, error: "DEMO_GATE_SECRET belum diatur di server." }, { status: 500 });

  (await cookies()).set(DEMO_GATE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEMO_GATE_TTL_SEC,
  });
  // Segarkan jadwal "hari ini" relatif jam sekarang — reset malam membuat
  // semua booking hari ini masih "terjadwal"; tanpa ini demo siang hari
  // tampak penuh tamu yang tidak datang. Gagal di sini tidak boleh
  // menggagalkan login.
  try {
    const log = await refreshToday(createAdminClient());
    console.log("[demo/login] refreshToday", log.join(" | "));
  } catch (e) {
    console.error("[demo/login] refreshToday gagal", e);
  }
  return NextResponse.json({ ok: true });
}
