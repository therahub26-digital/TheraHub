import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, DEMO_GATE_COOKIE } from "@/lib/demo/config";

// Keluar dari demo: tutup sesi akun peran + hapus cookie gerbang marketing.
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(DEMO_GATE_COOKIE);
  return NextResponse.json({ ok: true });
}
