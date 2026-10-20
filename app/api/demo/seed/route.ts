import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/demo/config";
import { seedRoyalSpa } from "@/lib/demo/royalSpaSeed";

// ---------------------------------------------------------------------
// Seed + reset tenant demo Royal Spa.
//   - Pertama kali: dari `npm run dev` lokal → GET http://localhost:<port>/api/demo/seed
//     (butuh DEMO_ACCOUNT_PASSWORD di .env.local, sama dengan di Vercel demo).
//   - Setiap malam: Vercel Cron (vercel.json) di deploy demo, dengan header
//     Authorization: Bearer <CRON_SECRET> yang dikirim Vercel otomatis.
// Di deploy produksi (DEMO_MODE kosong) route ini 404.
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true; // dev lokal
  if (!isDemoMode()) return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && !isDemoMode()) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await seedRoyalSpa(createAdminClient());
  if (!result.ok) console.error("[demo/seed]", result.log.join(" | "));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
