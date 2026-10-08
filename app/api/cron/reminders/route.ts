import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFonnte } from "@/lib/integrations/fonnte";
import { nowIso } from "@/lib/wallclock";
import {
  MAX_PER_TICK,
  canClaim,
  customerMessage,
  normalizePhone,
  reminderWindow,
  therapistMessage,
  type ReminderKind,
} from "@/lib/reminders";

// ---------------------------------------------------------------------
// Pemicu reminder WhatsApp. Dipanggil tiap menit oleh pg_cron + pg_net
// (lihat akhir supabase/migrations/0035_whatsapp_reminders.sql), BUKAN
// oleh browser. Spesifikasi: project doc "therahub-spec-reminder-wa".
//
// Prinsip yang dijaga di sini:
//  - Keputusan "kirim atau tidak" dibuat SAAT kirim: yang dicari adalah
//    booking BOOKED/CONFIRMED yang mulainya 5–15 menit lagi, jadi booking
//    yang batal / pindah jam / ganti terapis otomatis benar.
//  - Klaim dulu, kirim kemudian: INSERT message_log dengan UNIQUE
//    (booking_id, kind). Dua tick yang tumpang tindih tidak bisa kirim dobel.
//  - Kegagalan tidak pernah menjadi galat HTTP: selalu 200 + ringkasan.
//  - Memakai service role (bypass RLS) — karena itu pintunya dijaga
//    CRON_SECRET, dan SEMUA query dibatasi per tenant secara eksplisit.
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 10;

type Summary = { sent: number; failed: number; skipped: number; considered: number };

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // tidak dikonfigurasi = tertutup, bukan terbuka
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const summary: Summary = { sent: 0, failed: 0, skipped: 0, considered: 0 };
  try {
    await runTick(summary);
  } catch (e) {
    // Jangan bocorkan detail; cukup tercatat di log Vercel.
    console.error("[reminders] tick gagal", e);
    return NextResponse.json({ ok: false, ...summary });
  }
  return NextResponse.json({ ok: true, ...summary });
}

async function runTick(summary: Summary) {
  const admin = createAdminClient();
  const nowWall = nowIso();
  const { from, to } = reminderWindow(nowWall);
  const nowMs = Date.now();

  const { data: integrations } = await admin
    .from("tenant_integrations")
    .select("tenant_id, device_token, reminder_customer, reminder_therapist")
    .eq("provider", "fonnte")
    .not("device_token", "is", null);

  let budget = MAX_PER_TICK;

  for (const integ of integrations ?? []) {
    if (budget <= 0) break;
    if (!integ.reminder_customer && !integ.reminder_therapist) continue;
    const tenantId = integ.tenant_id as string;
    const token = integ.device_token as string;

    const [{ data: tenant }, { data: outlets }] = await Promise.all([
      admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      admin.from("outlets").select("id, name, phone").eq("tenant_id", tenantId),
    ]);
    const outletById = new Map((outlets ?? []).map((o) => [o.id as string, o]));
    if (outletById.size === 0) continue;

    const { data: bookings } = await admin
      .from("bookings")
      .select("id, outlet_id, customer_id, therapist_id, package_id, duration_min, scheduled_start")
      .in("outlet_id", [...outletById.keys()])
      .in("status", ["BOOKED", "CONFIRMED"])
      .gte("scheduled_start", from)
      .lte("scheduled_start", to)
      .order("scheduled_start", { ascending: true });
    if (!bookings || bookings.length === 0) continue;

    const ids = bookings.map((b) => b.id as string);
    const custIds = [...new Set(bookings.map((b) => b.customer_id as string).filter(Boolean))];
    const thIds = [...new Set(bookings.map((b) => b.therapist_id as string).filter(Boolean))];
    const pkgIds = [...new Set(bookings.map((b) => b.package_id as string).filter(Boolean))];

    const [{ data: logs }, { data: customers }, { data: therapists }, { data: packages }] = await Promise.all([
      admin.from("message_log").select("id, booking_id, kind, status, attempts, created_at").in("booking_id", ids),
      custIds.length ? admin.from("customers").select("id, name, phone").in("id", custIds) : Promise.resolve({ data: [] }),
      thIds.length ? admin.from("employees").select("id, name, phone").in("id", thIds) : Promise.resolve({ data: [] }),
      pkgIds.length ? admin.from("service_packages").select("id, name").in("id", pkgIds) : Promise.resolve({ data: [] }),
    ]);

    const logOf = (bookingId: string, kind: ReminderKind) =>
      (logs ?? []).find((l) => l.booking_id === bookingId && l.kind === kind) ?? null;
    const cust = new Map((customers ?? []).map((c) => [c.id as string, c]));
    const ther = new Map((therapists ?? []).map((t) => [t.id as string, t]));
    const pkg = new Map((packages ?? []).map((p) => [p.id as string, p]));

    for (const b of bookings) {
      const kinds: ReminderKind[] = [];
      if (integ.reminder_customer) kinds.push("REMINDER_CUSTOMER");
      if (integ.reminder_therapist) kinds.push("REMINDER_THERAPIST");

      for (const kind of kinds) {
        if (budget <= 0) return;
        const existing = logOf(b.id as string, kind);
        if (!canClaim(existing as never, nowMs)) continue;
        summary.considered++;

        const outlet = outletById.get(b.outlet_id as string)!;
        const customer = cust.get(b.customer_id as string);
        const therapist = ther.get(b.therapist_id as string);
        const phone = normalizePhone(
          kind === "REMINDER_CUSTOMER" ? (customer?.phone as string) : (therapist?.phone as string),
        );

        // --- Klaim ---------------------------------------------------
        let logId: string | null = null;
        if (!existing) {
          const { data: ins, error: insErr } = await admin
            .from("message_log")
            .insert({
              tenant_id: tenantId,
              outlet_id: b.outlet_id,
              booking_id: b.id,
              kind,
              recipient_phone: phone,
              status: phone ? "PENDING" : "SKIPPED",
              attempts: phone ? 1 : 0,
              error: phone ? null : "Nomor tidak valid",
            })
            .select("id")
            .maybeSingle();
          // Pelanggaran UNIQUE = tick lain sudah mengklaim baris ini.
          if (insErr || !ins) continue;
          logId = ins.id as string;
        } else {
          // Klaim ulang secara optimistik: hanya menang bila baris belum berubah.
          const { data: upd } = await admin
            .from("message_log")
            .update({
              status: phone ? "PENDING" : "SKIPPED",
              attempts: (existing.attempts as number) + (phone ? 1 : 0),
              recipient_phone: phone,
              error: phone ? null : "Nomor tidak valid",
              created_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .eq("status", existing.status)
            .eq("attempts", existing.attempts)
            .select("id")
            .maybeSingle();
          if (!upd) continue;
          logId = upd.id as string;
        }

        if (!phone) {
          summary.skipped++;
          continue;
        }

        // --- Kirim ---------------------------------------------------
        budget--;
        const ctx = {
          brand: (tenant?.name as string) ?? "TheraHub",
          outletName: outlet.name as string,
          outletPhone: outlet.phone as string | null,
          customerName: (customer?.name as string) ?? "Tamu",
          therapistName: (therapist?.name as string) ?? "terapis",
          packageName: (pkg.get(b.package_id as string)?.name as string) ?? "layanan",
          durationMin: b.duration_min as number,
          scheduledStart: b.scheduled_start as string,
        };
        const message = kind === "REMINDER_CUSTOMER" ? customerMessage(ctx) : therapistMessage(ctx);
        const result = await sendFonnte({ token, target: phone, message });

        await admin
          .from("message_log")
          .update(
            result.ok
              ? { status: "SENT", sent_at: new Date().toISOString(), provider_response: result.response as never }
              : { status: "FAILED", error: result.error, provider_response: (result.response ?? null) as never },
          )
          .eq("id", logId);
        if (result.ok) summary.sent++;
        else summary.failed++;
      }
    }
  }
}
