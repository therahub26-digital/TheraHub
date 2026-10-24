import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, DEMO_GATE_COOKIE } from "@/lib/demo/config";
import { readGate, isDemoAccessActive } from "@/lib/demo/gate";
import { describeGateOwner, logDemoEvent } from "@/lib/demo/marketers";
import { seedRoyalSpa } from "@/lib/demo/royalSpaSeed";

// ---------------------------------------------------------------------
// Reset data demo Royal Spa — dipicu MANUAL dari tombol di /demo
// (keputusan Adjie 2026-10-20: tidak ada reset otomatis malam hari).
// Hanya deploy DEMO_MODE=1 + gerbang marketing sah. Yang direset hanya
// tenant royal-spa (fungsi 0043 menolak slug lain).
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const gate = await readGate((await cookies()).get(DEMO_GATE_COOKIE)?.value);
  if (!gate) {
    return NextResponse.json({ ok: false, error: "Sesi demo berakhir. Masuk lagi dengan akun marketing." }, { status: 401 });
  }
  const h = await headers();
  const owner = await describeGateOwner(gate.email);
  if (!(await isDemoAccessActive(gate.email))) {
    await logDemoEvent(h, { event: "DENIED", email: gate.email, marketerId: owner.id, detail: "reset setelah akses dicabut" });
    return NextResponse.json({ ok: false, error: "Akses demo Anda sudah dinonaktifkan." }, { status: 403 });
  }
  const t0 = Date.now();
  const result = await seedRoyalSpa(createAdminClient());
  await logDemoEvent(h, { event: "RESET", email: gate.email, marketerId: owner.id, detail: result.ok ? `berhasil ${Math.round((Date.now() - t0) / 1000)} dtk` : "gagal" });
  if (!result.ok) console.error("[demo/reset]", result.log.join(" | "));
  return NextResponse.json({ ok: result.ok, seconds: Math.round((Date.now() - t0) / 1000), summary: result.log.slice(-3) }, { status: result.ok ? 200 : 500 });
}
