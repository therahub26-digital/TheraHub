import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------
// ONE-TIME DEV SEED — creates the real Amethyst (Cikawao) tenant + outlet
// + catalog + staff/customer accounts (both the Postgres rows AND the
// matching Supabase Auth users) so login can be tested end-to-end.
//
// This is a development convenience, not a production admin panel:
//   - Guarded so it can only run when NODE_ENV !== "production".
//   - Idempotent-ish: re-running skips anything that already exists by
//     email/slug, so hitting it twice is harmless.
//   - RENAME-AWARE: this project was first seeded under the placeholder
//     name "Zen Wellness" before the real business name (Amethyst) was
//     known. If a tenant/outlet/account still exists under the OLD slug
//     or OLD email, this route renames it in place (UPDATE) instead of
//     creating a duplicate — so re-running after a rebrand is safe and
//     doesn't orphan already-created Supabase Auth users.
//   - Uses the service_role client (bypasses RLS) — this is exactly the
//     kind of trusted server-side operation admin.ts exists for.
//
// Visit http://localhost:3001/api/dev-seed once (GET) to run it, then
// delete this route once phase 5 (real signup/admin UI) replaces it.
// ---------------------------------------------------------------------

const DEMO_PASSWORD = "ZenWellness2026!"; // unchanged on purpose — already set on existing accounts, changing it here would not reset it

const OLD_TENANT_SLUG = "zen-wellness";
const TENANT_SLUG = "amethyst";
const OLD_OUTLET_CODE = "ZW-DGO";
const OUTLET_CODE = "AMY-CKW";
const OLD_EMAIL_DOMAIN = "zenwellness.test";
const EMAIL_DOMAIN = "amethyst.test"; // cosmetic only — still a placeholder test domain, not a real mailbox

type SeedAccount = {
  role: "admin" | "owner" | "manager" | "kasir" | "therapist";
  name: string;
  jobRole: "Admin Umum" | "Manager" | "Kasir" | "Terapis";
  isTherapist?: boolean;
  code: string;
  localPart: string; // e.g. "admin" -> admin@amethyst.test
};

const STAFF: SeedAccount[] = [
  { localPart: "admin", role: "admin", name: "Dewi Anggraini", jobRole: "Admin Umum", code: "STF-ADM" },
  { localPart: "owner", role: "owner", name: "Hendra Wijaya", jobRole: "Admin Umum", code: "STF-OWN" },
  { localPart: "manager", role: "manager", name: "Sinta Maharani", jobRole: "Manager", code: "STF-MGR" },
  { localPart: "kasir", role: "kasir", name: "Nurul Fadhilah", jobRole: "Kasir", code: "STF-KSR" },
  { localPart: "terapis", role: "therapist", name: "Melati Puspita", jobRole: "Terapis", isTherapist: true, code: "TRP-005" },
];

const CUSTOMER = { localPart: "customer", name: "Budi Santoso", phone: "+62 812-0000-0001" };

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev-seed is disabled in production" }, { status: 403 });
  }

  const admin = createAdminClient();
  const log: string[] = [];

  // 1. plan + tenant -------------------------------------------------------
  await admin.from("plans").upsert(
    {
      key: "business",
      name: "Business",
      target: "Multi-outlet spa",
      price_per_outlet: 750000,
      max_outlets: 5,
      max_users: 50,
      max_therapists: 60,
    },
    { onConflict: "key" }
  );

  const tenantFields = {
    name: "Amethyst",
    slug: TENANT_SLUG,
    legal_name: "Amethyst", // TODO: ganti ke nama badan usaha resmi (PT/CV) begitu tersedia
    plan: "business" as const,
    status: "ACTIVE" as const,
    city: "Bandung",
    admin_email: `admin@${EMAIL_DOMAIN}`,
  };

  let { data: tenant } = await admin.from("tenants").select("id, slug").eq("slug", TENANT_SLUG).maybeSingle();
  if (!tenant) {
    const { data: oldTenant } = await admin.from("tenants").select("id, slug").eq("slug", OLD_TENANT_SLUG).maybeSingle();
    if (oldTenant) {
      const { data, error } = await admin.from("tenants").update(tenantFields).eq("id", oldTenant.id).select("id, slug").single();
      if (error) return NextResponse.json({ error: `tenant rename: ${error.message}`, log }, { status: 500 });
      tenant = data;
      log.push(`tenant renamed zen-wellness -> ${TENANT_SLUG}`);
    } else {
      const { data, error } = await admin.from("tenants").insert(tenantFields).select("id, slug").single();
      if (error) return NextResponse.json({ error: `tenant insert: ${error.message}`, log }, { status: 500 });
      tenant = data;
      log.push("tenant created");
    }
  } else {
    log.push("tenant already up to date");
  }
  const tenantId = tenant!.id as string;

  // 2. outlet ----------------------------------------------------------------
  const outletFields = {
    code: OUTLET_CODE,
    name: "Amethyst — Cikawao",
    address: "Komplek Ruko, Jl. Cikawao Permai No. Kav. C 9, Paledang, Lengkong",
    city: "Bandung",
    phone: "0877-8811-6565",
    lat: -6.9273663,
    lng: 107.6155589,
    geofence_radius: 120,
    accuracy_threshold: 45,
    open_hours: "Setiap hari · 10:00–21:30",
    status: "ACTIVE" as const,
    manager_name: "Sinta Maharani",
    tax_pct: 10,
    service_charge_pct: 5,
    receipt_prefix: "CKW",
    deposit_enabled: true,
    deposit_type: "FIXED" as const,
    deposit_value: 50000,
    deposit_min_ticket: 150000,
    deposit_refundable: true,
    deposit_applies_to: ["Customer App", "WhatsApp", "Phone"],
  };

  let { data: outlet } = await admin.from("outlets").select("id").eq("tenant_id", tenantId).eq("code", OUTLET_CODE).maybeSingle();
  if (!outlet) {
    const { data: oldOutlet } = await admin.from("outlets").select("id").eq("tenant_id", tenantId).eq("code", OLD_OUTLET_CODE).maybeSingle();
    if (oldOutlet) {
      const { data, error } = await admin.from("outlets").update(outletFields).eq("id", oldOutlet.id).select("id").single();
      if (error) return NextResponse.json({ error: `outlet rename: ${error.message}`, log }, { status: 500 });
      outlet = data;
      log.push("outlet renamed ZW-DGO -> AMY-CKW");
    } else {
      const { data, error } = await admin.from("outlets").insert({ tenant_id: tenantId, ...outletFields }).select("id").single();
      if (error) return NextResponse.json({ error: `outlet insert: ${error.message}`, log }, { status: 500 });
      outlet = data;
      log.push("outlet created");
    }
  } else {
    log.push("outlet already up to date");
  }
  const outletId = outlet!.id as string;

  // 3. (retired) minimal catalog stub — superseded by the REAL catalog in
  // section 10 below ("Traditional Massage / Basic Shiatsu + Therapy PM",
  // real pricing from the user). This section used to create a placeholder
  // "Signature Ritual" category / "Full Body Massage" type / "Amethyst
  // Signature 60'" package (Rp250.000, invented pricing) just so booking had
  // *something* to point at before real data existed. Now that real catalog
  // data exists, that invented-pricing stub sitting in the same live table
  // is actively misleading (indistinguishable from real data on the Catalog
  // page) — so it's been removed. One-time cleanup below deletes it (and an
  // even older "Zen Signature 60'" leftover from before the Amethyst
  // rebrand) if either still exists, the same pattern used for the AMY-PST
  // outlet cleanup in section 6.
  {
    const { data: staleCategory } = await admin
      .from("service_categories")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", "Signature Ritual")
      .maybeSingle();
    if (staleCategory) {
      const { data: staleTypes } = await admin.from("service_types").select("id").eq("category_id", staleCategory.id);
      const staleTypeIds = (staleTypes ?? []).map((t) => t.id);
      if (staleTypeIds.length > 0) {
        const { error: delPkgErr } = await admin.from("service_packages").delete().in("service_type_id", staleTypeIds);
        if (delPkgErr) return NextResponse.json({ error: `stale package cleanup: ${delPkgErr.message}`, log }, { status: 500 });
        const { error: delTypeErr } = await admin.from("service_types").delete().in("id", staleTypeIds);
        if (delTypeErr) return NextResponse.json({ error: `stale service type cleanup: ${delTypeErr.message}`, log }, { status: 500 });
      }
      const { error: delCatErr } = await admin.from("service_categories").delete().eq("id", staleCategory.id);
      if (delCatErr) return NextResponse.json({ error: `stale category cleanup: ${delCatErr.message}`, log }, { status: 500 });
      log.push('stale "Signature Ritual" stub category (+ Amethyst/Zen Signature 60\' packages) removed — was never a real service');
    }
  }

  // 4. staff: employee row + auth user (renamed if needed) + app_users link -
  //
  // Factored into a function (was a flat for-loop over one outlet) because
  // outlet-session-scoping (getCurrentOutlet(), lib/data/outlets.ts) now
  // reads app_users.outlet_id to decide which outlet a manager/kasir page
  // shows. That fix is inert without a SECOND real login bound to a
  // different outlet to prove it — until now dev-seed only ever created one
  // manager/kasir account, both pinned to Cikawao, so a Mekarwangi manager
  // account never existed to test with. See the MKW_STAFF block below.
  const created: Record<string, string> = {};

  async function provisionStaffAccount(s: SeedAccount, outletIdForAccount: string): Promise<string | NextResponse> {
    const newEmail = `${s.localPart}@${EMAIL_DOMAIN}`;
    const oldEmail = `${s.localPart}@${OLD_EMAIL_DOMAIN}`;

    let employeeId: string | null = null;

    if (s.role !== "owner" && s.role !== "admin") {
      const { data: existingEmp } = await admin.from("employees").select("id").eq("tenant_id", tenantId).eq("code", s.code).maybeSingle();
      if (existingEmp) {
        employeeId = existingEmp.id;
      } else {
        const { data: emp, error } = await admin
          .from("employees")
          .insert({
            tenant_id: tenantId,
            outlet_id: outletIdForAccount,
            code: s.code,
            name: s.name,
            job_role: s.jobRole,
            join_date: new Date().toISOString().slice(0, 10),
            is_therapist: !!s.isTherapist,
            therapist_grade: s.isTherapist ? "Master" : null,
            skills: s.isTherapist ? ["massage", "reflexology"] : [],
          })
          .select("id")
          .single();
        if (error) return NextResponse.json({ error: `employee insert (${s.name}): ${error.message}`, log }, { status: 500 });
        employeeId = emp.id;
        log.push(`employee ${s.name} created`);
      }
    }

    // find existing app_users row under the NEW email, else the OLD email
    // (rename case), else create fresh.
    let { data: existingAppUser } = await admin.from("app_users").select("id, auth_user_id, email").eq("email", newEmail).maybeSingle();
    if (!existingAppUser) {
      const { data: oldAppUser } = await admin.from("app_users").select("id, auth_user_id, email").eq("email", oldEmail).maybeSingle();
      existingAppUser = oldAppUser;
    }

    let authUserId = existingAppUser?.auth_user_id ?? null;

    if (authUserId && existingAppUser!.email !== newEmail) {
      const { error: renameErr } = await admin.auth.admin.updateUserById(authUserId, { email: newEmail, email_confirm: true });
      if (renameErr) return NextResponse.json({ error: `auth email rename (${s.name}): ${renameErr.message}`, log }, { status: 500 });
      log.push(`auth user ${existingAppUser!.email} renamed -> ${newEmail}`);
    }

    if (!authUserId) {
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: newEmail,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (authErr) return NextResponse.json({ error: `auth user (${newEmail}): ${authErr.message}`, log }, { status: 500 });
      authUserId = authUser.user.id;
      log.push(`auth user ${newEmail} created`);
    }

    if (existingAppUser) {
      await admin
        .from("app_users")
        .update({ auth_user_id: authUserId, tenant_id: tenantId, outlet_id: outletIdForAccount, employee_id: employeeId, role: s.role, name: s.name, email: newEmail })
        .eq("id", existingAppUser.id);
    } else {
      const { error } = await admin.from("app_users").insert({
        auth_user_id: authUserId,
        tenant_id: tenantId,
        outlet_id: outletIdForAccount,
        role: s.role,
        name: s.name,
        email: newEmail,
        employee_id: employeeId,
      });
      if (error) return NextResponse.json({ error: `app_users insert (${s.name}): ${error.message}`, log }, { status: 500 });
      log.push(`app_users ${s.name} (${s.role}) created`);
    }

    return newEmail;
  }

  for (const s of STAFF) {
    const result = await provisionStaffAccount(s, outletId);
    if (result instanceof NextResponse) return result;
    created[s.role] = result;
  }

  // 5. one demo customer account (same rename-aware logic) -------------------
  const customerNewEmail = `${CUSTOMER.localPart}@${EMAIL_DOMAIN}`;
  const customerOldEmail = `${CUSTOMER.localPart}@${OLD_EMAIL_DOMAIN}`;

  const { data: existingCustomer } = await admin.from("customers").select("id, auth_user_id, email").eq("tenant_id", tenantId).eq("phone", CUSTOMER.phone).maybeSingle();
  let customerAuthId = existingCustomer?.auth_user_id ?? null;

  if (customerAuthId && existingCustomer!.email !== customerNewEmail) {
    const { error: renameErr } = await admin.auth.admin.updateUserById(customerAuthId, { email: customerNewEmail, email_confirm: true });
    if (renameErr) return NextResponse.json({ error: `customer auth rename: ${renameErr.message}`, log }, { status: 500 });
    log.push(`customer auth user ${customerOldEmail} renamed -> ${customerNewEmail}`);
  }

  if (!customerAuthId) {
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: customerNewEmail,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (authErr) return NextResponse.json({ error: `customer auth user: ${authErr.message}`, log }, { status: 500 });
    customerAuthId = authUser.user.id;
    log.push("customer auth user created");
  }

  if (existingCustomer) {
    await admin.from("customers").update({ auth_user_id: customerAuthId, email: customerNewEmail }).eq("id", existingCustomer.id);
  } else {
    const { error } = await admin.from("customers").insert({
      tenant_id: tenantId,
      name: CUSTOMER.name,
      phone: CUSTOMER.phone,
      email: customerNewEmail,
      auth_user_id: customerAuthId,
    });
    if (error) return NextResponse.json({ error: `customer insert: ${error.message}`, log }, { status: 500 });
    log.push("customer row created");
  }
  created.customer = customerNewEmail;

  // 6. other real Amethyst branches — same tenant ----------------------------
  // CORRECTED per user-supplied screenshots (Telegram absensi/skill posts +
  // Google Maps listings, 2026-08-20): Amethyst has exactly TWO real branches
  // — Cikawao and Mekarwangi. "Setiabudi" and "Pasteur" were leftover
  // placeholder branch names inherited from the original fictional "Zen
  // Wellness" demo data and were never real — renamed away / removed below.
  // Address/phone/coordinates for Mekarwangi are read directly off the
  // Google Maps listing ("Amethyst Refleksi Mekarwangi"); geofence radius,
  // tax/service-charge, and deposit policy are NOT confirmed for Mekarwangi
  // yet, so they mirror Cikawao's as a placeholder pending real config.
  const OTHER_OUTLETS = [
    {
      code: "AMY-MKW",
      name: "Amethyst — Mekarwangi",
      address: "Jl. Mekar Agung No. 109, Mekarwangi, Kec. Bojongloa Kidul",
      city: "Bandung",
      phone: "0877-8811-6767",
      lat: -6.9952221,
      lng: 107.6075589,
      geofence_radius: 120,
      accuracy_threshold: 45,
      // Google Maps confirms closes 22:00; opening time not shown on the
      // listing, assumed same as Cikawao (10:00) pending confirmation.
      open_hours: "Setiap hari · 10:00–22:00",
      status: "ACTIVE" as const,
      manager_name: "", // belum ada data asli — sengaja dikosongkan, bukan ditebak
      late_policy: "FULL_DURATION" as const,
      grace_period_min: 10,
      tax_pct: 10,
      service_charge_pct: 5,
      receipt_prefix: "MKW",
      deposit_enabled: true,
      deposit_type: "FIXED" as const,
      deposit_value: 50000,
      deposit_min_ticket: 150000,
      deposit_expiry_min: 60,
      deposit_refundable: true,
      deposit_applies_to: ["Customer App", "WhatsApp", "Phone"],
      deposit_note: "Deposit dipotong dari total tagihan saat pembayaran akhir.",
    },
  ];

  const outletIdByCode: Record<string, string> = { [OUTLET_CODE]: outletId };

  // Rename-in-place from the old placeholder code if it exists (mirrors the
  // tenant/outlet rename pattern above) so nothing gets orphaned; otherwise
  // upsert fresh by (tenant_id, code).
  const RENAME_FROM: Record<string, string> = { "AMY-MKW": "AMY-STB" };
  for (const o of OTHER_OUTLETS) {
    const { code, ...fields } = o;
    let { data: existing } = await admin.from("outlets").select("id").eq("tenant_id", tenantId).eq("code", code).maybeSingle();
    if (!existing && RENAME_FROM[code]) {
      const { data: oldRow } = await admin.from("outlets").select("id").eq("tenant_id", tenantId).eq("code", RENAME_FROM[code]).maybeSingle();
      existing = oldRow;
    }
    if (existing) {
      const { data, error } = await admin.from("outlets").update({ code, ...fields }).eq("id", existing.id).select("id").single();
      if (error) return NextResponse.json({ error: `outlet upsert (${code}): ${error.message}`, log }, { status: 500 });
      outletIdByCode[code] = data.id;
      log.push(`outlet ${code} upserted`);
    } else {
      const { data, error } = await admin.from("outlets").insert({ tenant_id: tenantId, code, ...fields }).select("id").single();
      if (error) return NextResponse.json({ error: `outlet insert (${code}): ${error.message}`, log }, { status: 500 });
      outletIdByCode[code] = data.id;
      log.push(`outlet ${code} created`);
    }
  }

  // 6b. Mekarwangi's own manager + kasir login — placeholder names, same as
  // the rest of STAFF (Sinta/Nurul/Dewi/Hendra are dev-seed test accounts,
  // not confirmed real hires either; see the roadmap doc's "wajib diganti
  // sebelum go-live" item). What matters functionally is outlet_id: a
  // Mekarwangi manager who logs in must see Mekarwangi's own bookings/
  // payroll/commissions, not Cikawao's — that's what getCurrentOutlet()
  // (lib/data/outlets.ts) now reads app_users.outlet_id to guarantee, and
  // there was no second-outlet account in dev-seed to prove it against.
  const MKW_STAFF: SeedAccount[] = [
    { localPart: "manager-mkw", role: "manager", name: "Rina Kusuma", jobRole: "Manager", code: "STF-MGR-MKW" },
    { localPart: "kasir-mkw", role: "kasir", name: "Fitri Handayani", jobRole: "Kasir", code: "STF-KSR-MKW" },
  ];
  for (const s of MKW_STAFF) {
    const result = await provisionStaffAccount(s, outletIdByCode["AMY-MKW"]);
    if (result instanceof NextResponse) return result;
    created[`${s.role}_mkw`] = result;
  }

  // One-time cleanup: "Pasteur" (AMY-PST) was never a real branch — delete it
  // outright (cascades to its rooms/profile/facilities/gallery). Safe because
  // nothing real (employees, bookings) was ever attached to it.
  {
    const { data: fake, error: findErr } = await admin.from("outlets").select("id").eq("tenant_id", tenantId).eq("code", "AMY-PST").maybeSingle();
    if (findErr) return NextResponse.json({ error: `pasteur lookup: ${findErr.message}`, log }, { status: 500 });
    if (fake) {
      const { error: delErr } = await admin.from("outlets").delete().eq("id", fake.id);
      if (delErr) return NextResponse.json({ error: `pasteur cleanup: ${delErr.message}`, log }, { status: 500 });
      log.push("outlet AMY-PST removed (was never a real branch)");
    }
  }

  // 7. rooms per outlet (idempotent via upsert on (outlet_id, code)) --------
  // 12 uniform rooms per branch (real count per user), all plain massage
  // rooms — the earlier Couple Suite/VIP/Wet Room typology was invented for
  // the old fictional demo and doesn't reflect how Amethyst actually
  // operates (a traditional massage & reflexology business, per its own
  // Google Maps category and the real SOP text: "TRADITIONAL MASSAGE, BASIC
  // SHIATSU, THERAPY PM").
  const REAL_SUPPORTED_SERVICES = ["Traditional Massage", "Basic Shiatsu", "Therapy PM"];
  const uniformRooms = (count: number): [string, string, number, string][] =>
    Array.from({ length: count }, (_, i) => [`Massage Room ${String(i + 1).padStart(2, "0")}`, "Massage", 1, "ACTIVE"]);

  const ROOM_DEFS: Record<string, [string, string, number, string][]> = {
    "AMY-CKW": uniformRooms(12),
    "AMY-MKW": uniformRooms(12),
  };

  for (const [code, defs] of Object.entries(ROOM_DEFS)) {
    const oid = outletIdByCode[code];
    const rows = defs.map(([name, type, capacity, status], i) => ({
      outlet_id: oid,
      code: `RM-${String(i + 1).padStart(2, "0")}`,
      name,
      type,
      capacity,
      supported_services: REAL_SUPPORTED_SERVICES,
      status,
      cleanup_buffer_min: 10,
    }));
    const { error } = await admin.from("rooms").upsert(rows, { onConflict: "outlet_id,code" });
    if (error) return NextResponse.json({ error: `rooms upsert (${code}): ${error.message}`, log }, { status: 500 });
    log.push(`rooms upserted for ${code} (${rows.length})`);

    // Cikawao previously had 10 rooms seeded with fictional Couple/VIP/Wet
    // Room types under codes RM-01..RM-10 (upsert above already overwrote
    // those with the corrected uniform data) — nothing further to clean up
    // since the room count only grew (10 -> 12), no stale codes remain.
  }

  // 8. outlet public profile (profile page, facilities, gallery) ------------
  const PROFILE_DEFS: Record<
    string,
    {
      published: boolean;
      tagline: string;
      description: string;
      cover_url: string;
      highlights: string[];
      facilities: { name: string; icon: string; desc: string }[];
      gallery: { label: string; src: string }[];
    }
  > = {
    "AMY-CKW": {
      published: true,
      tagline: "Pijatan berkualitas, bisa diandalkan, selalu uenaak",
      cover_url: "/img/outlets/out-001/cover.jpg",
      description:
        "Outlet Amethyst di Cikawao — pijat tradisional & refleksi dengan terapis profesional dan standar teknik yang konsisten di setiap sesi. Cocok untuk tamu yang mencari pijatan berkualitas dengan harga terjangkau di kawasan Lengkong.",
      highlights: [
        "Terapis profesional & bersertifikat",
        "Teknik pijat konsisten di setiap sesi (standar SPBU)",
        "Ruang pijat privat & nyaman",
        "Buka setiap hari, 10:00–21:30",
      ],
      facilities: [
        { name: "Lobby & Resepsionis", icon: "sparkles", desc: "Ruang tunggu nyaman di komplek ruko Cikawao Permai." },
        { name: "Ruang Pijat Privat", icon: "gem", desc: "Ruang pijat tertutup untuk kenyamanan tamu." },
        { name: "Reflexology Corner", icon: "footprints", desc: "Area khusus refleksi kaki." },
        { name: "Parkir Ruko", icon: "car", desc: "Parkir tersedia di area komplek ruko." },
      ],
      gallery: [
        { label: "Lobby & Resepsionis", src: "/img/outlets/out-001/gallery-1.jpg" },
        { label: "Ruang Pijat Privat", src: "/img/outlets/out-001/gallery-2.jpg" },
        { label: "Ruang Pijat", src: "/img/outlets/out-001/gallery-3.jpg" },
        { label: "Reflexology Corner", src: "/img/outlets/out-001/gallery-4.jpg" },
        { label: "Area Depan Ruko", src: "/img/outlets/out-001/gallery-5.jpg" },
        { label: "Area Parkir", src: "/img/outlets/out-001/gallery-6.jpg" },
      ],
    },
    // Mekarwangi: no real tagline/description/photos yet — left as an honest
    // draft (published: false, empty highlights/facilities/gallery) rather
    // than inventing marketing copy. Fill in once real content is ready.
    "AMY-MKW": {
      published: false,
      tagline: "Amethyst — Mekarwangi, Bandung",
      cover_url: "",
      description: "Outlet Amethyst di Mekarwangi, Bandung — pijat tradisional & refleksi.",
      highlights: [],
      facilities: [],
      gallery: [],
    },
  };

  for (const [code, def] of Object.entries(PROFILE_DEFS)) {
    const oid = outletIdByCode[code];
    const { facilities, gallery, ...profileFields } = def;

    const { error: profileErr } = await admin
      .from("outlet_profiles")
      .upsert({ outlet_id: oid, ...profileFields }, { onConflict: "outlet_id" });
    if (profileErr) return NextResponse.json({ error: `outlet_profiles upsert (${code}): ${profileErr.message}`, log }, { status: 500 });

    // facilities/gallery have no natural unique key — delete-then-insert keeps
    // re-runs idempotent instead of accumulating duplicates.
    await admin.from("outlet_facilities").delete().eq("outlet_id", oid);
    const { error: facErr } = await admin.from("outlet_facilities").insert(
      facilities.map((f, i) => ({ outlet_id: oid, name: f.name, icon: f.icon, description: f.desc, sort_order: i }))
    );
    if (facErr) return NextResponse.json({ error: `outlet_facilities insert (${code}): ${facErr.message}`, log }, { status: 500 });

    await admin.from("outlet_gallery_photos").delete().eq("outlet_id", oid);
    const { error: galErr } = await admin.from("outlet_gallery_photos").insert(
      gallery.map((g, i) => ({ outlet_id: oid, label: g.label, url: g.src, sort_order: i }))
    );
    if (galErr) return NextResponse.json({ error: `outlet_gallery_photos insert (${code}): ${galErr.message}`, log }, { status: 500 });

    log.push(`outlet profile (+facilities/gallery) upserted for ${code}`);
  }

  // 9. real therapist roster (module: employees) ----------------------------
  // Names are real — read directly off the Telegram "Amethyst Bandung"
  // channel's "ABSEN HARI INI / SQUAD TODAY" posts for 20 Agustus 2026.
  // Several fields have NO real source data yet and are explicit, flagged
  // placeholders per the user's own instructions (chat, 2026-08-20):
  //   - join_date: today's date for everyone (real join dates unknown).
  //   - base_salary / fixed_allowance: 0 (real pay not disclosed yet).
  //   - contract_type: user said "lepas" (freelance) — the DB enum has no
  //     literal freelance option (`Tetap` permanent / `Kontrak` fixed-term /
  //     `Harian` daily-casual), so this maps to the closest fit, `Harian`.
  //   - phone / email: fabricated placeholders ("buat saja ngasal dulu" —
  //     user's own words) — NOT real contact info, purely so the columns
  //     aren't empty. Replace with real data before this goes live.
  //   - therapist_grade: still a flat `Junior` placeholder. The real
  //     "Amethyst Massage Skill" infographic (re-supplied 2026-08-20,
  //     Cikawao 10 named + 2 "coming soon" slots, Mekarwangi 11 named + 1
  //     "coming soon" slot) shows a 4-tier "RANK 1–4 MASSAGE" badge
  //     ("Recommended Massage") on a handful of therapists, plus a
  //     separate "POWER" attribute (Medium / Medium Strong / Strong) on
  //     EVERY therapist — neither maps cleanly onto the DB's 3-tier
  //     Junior/Senior/Master `therapist_grade` enum (RANK looks like a
  //     "featured/recommended" ranking, not a seniority ladder, and
  //     guessing a mapping would be fabricating data this project has
  //     deliberately avoided everywhere else — see the placeholder
  //     discipline notes throughout this file). Leaving `therapist_grade`
  //     alone; POWER/RANK need their own columns (not yet migrated) if
  //     they're wanted as real, queryable fields later.
  //   - Note the roster below DROPS "Erin" (Cikawao) from the previous
  //     absen-based list — she does not appear anywhere in the real skill
  //     infographic, so she's not carried into the corrected roster. If an
  //     "Erin" row already exists in the DB from an earlier seed run, this
  //     upsert-by-code loop does not delete it (upserts never delete) —
  //     remove her employees row manually if she's not a real Amethyst
  //     therapist.
  //   - skills: REAL_SUPPORTED_SERVICES (the outlet-wide real service line)
  //     PLUS each therapist's own "UNIQUE SKILLS" from the infographic.
  //     REAL_SUPPORTED_SERVICES is kept in every array on purpose — it's
  //     what app/customer/book/page.tsx's `t.skills.includes(p.requiredSkill)`
  //     filter matches against for the one real package; dropping it would
  //     silently make every therapist ineligible for the only real booking
  //     flow that exists.
  const THERAPIST_SKILLS: Record<string, string[]> = {
    // Amethyst Cikawao (POWER noted in comment; RANK badge = "Recommended
    // Massage", not every therapist has one)
    Amelia: ["Teknik Siku"], // POWER Medium
    Astrid: ["Head Massage"], // POWER Strong, RANK 2 MASSAGE
    Ayu: ["Teknik Siku", "Head Massage"], // POWER Medium Strong
    Dewi: ["Head Massage"], // POWER Medium Strong
    Indah: ["Basic Skill SOP"], // POWER Medium
    Lusi: ["Head Massage"], // POWER Strong, RANK 3 MASSAGE
    Maya: ["Basic Skill SOP"], // POWER Medium Strong
    Putri: ["Head Massage", "Refleksi Kaki"], // POWER Strong, RANK 4 MASSAGE
    Risma: ["Head Massage"], // POWER Strong, RANK 1 MASSAGE
    Zahra: ["Basic Skill SOP"], // POWER Medium
    // Amethyst Mekarwangi
    Ana: ["Teknik Siku", "Advanced Shiatsu", "Head Massage", "Totok Wajah"], // POWER Medium Strong, RANK 3 MASSAGE
    Bunga: ["Head Massage"], // POWER Medium Strong
    Fira: ["Basic Skill SOP"], // POWER Medium
    Iis: ["Teknik Siku", "Advanced Shiatsu", "Head Massage", "Kerokan"], // POWER Strong, RANK 1 MASSAGE
    Indri: ["Basic Skill SOP"], // POWER Medium
    Intan: ["Teknik Siku", "Advanced Shiatsu", "Head Massage", "Kerokan"], // POWER Strong, RANK 2 MASSAGE
    Jessy: ["Basic Skill SOP"], // POWER Medium
    Keyla: ["Head Massage", "Kerokan"], // POWER Strong, RANK 4 MASSAGE
    Silvy: ["Head Massage", "Kerokan"], // POWER Medium Strong
    Rara: ["Basic Skill SOP"], // POWER Medium
    Via: ["Head Massage", "Kerokan"], // POWER Medium Strong
  };

  const THERAPIST_ROSTER: { name: string; outletCode: string }[] = [
    ...["Amelia", "Astrid", "Ayu", "Dewi", "Indah", "Risma", "Lusi", "Maya", "Putri", "Zahra"].map((name) => ({
      name,
      outletCode: "AMY-CKW",
    })),
    ...["Ana", "Bunga", "Fira", "Iis", "Indri", "Intan", "Jessy", "Keyla", "Rara", "Silvy", "Via"].map((name) => ({
      name,
      outletCode: "AMY-MKW",
    })),
  ];

  const todayIso = new Date().toISOString().slice(0, 10);
  const branchSeq: Record<string, number> = {};
  let employeesCreated = 0;
  let employeesUpdated = 0;

  for (const t of THERAPIST_ROSTER) {
    const oid = outletIdByCode[t.outletCode];
    const branchShort = t.outletCode.replace("AMY-", ""); // CKW / MKW
    branchSeq[branchShort] = (branchSeq[branchShort] ?? 0) + 1;
    const seq = String(branchSeq[branchShort]).padStart(2, "0");
    const code = `TRP-${branchShort}-${seq}`;
    const slug = t.name.toLowerCase().replace(/[^a-z]/g, "");
    // Fabricated placeholder contact info — not real, see comment above.
    const phone = `0812-${branchShort === "CKW" ? "71" : "72"}${seq}-${String(1000 + branchSeq[branchShort]).slice(-4)}`;
    const email = `${slug}.${branchShort.toLowerCase()}@amethyst.test`;

    const employeeFields = {
      tenant_id: tenantId,
      outlet_id: oid,
      code,
      name: t.name,
      job_role: "Terapis" as const,
      join_date: todayIso, // placeholder — real join date unknown, see comment above
      status: "ACTIVE" as const,
      contract_type: "Harian" as const, // closest enum match to user's "lepas" (freelance) — see comment above
      base_salary: 0,
      fixed_allowance: 0,
      is_therapist: true,
      skills: [...REAL_SUPPORTED_SERVICES, ...(THERAPIST_SKILLS[t.name] ?? [])], // real service line + real per-therapist unique skills — see comment above
      therapist_grade: "Junior" as const, // placeholder — see comment above
      phone, // fabricated placeholder — see comment above
      email, // fabricated placeholder — see comment above
      // Real headshots (round 7 follow-up) — user supplied one cropped photo
      // per real therapist, saved at public/img/therapists/<branch>/<slug>.jpg
      // using this exact same slug convention. Requires the 0003 migration
      // (adds employees.photo_url) to have been run first.
      photo_url: `/img/therapists/${branchShort}/${slug}.jpg`,
    };

    const { data: existingTherapist } = await admin
      .from("employees")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", code)
      .maybeSingle();

    if (existingTherapist) {
      const { error } = await admin.from("employees").update(employeeFields).eq("id", existingTherapist.id);
      if (error) return NextResponse.json({ error: `therapist update (${t.name}): ${error.message}`, log }, { status: 500 });
      employeesUpdated++;
    } else {
      const { error } = await admin.from("employees").insert(employeeFields);
      if (error) return NextResponse.json({ error: `therapist insert (${t.name}): ${error.message}`, log }, { status: 500 });
      employeesCreated++;
    }
  }
  // --- Retire therapist rows the roster no longer contains ---------------
  //
  // This loop matches on the sequential CODE, not the name, so shortening
  // the roster shifts every name up one code and STRANDS the highest one
  // with whatever name was last written to it. That is exactly how a
  // second "Zahra" appeared: the roster used to be 11 for Cikawao
  // (including "Erin"); dropping Erin moved Zahra from TRP-CKW-11 to
  // TRP-CKW-10, and TRP-CKW-11 was never visited again. Two ACTIVE rows
  // with the same name means the booking form offers the guest a choice
  // between two of the same person, and payroll later cuts two payslips.
  //
  // Deactivated, never deleted: a stray row may already carry real
  // bookings, sessions, or commission entries. `bookings.therapist_id` is
  // ON DELETE SET NULL, so deleting would silently detach a real booking
  // from the therapist who performed it — losing history to tidy up a
  // list. INACTIVE keeps the record and its links while removing it from
  // every picker.
  const validCodes = new Set<string>();
  const seqCheck: Record<string, number> = {};
  for (const t of THERAPIST_ROSTER) {
    const branchShort = t.outletCode.replace("AMY-", "");
    seqCheck[branchShort] = (seqCheck[branchShort] ?? 0) + 1;
    validCodes.add(`TRP-${branchShort}-${String(seqCheck[branchShort]).padStart(2, "0")}`);
  }

  const { data: allTherapists } = await admin
    .from("employees")
    .select("id, code, name, status")
    .eq("tenant_id", tenantId)
    .eq("is_therapist", true);

  const strays = (allTherapists ?? []).filter(
    (e) => e.code?.startsWith("TRP-") && !validCodes.has(e.code) && e.status === "ACTIVE"
  );

  if (strays.length) {
    const { error: retireErr } = await admin
      .from("employees")
      .update({ status: "INACTIVE" })
      .in("id", strays.map((e) => e.id));
    if (retireErr) {
      return NextResponse.json({ error: `retire stray therapists: ${retireErr.message}`, log }, { status: 500 });
    }
    log.push(
      `retired ${strays.length} stray therapist row(s) not in the current roster: ${strays
        .map((e) => `${e.code} (${e.name})`)
        .join(", ")}`
    );
  }

  log.push(`therapist roster: ${employeesCreated} created, ${employeesUpdated} updated (${THERAPIST_ROSTER.length} total)`);

  // 9c. re-point the therapist test login at a REAL roster therapist -------
  //
  // The staff loop above (section 4) links terapis@… to employee TRP-005
  // "Melati Puspita" — a demo persona from the mock era. The retire sweep
  // that just ran correctly sets her INACTIVE, since she is not on
  // Amethyst's real roster. But that leaves the therapist login pointing
  // at a retired employee, and everything downstream reads the login's
  // employee_id: runPayroll only builds payslips for ACTIVE staff, so
  // /therapist/payslip would say "belum ada slip" forever no matter how
  // many times payroll ran. The login would look broken while the payroll
  // module was in fact working.
  //
  // Deterministic choice, not a favourite: the FIRST therapist of the
  // primary outlet's roster by code (TRP-CKW-01). Picking by "who has the
  // most commission" would make the test account hop between real people
  // as the data changes, which is worse for reproducing a bug.
  //
  // Only the login's employee_id moves. The employee rows themselves are
  // untouched, and Melati Puspita stays INACTIVE rather than being
  // deleted — she may already be attached to old bookings.
  const therapistLoginEmail = `terapis@${EMAIL_DOMAIN}`;
  const primaryTherapistCode = [...validCodes].filter((c) => c.startsWith("TRP-CKW-")).sort()[0];
  if (primaryTherapistCode) {
    const { data: realTherapist } = await admin
      .from("employees")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("code", primaryTherapistCode)
      .maybeSingle();

    if (realTherapist) {
      const { data: therapistLogin } = await admin
        .from("app_users")
        .select("id, employee_id")
        .eq("email", therapistLoginEmail)
        .maybeSingle();

      if (therapistLogin && therapistLogin.employee_id !== realTherapist.id) {
        const { error: repointErr } = await admin
          .from("app_users")
          .update({ employee_id: realTherapist.id, name: realTherapist.name })
          .eq("id", therapistLogin.id);
        if (repointErr) {
          return NextResponse.json({ error: `repoint therapist login: ${repointErr.message}`, log }, { status: 500 });
        }
        log.push(
          `therapist login ${therapistLoginEmail} re-pointed to ${primaryTherapistCode} (${realTherapist.name}) — was a retired/demo employee`
        );
      }
    }
  }

  // 10. real service catalog (module: booking, prerequisite) ----------------
  // Real pricing per the user (chat, 2026-08-20): Amethyst currently has
  // exactly ONE combined package — "Traditional Massage / Basic Shiatsu +
  // Therapy PM", 90 minutes, Rp180.000 — plus one extension option, 30
  // minutes for Rp50.000 (both numbers and the extension duration are real,
  // confirmed by the user). Fields the user did NOT give real numbers for
  // are seeded as explicit, flagged placeholders (same discipline as the
  // employee roster above):
  //   - member_price / weekend_price: no membership or weekend-surcharge
  //     policy given yet — set equal to list_price (Rp180.000) as a
  //     placeholder, NOT a real "no discount" business decision.
  //   - commission_value (package) / commission (extension): no commission
  //     structure given yet — set to 0, placeholder.
  //   - buffer_after_min: 10, matching the real 10-minute cleanup buffer
  //     already set on the rooms (section 7) — a reasonable carry-over
  //     assumption, not independently confirmed for this package.
  //   - materials: left empty — no real consumables list confirmed yet
  //     (see REAL_SUPPORTED_SERVICES for the confirmed service names only).
  let { data: realCategory } = await admin
    .from("service_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "Pijat Tradisional & Refleksi")
    .maybeSingle();
  if (!realCategory) {
    const { data, error } = await admin
      .from("service_categories")
      .insert({
        tenant_id: tenantId,
        name: "Pijat Tradisional & Refleksi",
        icon: "hand",
        description: "Layanan inti Amethyst: Traditional Massage, Basic Shiatsu, dan Therapy PM.",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: `real category insert: ${error.message}`, log }, { status: 500 });
    realCategory = data;
    log.push("real service category created");
  }
  const realCategoryId = realCategory!.id as string;

  let { data: realServiceType } = await admin
    .from("service_types")
    .select("id")
    .eq("category_id", realCategoryId)
    .eq("name", "Traditional Massage / Basic Shiatsu + Therapy PM")
    .maybeSingle();
  if (!realServiceType) {
    const { data, error } = await admin
      .from("service_types")
      .insert({
        category_id: realCategoryId,
        name: "Traditional Massage / Basic Shiatsu + Therapy PM",
        required_skill: "Traditional Massage", // anchor value — matches employees.skills (section 9) so eligibility checks work
        description: "Satu paket gabungan sesuai SOP Amethyst saat ini.",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: `real service type insert: ${error.message}`, log }, { status: 500 });
    realServiceType = data;
    log.push("real service type created");
  }
  const realServiceTypeId = realServiceType!.id as string;

  const realPackageIdByOutlet: Record<string, string> = {};
  const realExtensionIdByOutlet: Record<string, string> = {};

  for (const outletCode of ["AMY-CKW", "AMY-MKW"]) {
    const oid = outletIdByCode[outletCode];

    // Commission fields (commission_type/commission_value here, commission_type/
    // commission on the extension below) are split out from the rest and only
    // ever written on INSERT, never on UPDATE. Reason: /manager/catalog has a
    // real editor (updatePackagePricing/updateExtensionPricing,
    // lib/actions/catalog.ts) that a manager uses to set the actual commission
    // — that's how the package's real Rp55.000-fixed rate got configured
    // (confirmed live, see the roadmap doc). Before this fix, re-running
    // dev-seed would silently stomp that back to the seed-time placeholder
    // (was `commission_type: "percent", commission_value: 0` — WRONG unit
    // AND wrong value) on every run. dev-seed's job is to guarantee the row
    // exists, not to keep re-asserting a business decision someone already
    // made through the UI.
    const packageIdentityFields = {
      outlet_id: oid,
      service_type_id: realServiceTypeId,
      name: "Traditional Massage / Basic Shiatsu + Therapy PM 90'",
      duration_min: 90, // real
      list_price: 180_000, // real
      member_price: 180_000, // placeholder — see comment above
      weekend_price: 180_000, // placeholder — see comment above
      room_type: "Massage" as const,
      required_skill: "Traditional Massage",
      buffer_before_min: 0,
      buffer_after_min: 10, // assumption — see comment above
      extension_allowed: true,
      status: "ACTIVE" as const,
      materials: [] as { name: string; qty: string }[],
    };
    // Real, confirmed 2026-08-21: Rp55.000 per treatment, flat rupiah — only
    // applied when the row is first created (see comment above).
    const packageCommissionFields = { commission_type: "fixed" as const, commission_value: 55_000 };

    let { data: existingPkg } = await admin
      .from("service_packages")
      .select("id, commission_type, commission_value")
      .eq("outlet_id", oid)
      .eq("service_type_id", realServiceTypeId)
      .maybeSingle();
    if (existingPkg) {
      // One-time correction, not a standing overwrite: the row was created
      // before the real commission was known (seed-time placeholder was
      // `percent`/0 — wrong unit AND wrong value), so it still needs fixing
      // once. Detected by "still percent-typed", since a manager who
      // genuinely configured a percent-based rule via the UI would never
      // coincidentally match `commission_type: "percent"` AND leave the
      // package otherwise untouched by this route. Once it's `fixed`
      // (whether from this correction or a manager's own edit), never
      // touched again.
      const stillPlaceholder = existingPkg.commission_type === "percent";
      const updatePayload = stillPlaceholder ? { ...packageIdentityFields, ...packageCommissionFields } : packageIdentityFields;
      if (stillPlaceholder) log.push(`package commission corrected to real rate for ${outletCode} (was percent/0 placeholder)`);
      const { error } = await admin.from("service_packages").update(updatePayload).eq("id", existingPkg.id);
      if (error) return NextResponse.json({ error: `real package update (${outletCode}): ${error.message}`, log }, { status: 500 });
    } else {
      const { data, error } = await admin
        .from("service_packages")
        .insert({ ...packageIdentityFields, ...packageCommissionFields })
        .select("id, commission_type, commission_value")
        .single();
      if (error) return NextResponse.json({ error: `real package insert (${outletCode}): ${error.message}`, log }, { status: 500 });
      existingPkg = data;
    }
    realPackageIdByOutlet[outletCode] = existingPkg!.id as string;

    const extensionIdentityFields = {
      outlet_id: oid,
      name: "Extension 30 Menit",
      duration_min: 30, // real
      price: 50_000, // real
      active: true,
    };
    // Real, confirmed 2026-08-21: Rp15.000 per extension sold, flat rupiah —
    // same "only on INSERT" rule as the package above.
    const extensionCommissionFields = { commission_type: "fixed" as const, commission: 15_000 };

    let { data: existingExt } = await admin
      .from("extension_options")
      .select("id, commission")
      .eq("outlet_id", oid)
      .eq("name", "Extension 30 Menit")
      .maybeSingle();
    if (existingExt) {
      // Same one-time-correction rule as the package above: commission was
      // seeded 0 (placeholder) before the real Rp15.000 rate was known.
      // `commission === 0` reads as "never configured" per this project's
      // own "belum diatur ≠ nol" convention, so correcting it once here is
      // consistent, not presumptuous — and once it's nonzero, whether from
      // this correction or a manager's own edit, this never touches it again.
      const stillPlaceholder = Number(existingExt.commission) === 0;
      const updatePayload = stillPlaceholder ? { ...extensionIdentityFields, ...extensionCommissionFields } : extensionIdentityFields;
      if (stillPlaceholder) log.push(`extension commission corrected to real rate for ${outletCode} (was 0 placeholder)`);
      const { error } = await admin.from("extension_options").update(updatePayload).eq("id", existingExt.id);
      if (error) return NextResponse.json({ error: `real extension update (${outletCode}): ${error.message}`, log }, { status: 500 });
    } else {
      const { data, error } = await admin
        .from("extension_options")
        .insert({ ...extensionIdentityFields, ...extensionCommissionFields })
        .select("id, commission")
        .single();
      if (error) return NextResponse.json({ error: `real extension insert (${outletCode}): ${error.message}`, log }, { status: 500 });
      existingExt = data;
    }
    realExtensionIdByOutlet[outletCode] = existingExt!.id as string;

    const { error: linkErr } = await admin
      .from("service_package_allowed_extensions")
      .upsert(
        { package_id: realPackageIdByOutlet[outletCode], extension_id: realExtensionIdByOutlet[outletCode] },
        { onConflict: "package_id,extension_id" }
      );
    if (linkErr) return NextResponse.json({ error: `package<->extension link (${outletCode}): ${linkErr.message}`, log }, { status: 500 });

    log.push(`real catalog upserted for ${outletCode} (1 package, 1 extension)`);

    // Referral promo "Ajak Teman" (user, 2026-08-21): a new customer gets
    // Rp30.000 off their first transaction — same "new customer only"
    // shape as WELCOME50 in the old mock catalog screen, now a REAL
    // redeemable voucher (see lib/actions/transactions.ts's payForSession,
    // which validates the code, checks new_customers_only against the
    // customer's transaction history, and applies discount_amount).
    // Matched by `code` (not name), and only INSERTED if missing — a
    // manager who edits this promo later via /manager/promotions (once
    // that page grows write support) must not have it silently reset on
    // the next dev-seed run, same rule as the catalog commission fields
    // above.
    const { data: existingPromo } = await admin
      .from("promotions")
      .select("id")
      .eq("outlet_id", oid)
      .eq("code", "AJAKTEMAN30")
      .maybeSingle();
    if (!existingPromo) {
      const { error: promoErr } = await admin.from("promotions").insert({
        outlet_id: oid,
        name: "Ajak Teman",
        type: "Voucher",
        code: "AJAKTEMAN30",
        value: "Rp30.000 untuk teman baru",
        discount_amount: 30_000,
        new_customers_only: true,
        valid_from: "2026-01-01",
        valid_to: "2030-12-31",
        usage_count: 0,
        max_usage: null,
        status: "ACTIVE",
      });
      if (promoErr) return NextResponse.json({ error: `referral promo insert (${outletCode}): ${promoErr.message}`, log }, { status: 500 });
      log.push(`referral promo "AJAKTEMAN30" created for ${outletCode}`);
    }
  }

  // 11. example customers (10, clearly placeholder — module: booking) -------
  // Per the user's explicit instruction (chat, 2026-08-20): 10 example
  // customers so booking/customer-facing pages have something to show
  // during setup/demo, rather than starting genuinely empty. Names are
  // generic Indonesian placeholder names — NOT real Amethyst guests. Phone
  // numbers are a distinct, obviously-fabricated series (+62 813-9500-xxxx)
  // so they're never confused with real contact info or the staff/therapist
  // placeholder numbers from section 9.
  const EXAMPLE_CUSTOMERS = [
    "Siti Rahayu", "Budi Hartono", "Rina Wulandari", "Agus Setiawan", "Dewi Lestari",
    "Fajar Nugraha", "Yulia Anggraini", "Rizky Ramadhan", "Nadia Permata", "Hendra Kusuma",
  ];

  let customersCreated = 0;
  let customersUpdated = 0;

  for (let i = 0; i < EXAMPLE_CUSTOMERS.length; i++) {
    const name = EXAMPLE_CUSTOMERS[i];
    const phone = `+62 813-9500-${String(1000 + i).slice(-4)}`;
    const slug = name.toLowerCase().replace(/[^a-z]/g, ".");

    const customerFields = {
      tenant_id: tenantId,
      name,
      phone,
      email: `${slug}@example-customer.test`, // fabricated placeholder — not a real guest's email
      segment: "New" as const,
      membership: "None" as const,
      prepaid_balance: 0,
      loyalty_points: 0,
      marketing_consent: false,
      notes: "Data contoh (bukan tamu asli) — dibuat untuk keperluan setup/demo modul booking.",
    };

    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();

    if (existingCustomer) {
      const { error } = await admin.from("customers").update(customerFields).eq("id", existingCustomer.id);
      if (error) return NextResponse.json({ error: `example customer update (${name}): ${error.message}`, log }, { status: 500 });
      customersUpdated++;
    } else {
      const { error } = await admin.from("customers").insert(customerFields);
      if (error) return NextResponse.json({ error: `example customer insert (${name}): ${error.message}`, log }, { status: 500 });
      customersCreated++;
    }
  }
  log.push(`example customers: ${customersCreated} created, ${customersUpdated} updated (${EXAMPLE_CUSTOMERS.length} total)`);

  return NextResponse.json({
    ok: true,
    log,
    accounts: created,
    outlets: outletIdByCode,
    password: DEMO_PASSWORD,
    note: "Login di /login pakai salah satu email di atas + password ini. Ganti password sungguhan sebelum dipakai tim asli.",
  });
}
