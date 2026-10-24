import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, DEMO_GATE_COOKIE } from "@/lib/demo/config";
import { readGate } from "@/lib/demo/gate";
import { describeGateOwner, logDemoEvent } from "@/lib/demo/marketers";

// Keluar dari demo: tutup sesi akun peran + hapus cookie gerbang marketing.
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const gate = await readGate((await cookies()).get(DEMO_GATE_COOKIE)?.value);
  if (gate) {
    const owner = await describeGateOwner(gate.email);
    await logDemoEvent(await headers(), { event: "LOGOUT", email: gate.email, marketerId: owner.id });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(DEMO_GATE_COOKIE);
  return NextResponse.json({ ok: true });
}
