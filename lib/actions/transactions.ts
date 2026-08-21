"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso } from "@/lib/wallclock";
import { commissionAmount, commissionRuleSnapshot, type CommissionType } from "@/lib/commission";

// ---------------------------------------------------------------------
// Server Action: payForSession — the write half of the Transactions/POS
// module (5th in the Fase 5 order: outlets -> employees -> booking ->
// sesi -> TRANSAKSI -> komisi -> payroll).
//
// Scope for this round: bill a single COMPLETED session as one
// transaction with one line item (the service package), matching the
// "Bayar" button already present in /kasir/sessions. This deliberately
// does NOT cover the full multi-item cart with product add-ons/discounts/
// vouchers shown in /kasir/pos's presentational mock — that is a much
// bigger feature (line-item editing, discount authorization, split
// payment) and is left out of scope, same "sengaja belum dipindah"
// pattern used for other partially-migrated pages. See the roadmap doc.
//
// Runs as the signed-in kasir's own Supabase client (never the
// service-role client), so 0002_rls_policies.sql's `transactions_staff` /
// `transaction_items_staff` policies are the real enforcement boundary.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

function receiptNo(prefix: string, date: string): string {
  // e.g. "CKW-20260821-7K2Q" — prefix + date + short random suffix.
  // Not a strictly sequential counter (would need a DB sequence/lock to
  // avoid races between concurrent kasirs); uniqueness is enforced at the
  // DB level by the `transactions.receipt_no unique` constraint, and a
  // collision here is astronomically unlikely.
  return `${prefix}-${date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export type PaymentMethod = "Cash" | "QRIS" | "Debit Card" | "Credit Card" | "Transfer" | "E-Wallet";

export async function payForSession(sessionId: string, paymentMethod: PaymentMethod, promoCode?: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  // Resolve the signed-in kasir's employee record (for cashier_id) — same
  // app_users lookup pattern as createBooking(), but reading employee_id
  // instead of tenant_id since that's what transactions.cashier_id needs.
  const { data: staffRow, error: staffErr } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (staffErr || !staffRow) {
    return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
  }
  const cashierId = (staffRow.employee_id as string | null) ?? null;

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, booking_id, outlet_id, therapist_id, status")
    .eq("id", sessionId)
    .single();
  if (sessionErr || !session) return { ok: false, error: "Sesi tidak ditemukan." };
  if (session.status !== "COMPLETED") {
    return { ok: false, error: "Hanya sesi yang sudah selesai yang bisa dibayar." };
  }

  // Guard against double-billing the same session (e.g. a double-click on
  // "Bayar" firing two requests) — a transaction already tied to this
  // booking means it's already been paid.
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("booking_id", session.booking_id)
    .maybeSingle();
  if (existingTx) return { ok: false, error: "Sesi ini sudah dibayar sebelumnya." };

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, outlet_id, customer_id, package_id, price")
    .eq("id", session.booking_id)
    .single();
  if (bookingErr || !booking) return { ok: false, error: "Booking terkait sesi ini tidak ditemukan." };

  // The package carries both the display name for the receipt line and
  // the commission rule the therapist is paid under.
  const { data: pkg } = await supabase
    .from("service_packages")
    .select("name, commission_type, commission_value")
    .eq("id", booking.package_id)
    .maybeSingle();

  const { data: outlet, error: outletErr } = await supabase
    .from("outlets")
    .select("tax_pct, service_charge_pct, receipt_prefix")
    .eq("id", session.outlet_id)
    .single();
  if (outletErr || !outlet) return { ok: false, error: "Outlet tidak ditemukan." };

  const packagePrice = Number(booking.price);

  // ---------------------------------------------------------------
  // Approved extensions (2026-08-21, "ajukan -> approve kasir ->
  // tagihan"): billed HERE, once, at payment — not when the kasir
  // approved it. An approval only means "yes, give them the extra
  // time"; it does not itself move money. Summing every APPROVED
  // extension_request tied to this session (rather than trusting
  // sessions.extension_minutes, which is only a display convenience
  // updated best-effort by approveExtension) is what makes this
  // idempotent against that column ever drifting.
  // ---------------------------------------------------------------
  const { data: approvedExtRows } = await supabase
    .from("extension_requests")
    .select("id, extension_id")
    .eq("session_id", sessionId)
    .eq("status", "APPROVED");

  type BilledExtension = { name: string; price: number; commission: number };
  const billedExtensions: BilledExtension[] = [];
  if (approvedExtRows && approvedExtRows.length > 0) {
    const extensionIds = [...new Set(approvedExtRows.map((r) => r.extension_id))];
    const { data: extensionRows } = await supabase
      .from("extension_options")
      .select("id, name, price, commission_type, commission")
      .in("id", extensionIds);
    const extensionById = new Map((extensionRows ?? []).map((e) => [e.id, e]));

    for (const row of approvedExtRows) {
      const ext = extensionById.get(row.extension_id);
      if (!ext) continue; // extension option deleted since approval — skip rather than bill an unknown price
      const price = Number(ext.price);
      const rule = { type: (ext.commission_type ?? "fixed") as CommissionType, value: Number(ext.commission ?? 0) };
      billedExtensions.push({ name: ext.name, price, commission: commissionAmount(rule, price) });
    }
  }
  const extensionTotal = billedExtensions.reduce((s, e) => s + e.price, 0);

  const subtotal = packagePrice + extensionTotal;
  const serviceCharge = Math.round((subtotal * Number(outlet.service_charge_pct)) / 100);
  const tax = Math.round(((subtotal + serviceCharge) * Number(outlet.tax_pct)) / 100);

  const paidAt = nowIso();
  const date = paidAt.slice(0, 10);

  // ---------------------------------------------------------------
  // Referral/voucher promo code (2026-08-21, "ajak teman"). Validated
  // fresh here, at the moment of payment, NOT against lib/data/
  // promotions.ts's cached display layer — usage_count and status can
  // legitimately change between the kasir's page load and this click.
  // ---------------------------------------------------------------
  let discount = 0;
  let appliedPromo: { id: string; usageCount: number } | null = null;
  if (promoCode && promoCode.trim()) {
    const code = promoCode.trim();
    const { data: promo, error: promoErr } = await supabase
      .from("promotions")
      .select("id, status, valid_from, valid_to, usage_count, max_usage, discount_amount, new_customers_only")
      .eq("outlet_id", session.outlet_id)
      .ilike("code", code)
      .maybeSingle();
    if (promoErr || !promo) return { ok: false, error: `Kode promo "${code}" tidak ditemukan di outlet ini.` };
    if (promo.status !== "ACTIVE") return { ok: false, error: `Kode promo "${code}" sedang tidak aktif.` };
    if (date < promo.valid_from || date > promo.valid_to) {
      return { ok: false, error: `Kode promo "${code}" sudah tidak berlaku untuk periode ini.` };
    }
    if (promo.max_usage !== null && promo.usage_count >= promo.max_usage) {
      return { ok: false, error: `Kuota kode promo "${code}" sudah habis.` };
    }
    // "Belum diatur ≠ nol" — a promo with no discount_amount configured
    // is catalog-only (display text like "-20%" that nothing computes
    // from yet), not a promo worth Rp0.
    if (promo.discount_amount === null) {
      return { ok: false, error: `Promo "${code}" belum punya nominal diskon yang diatur — hubungi admin/manager.` };
    }
    if (promo.new_customers_only) {
      const { data: priorTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("customer_id", booking.customer_id)
        .eq("status", "PAID")
        .limit(1)
        .maybeSingle();
      if (priorTx) {
        return { ok: false, error: `Kode promo "${code}" hanya untuk pelanggan baru — pelanggan ini sudah pernah bertransaksi di sini.` };
      }
    }
    discount = Math.min(Number(promo.discount_amount), subtotal + serviceCharge + tax);
    appliedPromo = { id: promo.id, usageCount: promo.usage_count };
  }

  const total = subtotal + serviceCharge + tax - discount;

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      receipt_no: receiptNo(outlet.receipt_prefix, date),
      outlet_id: session.outlet_id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      cashier_id: cashierId,
      subtotal,
      discount,
      tax,
      service_charge: serviceCharge,
      total,
      payment_method: paymentMethod,
      status: "PAID",
      paid_at: paidAt,
      printed_count: 0,
    })
    .select("id")
    .single();
  if (txErr || !tx) return { ok: false, error: "Gagal menyimpan transaksi — coba lagi." };

  const { error: itemErr } = await supabase.from("transaction_items").insert({
    transaction_id: tx.id,
    item_type: "SERVICE",
    name: pkg?.name ?? "Layanan",
    qty: 1,
    unit_price: packagePrice,
    therapist_id: session.therapist_id,
  });
  if (itemErr) return { ok: false, error: "Transaksi tersimpan tapi item gagal disimpan — hubungi admin." };

  if (billedExtensions.length > 0) {
    const { error: extItemErr } = await supabase.from("transaction_items").insert(
      billedExtensions.map((e) => ({
        transaction_id: tx.id,
        item_type: "EXTENSION" as const,
        name: e.name,
        qty: 1,
        unit_price: e.price,
        therapist_id: session.therapist_id,
      }))
    );
    if (extItemErr) return { ok: false, error: "Transaksi tersimpan tapi item extension gagal disimpan — hubungi admin." };
  }

  // Non-fatal on purpose, same reasoning as the commission-write below:
  // the guest has paid, the discount is already reflected on the
  // transaction total, and failing the whole action here over a counter
  // increment would invite a duplicate charge for no real benefit — the
  // worst case is `usage_count` under-counting by one, not money moving
  // wrong.
  if (appliedPromo) {
    await supabase
      .from("promotions")
      .update({ usage_count: appliedPromo.usageCount + 1 })
      .eq("id", appliedPromo.id);
  }

  const { error: bookingUpdateErr } = await supabase.from("bookings").update({ status: "PAID" }).eq("id", booking.id);
  if (bookingUpdateErr) return { ok: false, error: "Transaksi tersimpan tapi status booking gagal diupdate." };

  // ---------------------------------------------------------------
  // Commission — earned at the moment the treatment is paid for, not
  // when the session ends. Billing is the event that makes the money
  // real, and a session that is completed but never paid (walk-out,
  // void) must not put a payable on the books.
  //
  // Written here rather than derived later on the payroll screen so the
  // rule is FROZEN at the rate in force today: `rule_snapshot` stores
  // the rule as text, so if the admin later moves the package from 25%
  // to 30%, past earnings keep the rate they were actually computed
  // under instead of being silently restated.
  //
  // A missing rule (the seeded placeholder, commission_value = 0) writes
  // NO row at all. A therapist with no configured rate has genuinely
  // earned nothing recordable yet — inserting an explicit Rp0 payable
  // would look like a decision that they earn nothing, which is a claim
  // about someone's pay that nobody has actually made. The catalog
  // screen flags those packages as "Belum diatur" so the gap is visible
  // rather than silently zero.
  // ---------------------------------------------------------------
  if (session.therapist_id && pkg) {
    const rule = {
      type: (pkg.commission_type ?? "fixed") as CommissionType,
      value: Number(pkg.commission_value ?? 0),
    };
    // Basis is the PACKAGE price alone, not the combined subtotal —
    // extension commission is a separate, differently-rated line below,
    // and folding it in here would double-rate it under the package's
    // percent/fixed rule instead of the extension's own.
    const earned = commissionAmount(rule, packagePrice);

    if (earned > 0) {
      const { error: commissionErr } = await supabase.from("commission_entries").insert({
        therapist_id: session.therapist_id,
        outlet_id: session.outlet_id,
        date,
        booking_id: booking.id,
        package_name: pkg.name ?? "Layanan",
        rule_snapshot: commissionRuleSnapshot(rule, pkg.name ?? "Layanan"),
        basis_amount: packagePrice,
        amount: earned,
        status: "PENDING",
      });
      // Deliberately non-fatal: the guest has already paid and the
      // transaction is committed. Failing the whole action here would
      // tell the kasir the payment did not go through, which is false
      // and would invite a duplicate charge. The commission is
      // reconstructable from the transaction, so surface it as a warning
      // to chase rather than rolling back money that genuinely changed
      // hands.
      if (commissionErr) {
        return { ok: false, error: "Pembayaran BERHASIL, tapi komisi terapis gagal dicatat — laporkan ke admin (transaksi tidak perlu diulang)." };
      }
    }
  }

  // Extension commission — same "earned at payment, frozen rule
  // snapshot, non-fatal write" reasoning as the package commission
  // above, kept as its own commission_entries row (not folded into the
  // package row) so a therapist's history shows extension earnings as
  // their own line rather than an unexplained jump in the package's
  // usual amount.
  if (session.therapist_id && billedExtensions.length > 0) {
    const extensionCommissionTotal = billedExtensions.reduce((s, e) => s + e.commission, 0);
    if (extensionCommissionTotal > 0) {
      const label = billedExtensions.length === 1 ? billedExtensions[0].name : `${billedExtensions.length}x Extension`;
      const { error: extCommissionErr } = await supabase.from("commission_entries").insert({
        therapist_id: session.therapist_id,
        outlet_id: session.outlet_id,
        date,
        booking_id: booking.id,
        package_name: label,
        rule_snapshot: `${label}: Rp${extensionCommissionTotal.toLocaleString("id-ID")} (extension)`,
        basis_amount: extensionTotal,
        amount: extensionCommissionTotal,
        status: "PENDING",
      });
      if (extCommissionErr) {
        return { ok: false, error: "Pembayaran BERHASIL, tapi komisi extension gagal dicatat — laporkan ke admin (transaksi tidak perlu diulang)." };
      }
    }
  }

  revalidatePath("/kasir/sessions");
  revalidatePath("/manager/sessions");
  revalidatePath("/kasir/receipts");
  revalidatePath("/manager/bookings");
  revalidatePath("/therapist/commission");
  revalidatePath("/owner/payroll");

  return { ok: true };
}
