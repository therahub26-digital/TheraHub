import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { wallClockIso, plusMinutes, nowIso, todayIsoDate } from "@/lib/wallclock";
import { commissionAmount, commissionRuleSnapshot, type CommissionRule } from "@/lib/commission";

// ---------------------------------------------------------------------
// DEV-ONLY — REBRAND TENANT DEMO "AMET SPA" + RIWAYAT DEMO
//
// Dijalankan SETELAH scripts/demo-ametspa-01-reset.sql (yang mengosongkan
// data transaksional & menganonimkan karyawan). Route ini:
//   1. Rebrand tenants + outlets → "Amet Spa" (display name saja; slug,
//      kode outlet, dan receipt_prefix SENGAJA tidak diubah — tidak ada
//      yang bergantung padanya secara brand, dan mengubahnya menyentuh
//      lebih banyak permukaan daripada manfaatnya untuk demo).
//   2. Roster terapis fiktif: dua employee ber-akun login di-RENAME jadi
//      persona fiktif (akun auth-nya tetap — itu titik uji login terapis),
//      sisanya dibuat baru. Tidak ada satu pun nama/foto orang sungguhan.
//   3. Customer demo: Budi Santoso ditautkan ulang ke auth user yang
//      sudah ada + 12 customer fiktif tanpa login.
//   4. Riwayat demo 45 hari (booking→sesi→transaksi→komisi) lewat kolom
//      dan rumus yang SAMA dengan payForSession — tax/service charge
//      dibaca dari setting outlet, komisi dari aturan katalog sungguhan.
//   5. Kondisi "hari ini" yang hidup: sesi berjalan, antrian bayar,
//      booking mendatang — supaya dashboard tidak kosong saat demo.
//
// Payroll SENGAJA tidak di-seed: jalankan dari UI (/manager/payroll)
// supaya alur payroll sungguhan ikut terdemokan dan tetap idempoten.
//
// Penanda data demo: bookings.notes = '[demo-seed]'. Seperti booking_id
// NULL di dev-seed-demo-commissions, penanda ini yang membuat purge
// (?clear=1) bisa dipercaya tidak menyentuh baris lain.
//
// Deterministik (mulberry32) — angka demo tidak berubah tiap run.
// Idempoten kasar: generate menolak jalan kalau sudah ada baris
// '[demo-seed]'; jalankan ?clear=1 dulu untuk mengulang.
//
//   GET /api/dev-seed-ametspa           — rebrand + roster + seed
//   GET /api/dev-seed-ametspa?clear=1   — hapus riwayat demo saja
//                                         (roster & rebrand dibiarkan)
// ---------------------------------------------------------------------

const TENANT_SLUG = "amethyst"; // slug lama dipertahankan (lihat catatan #1)
const DEMO_NOTE = "[demo-seed]";
const HISTORY_DAYS = 45;

// Akun auth terapis yang SUDAH ADA — employee-nya di-rename, bukan dibuat
// ulang, supaya login terapis tetap bisa diuji/didemokan.
const THERAPIST_ACCOUNT_EMAILS = ["rumahappsid@gmail.com", "haerunnisaindah5@gmail.com"];
const CUSTOMER_ACCOUNT_EMAIL = "neokaskus@gmail.com"; // Budi Santoso

// Rebrand per kode outlet (kode & receipt_prefix tidak diubah).
const OUTLET_REBRAND: Record<string, { name: string; address: string; phone: string }> = {
  "AMY-CKW": {
    name: "Amet Spa — Dago",
    address: "Jl. Ir. H. Juanda No. 88, Dago, Bandung (alamat demo)",
    phone: "0800-0000-0001",
  },
  "AMY-MKW": {
    name: "Amet Spa — Buah Batu",
    address: "Jl. Buah Batu No. 120, Bandung (alamat demo)",
    phone: "0800-0000-0002",
  },
};

// Persona terapis fiktif per outlet. TIDAK ada yang sama dengan 21 nama
// roster Amethyst sungguhan. Dua nama pertama outlet pertama dipakai
// untuk me-rename dua employee ber-akun.
const ROSTER: Record<string, string[]> = {
  "AMY-CKW": ["Citra", "Laras", "Nadia", "Ratih"],
  "AMY-MKW": ["Salma", "Tiara", "Winda", "Yuni"],
};

const DEMO_CUSTOMERS = [
  "Rina Marlina", "Agus Prasetyo", "Siti Rahma", "Dedi Kurniawan",
  "Lia Puspita", "Hendra Gunawan", "Mega Sari", "Yoga Pratama",
  "Nur Aini", "Bayu Saputra", "Wulan Dari", "Fajar Ramadhan",
];

const INTENSITIES = ["MEDIUM", "STRONG", "MEDIUM_STRONG"] as const;
const PAY_METHODS = ["Cash", "Cash", "QRIS", "QRIS", "Debit Card"] as const;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shortCode(rng: () => number): string {
  return Math.floor(rng() * 36 ** 4).toString(36).padStart(4, "0").toUpperCase();
}

function dateNDaysAgo(n: number): string {
  // Kalender WIB — konsisten dengan todayIsoDate() (lib/wallclock.ts).
  const today = todayIsoDate();
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type OutletRow = {
  id: string;
  code: string;
  tax_pct: number | string;
  service_charge_pct: number | string;
  tax_enabled: boolean | null;
  service_charge_enabled: boolean | null;
  receipt_prefix: string;
};

type PackageRow = {
  id: string;
  name: string;
  duration_min: number;
  list_price: number | string;
  required_skill: string | null;
  commission_type: string | null;
  commission_value: number | string | null;
};

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev-seed-ametspa is disabled in production" }, { status: 403 });
  }

  const admin = createAdminClient();
  const log: string[] = [];
  const clearOnly = new URL(request.url).searchParams.get("clear") === "1";

  // --- tenant ---------------------------------------------------------
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .select("id, name")
    .eq("slug", TENANT_SLUG)
    .maybeSingle();
  if (tenantErr || !tenant) {
    return NextResponse.json({ error: `tenant '${TENANT_SLUG}' tidak ditemukan: ${tenantErr?.message ?? "no row"}`, log }, { status: 500 });
  }
  const tenantId = tenant.id as string;

  // --- clear mode: hapus riwayat demo saja ------------------------------
  if (clearOnly) {
    const { data: demoBookings, error: findErr } = await admin
      .from("bookings")
      .select("id")
      .eq("notes", DEMO_NOTE);
    if (findErr) return NextResponse.json({ error: `cari booking demo: ${findErr.message}`, log }, { status: 500 });
    const ids = (demoBookings ?? []).map((b) => b.id);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, log: ["tidak ada baris [demo-seed] — tidak ada yang dihapus"] });
    }
    // Anak dulu, induk belakangan. Hanya baris yang menunjuk booking demo.
    const { data: demoTx } = await admin.from("transactions").select("id").in("booking_id", ids);
    const txIds = (demoTx ?? []).map((t) => t.id);
    if (txIds.length > 0) {
      const { error } = await admin.from("transaction_items").delete().in("transaction_id", txIds);
      if (error) return NextResponse.json({ error: `hapus transaction_items: ${error.message}`, log }, { status: 500 });
    }
    for (const [table, col] of [
      ["commission_entries", "booking_id"],
      ["transactions", "booking_id"],
      ["sessions", "booking_id"],
    ] as const) {
      const { error } = await admin.from(table).delete().in(col, ids);
      if (error) return NextResponse.json({ error: `hapus ${table}: ${error.message}`, log }, { status: 500 });
    }
    const { error: delBookErr } = await admin.from("bookings").delete().in("id", ids);
    if (delBookErr) return NextResponse.json({ error: `hapus bookings: ${delBookErr.message}`, log }, { status: 500 });
    log.push(`${ids.length} booking demo + turunannya dihapus`);
    return NextResponse.json({ ok: true, log });
  }

  // --- tolak double-seed ------------------------------------------------
  {
    const { data: existing } = await admin.from("bookings").select("id").eq("notes", DEMO_NOTE).limit(1).maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Riwayat [demo-seed] sudah ada. Jalankan ?clear=1 dulu kalau mau mengulang.", log },
        { status: 409 }
      );
    }
  }

  // --- 1. rebrand -------------------------------------------------------
  {
    const { error } = await admin
      .from("tenants")
      .update({ name: "Amet Spa", legal_name: "Amet Spa (Tenant Demo)" })
      .eq("id", tenantId);
    if (error) return NextResponse.json({ error: `rebrand tenant: ${error.message}`, log }, { status: 500 });
    log.push(`tenant '${tenant.name}' -> 'Amet Spa'`);
  }

  const { data: outletRows, error: outletErr } = await admin
    .from("outlets")
    .select("id, code, tax_pct, service_charge_pct, tax_enabled, service_charge_enabled, receipt_prefix")
    .eq("tenant_id", tenantId)
    .eq("status", "ACTIVE");
  if (outletErr || !outletRows || outletRows.length === 0) {
    return NextResponse.json({ error: `outlets: ${outletErr?.message ?? "kosong"}`, log }, { status: 500 });
  }
  const outlets = outletRows as OutletRow[];

  for (const o of outlets) {
    const re = OUTLET_REBRAND[o.code];
    if (!re) {
      log.push(`outlet ${o.code}: tidak ada entri rebrand — dilewati (tambahkan ke OUTLET_REBRAND bila perlu)`);
      continue;
    }
    const { error } = await admin.from("outlets").update(re).eq("id", o.id);
    if (error) return NextResponse.json({ error: `rebrand outlet ${o.code}: ${error.message}`, log }, { status: 500 });
    log.push(`outlet ${o.code} -> ${re.name}`);
  }

  // --- 2. roster terapis fiktif ----------------------------------------
  // 2a. Rename dua employee ber-akun (hasil blok 3b skrip reset).
  const { data: linkedUsers, error: linkedErr } = await admin
    .from("app_users")
    .select("id, email, employee_id")
    .in("email", THERAPIST_ACCOUNT_EMAILS)
    .not("employee_id", "is", null);
  if (linkedErr) return NextResponse.json({ error: `app_users terapis: ${linkedErr.message}`, log }, { status: 500 });

  const therapistsByOutlet = new Map<string, { id: string; name: string }[]>();
  const usedNames = new Map<string, number>(); // outletCode -> berapa nama roster terpakai

  for (const u of linkedUsers ?? []) {
    const { data: emp, error } = await admin
      .from("employees")
      .select("id, outlet_id")
      .eq("id", u.employee_id)
      .single();
    if (error || !emp) return NextResponse.json({ error: `employee akun ${u.email}: ${error?.message ?? "no row"}`, log }, { status: 500 });
    const outlet = outlets.find((o) => o.id === emp.outlet_id);
    const code = outlet?.code ?? outlets[0].code;
    const idx = usedNames.get(code) ?? 0;
    const name = (ROSTER[code] ?? ROSTER[outlets[0].code])[idx] ?? `Terapis ${idx + 1}`;
    usedNames.set(code, idx + 1);

    const { error: updEmpErr } = await admin
      .from("employees")
      .update({ name, therapist_grade: "Senior", massage_intensity: INTENSITIES[idx % 3] })
      .eq("id", emp.id);
    if (updEmpErr) return NextResponse.json({ error: `rename employee ${u.email}: ${updEmpErr.message}`, log }, { status: 500 });
    const { error: updUserErr } = await admin.from("app_users").update({ name }).eq("id", u.id);
    if (updUserErr) return NextResponse.json({ error: `rename app_user ${u.email}: ${updUserErr.message}`, log }, { status: 500 });

    const list = therapistsByOutlet.get(emp.outlet_id) ?? [];
    list.push({ id: emp.id, name });
    therapistsByOutlet.set(emp.outlet_id, list);
    log.push(`employee akun ${u.email} di-rename -> ${name}`);
  }

  // 2b. Lengkapi roster tiap outlet dengan terapis fiktif baru.
  for (const o of outlets) {
    const names = ROSTER[o.code] ?? [];
    const have = usedNames.get(o.code) ?? 0;
    // Skill diambil dari katalog outlet supaya booking form menerima mereka.
    const { data: pkgSkill } = await admin
      .from("service_packages")
      .select("required_skill")
      .eq("outlet_id", o.id)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();
    const skills = pkgSkill?.required_skill ? [pkgSkill.required_skill] : ["massage"];

    for (let i = have; i < names.length; i++) {
      const suffix = o.code.split("-")[1] ?? o.code;
      const { data: emp, error } = await admin
        .from("employees")
        .insert({
          tenant_id: tenantId,
          outlet_id: o.id,
          code: `TRP-${suffix}-9${i}`,
          name: names[i],
          job_role: "Terapis",
          join_date: dateNDaysAgo(HISTORY_DAYS + 30),
          is_therapist: true,
          therapist_grade: i === 0 ? "Senior" : "Junior",
          massage_intensity: INTENSITIES[i % 3],
          skills,
          phone: "0800-0000-0000",
          status: "ACTIVE",
        })
        .select("id, name")
        .single();
      if (error || !emp) return NextResponse.json({ error: `insert terapis ${names[i]}: ${error?.message ?? "?"}`, log }, { status: 500 });
      const list = therapistsByOutlet.get(o.id) ?? [];
      list.push({ id: emp.id, name: emp.name });
      therapistsByOutlet.set(o.id, list);
    }
    log.push(`${o.code}: ${(therapistsByOutlet.get(o.id) ?? []).length} terapis demo`);
  }

  // --- 3. customers -----------------------------------------------------
  // 3a. Budi Santoso — tautkan ulang ke auth user yang sudah ada.
  const { data: authList, error: authListErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (authListErr) return NextResponse.json({ error: `listUsers: ${authListErr.message}`, log }, { status: 500 });
  const budiAuth = authList.users.find((u) => u.email?.toLowerCase() === CUSTOMER_ACCOUNT_EMAIL);
  const customerIds: string[] = [];
  if (budiAuth) {
    const { data: budi, error } = await admin
      .from("customers")
      .insert({
        tenant_id: tenantId,
        name: "Budi Santoso",
        phone: "+62 812-0000-0001",
        email: CUSTOMER_ACCOUNT_EMAIL,
        auth_user_id: budiAuth.id,
        segment: "Active",
        membership: "None",
        prepaid_balance: 0,
        loyalty_points: 0,
        marketing_consent: false,
        avatar_tone: "sky",
      })
      .select("id")
      .single();
    if (error || !budi) return NextResponse.json({ error: `customer Budi: ${error?.message ?? "?"}`, log }, { status: 500 });
    customerIds.push(budi.id);
    log.push("customer Budi Santoso ditautkan ulang ke akunnya");
  } else {
    log.push(`⚠️ auth user ${CUSTOMER_ACCOUNT_EMAIL} tidak ditemukan — login customer tidak tersambung ke baris customer`);
  }

  // 3b. Customer fiktif tanpa login.
  {
    const rows = DEMO_CUSTOMERS.map((name, i) => ({
      tenant_id: tenantId,
      name,
      phone: `0899-0000-${String(100 + i)}`,
      segment: "Active",
      membership: "None",
      prepaid_balance: 0,
      loyalty_points: 0,
      marketing_consent: false,
      avatar_tone: "sky",
    }));
    const { data, error } = await admin.from("customers").insert(rows).select("id");
    if (error || !data) return NextResponse.json({ error: `customers demo: ${error?.message ?? "?"}`, log }, { status: 500 });
    for (const c of data) customerIds.push(c.id);
    log.push(`${data.length} customer fiktif dibuat`);
  }

  // --- kasir (untuk transactions.cashier_id) ----------------------------
  const { data: kasir, error: kasirErr } = await admin
    .from("app_users")
    .select("id, employee_id")
    .eq("tenant_id", tenantId)
    .eq("role", "kasir")
    .limit(1)
    .maybeSingle();
  if (kasirErr || !kasir) {
    return NextResponse.json({ error: `akun kasir tidak ditemukan: ${kasirErr?.message ?? "no row"}`, log }, { status: 500 });
  }
  const cashierId = kasir.employee_id as string;

  // --- 4. riwayat demo 45 hari + 5. kondisi hari ini --------------------
  const today = todayIsoDate();
  let totalBookings = 0;

  for (const o of outlets) {
    const rng = mulberry32(
      Array.from(o.code).reduce((h, ch) => (Math.imul(31, h) + ch.charCodeAt(0)) | 0, 7)
    );

    const { data: pkgRows, error: pkgErr } = await admin
      .from("service_packages")
      .select("id, name, duration_min, list_price, required_skill, commission_type, commission_value")
      .eq("outlet_id", o.id)
      .eq("status", "ACTIVE");
    if (pkgErr || !pkgRows || pkgRows.length === 0) {
      return NextResponse.json({ error: `katalog ${o.code} kosong: ${pkgErr?.message ?? "tidak ada paket ACTIVE"}`, log }, { status: 500 });
    }
    const packages = pkgRows as PackageRow[];

    const { data: roomRows, error: roomErr } = await admin
      .from("rooms")
      .select("id")
      .eq("outlet_id", o.id)
      .eq("status", "ACTIVE");
    if (roomErr || !roomRows || roomRows.length === 0) {
      return NextResponse.json({ error: `rooms ${o.code} kosong: ${roomErr?.message ?? "?"}`, log }, { status: 500 });
    }
    const roomIds = roomRows.map((r) => r.id);
    const therapists = therapistsByOutlet.get(o.id) ?? [];
    if (therapists.length === 0) {
      return NextResponse.json({ error: `roster ${o.code} kosong`, log }, { status: 500 });
    }

    const taxPct = o.tax_enabled === false ? 0 : Number(o.tax_pct ?? 0);
    const scPct = o.service_charge_enabled === false ? 0 : Number(o.service_charge_pct ?? 0);

    type Acc = {
      bookings: Record<string, unknown>[];
      sessions: Record<string, unknown>[];
      transactions: Record<string, unknown>[];
      items: Record<string, unknown>[];
      commissions: Record<string, unknown>[];
    };
    const acc: Acc = { bookings: [], sessions: [], transactions: [], items: [], commissions: [] };

    const addPaidVisit = (date: string, hh: number, mm: number) => {
      const pkg = pick(rng, packages);
      const th = pick(rng, therapists);
      const price = Number(pkg.list_price);
      const start = wallClockIso(date, `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      const end = plusMinutes(start, pkg.duration_min);
      const bookingId = randomUUID();
      const sessionId = randomUUID();
      const txId = randomUUID();
      const roomId = pick(rng, roomIds);
      const customerId = pick(rng, customerIds);

      acc.bookings.push({
        id: bookingId,
        code: `BK-${date.replace(/-/g, "")}-${shortCode(rng)}`,
        outlet_id: o.id,
        customer_id: customerId,
        therapist_id: th.id,
        room_id: roomId,
        package_id: pkg.id,
        duration_min: pkg.duration_min,
        price,
        date,
        scheduled_start: start,
        scheduled_end: end,
        status: "PAID",
        source: pick(rng, ["Walk-in", "WhatsApp", "Phone", "Kasir"]),
        notes: DEMO_NOTE,
        add_on_ids: [],
      });
      acc.sessions.push({
        id: sessionId,
        booking_id: bookingId,
        outlet_id: o.id,
        therapist_id: th.id,
        room_id: roomId,
        purchased_duration_min: pkg.duration_min,
        actual_start: start,
        expected_end: end,
        actual_end: end,
        extension_minutes: 0,
        status: "COMPLETED",
      });

      const subtotal = price;
      const serviceCharge = Math.round((subtotal * scPct) / 100);
      const tax = Math.round(((subtotal + serviceCharge) * taxPct) / 100);
      const total = subtotal + serviceCharge + tax;
      acc.transactions.push({
        id: txId,
        receipt_no: `${o.receipt_prefix}-${date.replace(/-/g, "")}-${shortCode(rng)}`,
        outlet_id: o.id,
        booking_id: bookingId,
        customer_id: customerId,
        cashier_id: cashierId,
        subtotal,
        discount: 0,
        tax,
        service_charge: serviceCharge,
        total,
        payment_method: pick(rng, [...PAY_METHODS]),
        status: "PAID",
        paid_at: plusMinutes(end, 5),
        printed_count: 0,
      });
      acc.items.push({
        transaction_id: txId,
        item_type: "SERVICE",
        name: pkg.name,
        qty: 1,
        unit_price: price,
        therapist_id: th.id,
      });

      const rule: CommissionRule = {
        type: (pkg.commission_type ?? "fixed") as CommissionRule["type"],
        value: Number(pkg.commission_value ?? 0),
      };
      const earned = commissionAmount(rule, price);
      if (earned > 0) {
        acc.commissions.push({
          therapist_id: th.id,
          outlet_id: o.id,
          date,
          booking_id: bookingId,
          package_name: pkg.name,
          rule_snapshot: commissionRuleSnapshot(rule, pkg.name),
          basis_amount: price,
          amount: earned,
          status: "PENDING",
        });
      }
      totalBookings++;
    };

    // Riwayat: H-45 .. H-1.
    for (let n = HISTORY_DAYS; n >= 1; n--) {
      const date = dateNDaysAgo(n);
      const visits = 3 + Math.floor(rng() * 5); // 3..7 per outlet per hari
      for (let v = 0; v < visits; v++) {
        addPaidVisit(date, 10 + Math.floor(rng() * 10), pick(rng, [0, 15, 30, 45]));
      }
    }

    // Hari ini: 2 booking mendatang (BOOKED) + 1 sesi berjalan + 1 antrian bayar.
    const mkToday = (status: "BOOKED" | "COMPLETED" | "IN_SESSION", startIso: string, pkg: PackageRow, th: { id: string }, withRoom: boolean) => {
      const bookingId = randomUUID();
      acc.bookings.push({
        id: bookingId,
        code: `BK-${today.replace(/-/g, "")}-${shortCode(rng)}`,
        outlet_id: o.id,
        customer_id: pick(rng, customerIds),
        therapist_id: th.id,
        room_id: withRoom ? pick(rng, roomIds) : null,
        package_id: pkg.id,
        duration_min: pkg.duration_min,
        price: Number(pkg.list_price),
        date: today,
        scheduled_start: startIso,
        scheduled_end: plusMinutes(startIso, pkg.duration_min),
        status,
        source: "Walk-in",
        notes: DEMO_NOTE,
        add_on_ids: [],
      });
      return bookingId;
    };

    const pkgA = packages[0];
    const now = nowIso();
    // dua booking mendatang
    mkToday("BOOKED", plusMinutes(now, 120), pkgA, therapists[0], false);
    mkToday("BOOKED", plusMinutes(now, 240), pick(rng, packages), therapists[1 % therapists.length], false);
    // satu sesi sedang berjalan (mulai 35 menit lalu)
    {
      const th = therapists[2 % therapists.length];
      const start = plusMinutes(now, -35);
      const bId = mkToday("IN_SESSION", start, pkgA, th, true);
      const booking = acc.bookings[acc.bookings.length - 1] as { room_id: string };
      acc.sessions.push({
        id: randomUUID(),
        booking_id: bId,
        outlet_id: o.id,
        therapist_id: th.id,
        room_id: booking.room_id,
        purchased_duration_min: pkgA.duration_min,
        actual_start: start,
        expected_end: plusMinutes(start, pkgA.duration_min),
        extension_minutes: 0,
        status: "ACTIVE",
      });
    }
    // satu sesi selesai, menunggu pembayaran
    {
      const th = therapists[3 % therapists.length];
      const start = plusMinutes(now, -120);
      const bId = mkToday("COMPLETED", start, pkgA, th, true);
      const booking = acc.bookings[acc.bookings.length - 1] as { room_id: string };
      acc.sessions.push({
        id: randomUUID(),
        booking_id: bId,
        outlet_id: o.id,
        therapist_id: th.id,
        room_id: booking.room_id,
        purchased_duration_min: pkgA.duration_min,
        actual_start: start,
        expected_end: plusMinutes(start, pkgA.duration_min),
        actual_end: plusMinutes(start, pkgA.duration_min),
        extension_minutes: 0,
        status: "COMPLETED",
      });
    }

    // Tulis per tabel, per potongan — PostgREST nyaman di <=500 baris/insert.
    const chunks = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    for (const [table, rows] of [
      ["bookings", acc.bookings],
      ["sessions", acc.sessions],
      ["transactions", acc.transactions],
      ["transaction_items", acc.items],
      ["commission_entries", acc.commissions],
    ] as const) {
      for (const part of chunks(rows, 400)) {
        const { error } = await admin.from(table).insert(part);
        if (error) return NextResponse.json({ error: `${o.code} insert ${table}: ${error.message}`, log }, { status: 500 });
      }
    }
    log.push(`${o.code}: ${acc.bookings.length} booking, ${acc.transactions.length} transaksi, ${acc.commissions.length} komisi`);
  }

  log.push(`total ${totalBookings} kunjungan riwayat di-seed (${HISTORY_DAYS} hari)`);
  log.push("Langkah lanjut manual: (1) jalankan payroll bulan lalu dari /manager/payroll; (2) atur branding/warna di /admin/profile; (3) publish profil kedua outlet.");
  return NextResponse.json({ ok: true, log });
}
