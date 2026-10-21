import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, DEMO_GATE_COOKIE } from "@/lib/demo/config";
import { verifyGate } from "@/lib/demo/gate";
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
  if (!(await verifyGate((await cookies()).get(DEMO_GATE_COOKIE)?.value))) {
    return NextResponse.json({ ok: false, error: "Sesi demo berakhir. Masuk lagi dengan akun marketing." }, { status: 401 });
  }
  const t0 = Date.now();
  const result = await seedRoyalSpa(createAdminClient());
  if (!result.ok) console.error("[demo/reset]", result.log.join(" | "));
  return NextResponse.json({ ok: result.ok, seconds: Math.round((Date.now() - t0) / 1000), summary: result.log.slice(-3) }, { status: result.ok ? 200 : 500 });
}
