import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------
// DEV-ONLY DEMO DATA — commission volume for testing the Payroll module.
//
// This is DELIBERATELY SEPARATE from /api/dev-seed. That route's whole
// discipline is "real data, and every placeholder is flagged in a
// comment" — Amethyst's actual outlets, actual therapist names, actual
// service pricing. Mixing fabricated earnings into that file would blur
// the one line this project has held everywhere else: what is real
// business data and what is a stand-in for it.
//
// So the fabrication is confined to its own route, and marked in a way
// that survives being looked at later, not just today: every row this
// endpoint writes has `booking_id = null`. A REAL commission entry
// (lib/actions/transactions.ts, payForSession) always carries the
// booking_id of the session that earned it — there is no code path that
// creates one without it. So `booking_id is null` is not an arbitrary
// tag bolted on for this script; it is already, structurally, "an
// entry with no real transaction behind it". That is what makes the
// cleanup query in this file (and the one a developer would write by
// hand later) trustworthy: it cannot accidentally catch a real entry.
//
// Guarded like dev-seed: refuses outside development. Visit
//   GET  /api/dev-seed-demo-commissions            — generate
//   GET  /api/dev-seed-demo-commissions?clear=1     — delete demo rows only
// ---------------------------------------------------------------------

const TENANT_SLUG = "amethyst";
const REAL_PACKAGE_NAME = "Traditional Massage / Basic Shiatsu + Therapy PM";
const REAL_COMMISSION_PER_TREATMENT = 55_000; // matches the rate the manager actually configured in /manager/catalog
const REAL_LIST_PRICE = 180_000;

const TARGET_MIN = 5_000_000;
const TARGET_MAX = 8_000_000;
const PERIOD_COUNT = 3; // current month + 2 previous, so payroll history has something to show

// Deterministic pseudo-random so re-running with the same seed produces
// the same-looking data instead of a new random total every visit —
// avoids the confusion of a demo number that moves every page load
// during a walkthrough. Not cryptographic; this only ever touches
// booking_id-null rows.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function addPeriods(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

function daysInMonth(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "This dev-only route is disabled in production." }, { status: 403 });
  }

  const admin = createAdminClient();
  const log: string[] = [];
  const { searchParams } = new URL(request.url);
  const clearOnly = searchParams.get("clear") === "1";

  const { data: tenant } = await admin.from("tenants").select("id").eq("slug", TENANT_SLUG).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant Amethyst belum ada — jalankan /api/dev-seed dulu.", log }, { status: 400 });

  // ---- Always clear this script's own rows first ---------------------
  // Idempotent re-run: without this, visiting the URL twice would double
  // every therapist's demo commission, which is exactly the kind of
  // silently-wrong number this project has tried hard to avoid elsewhere.
  const { data: therapistRows } = await admin
    .from("employees")
    .select("id, name, code, outlet_id")
    .eq("tenant_id", tenant.id)
    .eq("is_therapist", true)
    .eq("status", "ACTIVE");

  const therapistIds = (therapistRows ?? []).map((t) => t.id);
  if (therapistIds.length) {
    const { error: clearErr, count } = await admin
      .from("commission_entries")
      .delete({ count: "exact" })
      .in("therapist_id", therapistIds)
      .is("booking_id", null);
    if (clearErr) return NextResponse.json({ error: `clear demo commissions: ${clearErr.message}`, log }, { status: 500 });
    log.push(`cleared ${count ?? 0} existing demo commission row(s)`);
  }

  if (clearOnly) {
    return NextResponse.json({ ok: true, log });
  }

  if (!therapistRows?.length) {
    return NextResponse.json({ error: "Tidak ada terapis ACTIVE untuk diberi data uji.", log }, { status: 400 });
  }

  // Current period, computed the same way lib/data/commissions.ts does
  // (server clock), so "current month" here matches what the app itself
  // considers current when someone opens Payroll right after this runs.
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periods = Array.from({ length: PERIOD_COUNT }, (_, i) => addPeriods(currentPeriod, -(PERIOD_COUNT - 1 - i)));

  const rows: {
    therapist_id: string;
    outlet_id: string;
    date: string;
    booking_id: null;
    package_name: string;
    rule_snapshot: string;
    basis_amount: number;
    amount: number;
    status: "PENDING" | "INCLUDED_IN_PAYROLL";
  }[] = [];

  for (const t of therapistRows) {
    for (const period of periods) {
      const rng = mulberry32(hashString(`${t.code}|${period}`));
      const targetTotal = Math.round((TARGET_MIN + rng() * (TARGET_MAX - TARGET_MIN)) / 5000) * 5000;
      const treatmentCount = Math.round(targetTotal / REAL_COMMISSION_PER_TREATMENT);
      const dim = daysInMonth(period);

      // Past periods are marked as already rolled into a payroll run —
      // otherwise a manager opening /manager/payroll for the current
      // month would see two prior months' worth of "PENDING" commission
      // bleed into this month's estimate, which is not how the real
      // half-open date filter in runPayroll works, but would still read
      // as wrong on screen. Only the current period is left PENDING, so
      // "Hitung Payroll" has something live to actually process.
      const status = period === currentPeriod ? "PENDING" : "INCLUDED_IN_PAYROLL";

      for (let i = 0; i < treatmentCount; i++) {
        const day = 1 + Math.floor(rng() * dim);
        rows.push({
          therapist_id: t.id,
          outlet_id: t.outlet_id,
          date: `${period}-${String(day).padStart(2, "0")}`,
          booking_id: null,
          package_name: REAL_PACKAGE_NAME,
          rule_snapshot: `Rp${REAL_COMMISSION_PER_TREATMENT.toLocaleString("id-ID")} / treatment (data uji)`,
          basis_amount: REAL_LIST_PRICE,
          amount: REAL_COMMISSION_PER_TREATMENT,
          status,
        });
      }
    }
  }

  const { error: insertErr } = await admin.from("commission_entries").insert(rows);
  if (insertErr) return NextResponse.json({ error: `insert demo commissions: ${insertErr.message}`, log }, { status: 500 });

  log.push(`inserted ${rows.length} demo commission row(s) across ${therapistRows.length} therapist(s) × ${PERIOD_COUNT} period(s) (${periods.join(", ")})`);
  log.push("every row has booking_id = null — to remove all of them later, visit this route with ?clear=1, or run in SQL: delete from commission_entries where booking_id is null;");

  return NextResponse.json({ ok: true, log });
}
