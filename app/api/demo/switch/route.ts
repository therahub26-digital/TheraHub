import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoRole, DEMO_GATE_COOKIE } from "@/lib/demo/config";
import { readGate, isDemoAccessActive } from "@/lib/demo/gate";
import { describeGateOwner, logDemoEvent } from "@/lib/demo/marketers";

// ---------------------------------------------------------------------
// Ganti peran TANPA password untuk pengunjung demo.
//
// Syarat berlapis:
//   1. DEMO_MODE=1 (deploy demo saja),
//   2. cookie gerbang marketing sah,
//   3. peran yang diminta ada di DEMO_ROLES — email akun tujuan diambil
//      dari konstanta server, BUKAN dari input pengunjung, jadi route ini
//      tidak bisa dipakai masuk ke akun lain mana pun.
// Password akun peran (DEMO_ACCOUNT_PASSWORD) hanya ada di env server.
// Sign-in lewat client SSR biasa → cookie sesi Supabase ditulis seperti
// login normal, dan sejak itu semua query berjalan di bawah RLS akun tsb.
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const jar = await cookies();
  const gate = await readGate(jar.get(DEMO_GATE_COOKIE)?.value);
  if (!gate) {
    return NextResponse.json({ ok: false, error: "Sesi demo berakhir. Masuk lagi dengan akun marketing." }, { status: 401 });
  }
  const h = await headers();
  const owner = await describeGateOwner(gate.email);
  // Akun yang dicabut admin langsung tertutup (2026-10-24).
  if (!(await isDemoAccessActive(gate.email))) {
    jar.delete(DEMO_GATE_COOKIE);
    await logDemoEvent(h, { event: "DENIED", email: gate.email, marketerId: owner.id, detail: "ganti peran setelah akses dicabut" });
    return NextResponse.json({ ok: false, error: "Akses demo Anda sudah dinonaktifkan." }, { status: 403 });
  }

  let role = "";
  try {
    role = String((await req.json()).role ?? "");
  } catch {
    /* ditolak di bawah */
  }
  const target = demoRole(role);
  if (!target) return NextResponse.json({ ok: false, error: "Peran tidak dikenal." }, { status: 400 });

  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!password) return NextResponse.json({ ok: false, error: "DEMO_ACCOUNT_PASSWORD belum diatur di server." }, { status: 500 });

  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: target.email, password });
  if (error) {
    console.error("[demo/switch] sign-in gagal", target.role, error.message);
    return NextResponse.json(
      { ok: false, error: "Akun demo belum siap. Jalankan seed Royal Spa dulu (lihat panduan)." },
      { status: 500 }
    );
  }
  await logDemoEvent(h, { event: "SWITCH", email: gate.email, marketerId: owner.id, role: target.role });
  return NextResponse.json({ ok: true, redirect: target.home });
}
