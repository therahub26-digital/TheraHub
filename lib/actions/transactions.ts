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
// Bills a single COMPLETED session as one transaction. Always includes
// the service package; adds any APPROVED extensions; and, since
// 2026-08-23, any add-on / retail product the kasir rang up at the
// counter via /kasir/pos (the `extraItems` argument below).
//
// The one-line "Bayar" button in /kasir/sessions calls this with no
// extraItems, which is exactly the old behaviour — the cart is additive,
// not a second code path. Still deliberately OUT of scope: split
// payment across methods, and free-form discount authorization (only
// promo CODES, validated server-side, can move the price).
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

/**
 * One extra line the kasir added at the POS counter, on top of the
 * treatment itself. Carries only an id and a quantity ON PURPOSE — the
 * price is ALWAYS re-read from the database below, never taken from the
 * client. A cart posted from a tampered browser can ask to buy things;
 * it can never say what they cost.
 */
export type PosExtraItem = { kind: "ADD_ON" | "PRODUCT"; id: string; qty: number };

export async function payForSession(
  sessionId: string,
  paymentMethod: PaymentMethod,
  promoCode?: string,
  extraItems?: PosExtraItem[]
): Promise<ActionResult> {
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

  // ---------------------------------------------------------------
  // POS cart extras (2026-08-23) — add-ons and retail products the
  // kasir rang up alongside the treatment.
  //
  // Every price here is re-read from the database, and every row is
  // re-checked for being sellable at THIS outlet right now. The client
  // only ever names an id and a quantity (see PosExtraItem). Products
  // that track stock are also checked for sufficient balance BEFORE the
  // transaction row is written, so a sale that would drive stock
  // negative is refused while refusing is still free — after the insert
  // the guest has paid and refusing is no longer an option.
  // ---------------------------------------------------------------
  type BilledExtra = {
    kind: "ADD_ON" | "PRODUCT";
    productId: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    /** Per-unit therapist commission. Products earn none. */
    commissionPerUnit: number;
    tracksStock: boolean;
    unitCost: number;
  };
  const billedExtras: BilledExtra[] = [];

  // Quantities are normalised, not trusted: floored to whole units (you
  // cannot sell 1.5 bottles over the counter) and capped, so a crafted
  // request cannot ring up a nine-figure line. The cap is deliberately
  // generous for a single counter sale rather than a guess at inventory —
  // stock-tracked products are separately held to their real balance below.
  const MAX_LINE_QTY = 99;
  const cleanExtras = (extraItems ?? [])
    .map((e) => ({ ...e, qty: Math.floor(e.qty) }))
    .filter((e) => Number.isFinite(e.qty) && e.qty > 0)
    .map((e) => ({ ...e, qty: Math.min(e.qty, MAX_LINE_QTY) }));
  if (cleanExtras.length > 0) {
    const addOnIds = [...new Set(cleanExtras.filter((e) => e.kind === "ADD_ON").map((e) => e.id))];
    const productIds = [...new Set(cleanExtras.filter((e) => e.kind === "PRODUCT").map((e) => e.id))];

    const [{ data: addOnRows }, { data: productRows }] = await Promise.all([
      addOnIds.length
        ? supabase
            .from("add_ons")
            .select("id, name, price, commission_type, commission, active")
            .eq("outlet_id", session.outlet_id)
            .in("id", addOnIds)
        : Promise.resolve({ data: [] as { id: string; name: string; price: number | string; commission_type: string | null; commission: number | string | null; active: boolean }[] }),
      productIds.length
        ? supabase.from("products").select("id, name, sell_price, cost_price, track_stock").in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string; sell_price: number | string | null; cost_price: number | string | null; track_stock: boolean }[] }),
    ]);

    const addOnById = new Map((addOnRows ?? []).map((a) => [a.id, a]));
    const productById = new Map((productRows ?? []).map((pr) => [pr.id, pr]));

    for (const item of cleanExtras) {
      if (item.kind === "ADD_ON") {
        const addOn = addOnById.get(item.id);
        if (!addOn) return { ok: false, error: "Ada add-on di keranjang yang tidak tersedia di outlet ini — muat ulang halaman." };
        if (!addOn.active) return { ok: false, error: `Add-on "${addOn.name}" sedang tidak aktif — hapus dari keranjang.` };
        const price = Number(addOn.price);
        const rule = { type: (addOn.commission_type ?? "fixed") as CommissionType, value: Number(addOn.commission ?? 0) };
        billedExtras.push({
          kind: "ADD_ON",
          productId: null,
          name: addOn.name,
          qty: item.qty,
          unitPrice: price,
          commissionPerUnit: commissionAmount(rule, price),
          tracksStock: false,
          unitCost: 0,
        });
      } else {
        const product = productById.get(item.id);
        if (!product) return { ok: false, error: "Ada produk di keranjang yang tidak ditemukan — muat ulang halaman." };
        // "Belum diatur ≠ nol": a product with no sell_price has never
        // been priced for sale, which is not the same as being free.
        if (product.sell_price === null) {
          return { ok: false, error: `Produk "${product.name}" belum punya harga jual — atur dulu di menu Inventori.` };
        }
        billedExtras.push({
          kind: "PRODUCT",
          productId: product.id,
          name: product.name,
          qty: item.qty,
          unitPrice: Number(product.sell_price),
          commissionPerUnit: 0,
          tracksStock: !!product.track_stock,
          unitCost: Number(product.cost_price ?? 0),
        });
      }
    }

    // Stock sufficiency, checked once per product across the whole cart
    // (the same product can legitimately appear on two lines).
    const trackedNeed = new Map<string, number>();
    for (const e of billedExtras) {
      if (e.kind === "PRODUCT" && e.tracksStock && e.productId) {
        trackedNeed.set(e.productId, (trackedNeed.get(e.productId) ?? 0) + e.qty);
      }
    }
    if (trackedNeed.size > 0) {
      const { data: stockRows } = await supabase
        .from("product_stocks")
        .select("product_id, qty")
        .eq("outlet_id", session.outlet_id)
        .in("product_id", [...trackedNeed.keys()]);
      const onHand = new Map((stockRows ?? []).map((r) => [r.product_id as string, Number(r.qty)]));
      for (const [productId, need] of trackedNeed) {
        const have = onHand.get(productId) ?? 0;
        if (have < need) {
          const name = billedExtras.find((e) => e.productId === productId)?.name ?? "Produk";
          return { ok: false, error: `Stok "${name}" tidak cukup di outlet ini (tersisa ${have}, diminta ${need}).` };
        }
      }
    }
  }

  const extrasTotal = billedExtras.reduce((sum, e) => sum + e.unitPrice * e.qty, 0);

  const subtotal = packagePrice + extensionTotal + extrasTotal;
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

  // Line items are written AFTER the transaction row exists (they need
  // its id), which opens a window where a failed item insert would leave
  // a transaction with no lines — and, worse, one that the
  // double-billing guard at the top of this function would then treat as
  // proof the session was already paid, locking the guest out of paying
  // at all. So an item failure unwinds the whole thing instead of
  // leaving it half-written. Same rollback discipline as
  // createAndCompleteStockTransfer() in lib/actions/inventory.ts, added
  // there after a half-written transfer silently destroyed real stock.
  //
  // Note this is deliberately unlike the commission / stock writes
  // further down, which stay non-fatal: those happen after the money is
  // committed and the guest is holding a receipt. Here nothing has been
  // promised yet, so unwinding is still free.
  async function rollbackTransaction() {
    await supabase.from("transaction_items").delete().eq("transaction_id", tx!.id);
    await supabase.from("transactions").delete().eq("id", tx!.id);
  }

  const { error: itemErr } = await supabase.from("transaction_items").insert({
    transaction_id: tx.id,
    item_type: "SERVICE",
    name: pkg?.name ?? "Layanan",
    qty: 1,
    unit_price: packagePrice,
    therapist_id: session.therapist_id,
  });
  if (itemErr) {
    await rollbackTransaction();
    return { ok: false, error: "Gagal menyimpan item transaksi — pembayaran dibatalkan, silakan coba lagi." };
  }

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
    if (extItemErr) {
      await rollbackTransaction();
      return { ok: false, error: "Gagal menyimpan item extension — pembayaran dibatalkan, silakan coba lagi." };
    }
  }

  if (billedExtras.length > 0) {
    const { error: extraItemErr } = await supabase.from("transaction_items").insert(
      billedExtras.map((e) => ({
        transaction_id: tx.id,
        item_type: e.kind,
        name: e.name,
        qty: e.qty,
        unit_price: e.unitPrice,
        // An add-on is performed by whoever did the treatment, so it is
        // attributed to them. A retail product is just sold over the
        // counter — attributing it to the therapist would put a service
        // line's worth of credit on a bottle of oil.
        therapist_id: e.kind === "ADD_ON" ? session.therapist_id : null,
      }))
    );
    if (extraItemErr) {
      await rollbackTransaction();
      return { ok: false, error: "Gagal menyimpan item keranjang — pembayaran dibatalkan, silakan coba lagi." };
    }
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

  // Add-on commission — same rules as the package and extension
  // commissions above (earned at payment, frozen rule snapshot, written
  // non-fatally). Its own row again, so a therapist reading their
  // history can tell add-on earnings apart from the treatment itself.
  if (session.therapist_id && billedExtras.length > 0) {
    const addOnCommissionTotal = billedExtras.reduce((sum, e) => sum + e.commissionPerUnit * e.qty, 0);
    if (addOnCommissionTotal > 0) {
      const addOnLines = billedExtras.filter((e) => e.kind === "ADD_ON");
      const label = addOnLines.length === 1 ? addOnLines[0].name : `${addOnLines.length}x Add-on`;
      const addOnBasis = addOnLines.reduce((sum, e) => sum + e.unitPrice * e.qty, 0);
      const { error: addOnCommissionErr } = await supabase.from("commission_entries").insert({
        therapist_id: session.therapist_id,
        outlet_id: session.outlet_id,
        date,
        booking_id: booking.id,
        package_name: label,
        rule_snapshot: `${label}: Rp${addOnCommissionTotal.toLocaleString("id-ID")} (add-on)`,
        basis_amount: addOnBasis,
        amount: addOnCommissionTotal,
        status: "PENDING",
      });
      if (addOnCommissionErr) {
        return { ok: false, error: "Pembayaran BERHASIL, tapi komisi add-on gagal dicatat — laporkan ke admin (transaksi tidak perlu diulang)." };
      }
    }
  }

  // Retail stock — a sold bottle has to leave the shelf. Written as the
  // same PAIR the inventory module always writes (a stock_movements row
  // for the audit trail AND a product_stocks balance update), never one
  // without the other; see lib/actions/inventory.ts for why that pairing
  // is non-negotiable here (babak ketiga belas: a half-written transfer
  // lost real stock silently).
  //
  // Session client, not the admin client: a kasir selling at their own
  // outlet is squarely inside what _is_outlet_staff already allows, so
  // there is no RLS boundary to cross and no reason to reach for the
  // service-role key.
  const soldStockLines = billedExtras.filter((e) => e.kind === "PRODUCT" && e.tracksStock && e.productId);
  if (soldStockLines.length > 0) {
    const { data: appUserRow } = await supabase.from("app_users").select("id").eq("auth_user_id", user.id).maybeSingle();
    let stockFailed = false;
    for (const line of soldStockLines) {
      const { error: moveErr } = await supabase.from("stock_movements").insert({
        outlet_id: session.outlet_id,
        product_id: line.productId,
        type: "SALE",
        qty: -line.qty, // negative: stock leaving the outlet
        unit_cost: line.unitCost,
        ref_type: "TRANSACTION",
        ref_id: tx.id,
        posted_at: paidAt,
        posted_by: appUserRow?.id ?? null,
      });
      if (moveErr) {
        stockFailed = true;
        continue;
      }
      const { data: stockRow } = await supabase
        .from("product_stocks")
        .select("qty")
        .eq("outlet_id", session.outlet_id)
        .eq("product_id", line.productId)
        .maybeSingle();
      const { error: balanceErr } = await supabase
        .from("product_stocks")
        .upsert(
          { outlet_id: session.outlet_id, product_id: line.productId, qty: Number(stockRow?.qty ?? 0) - line.qty },
          { onConflict: "outlet_id,product_id" }
        );
      if (balanceErr) stockFailed = true;
    }
    if (stockFailed) {
      // Non-fatal for the same reason as the commission writes: the
      // guest has paid and the receipt is real. Surfaced loudly instead
      // of swallowed, because a stock count that quietly drifts is
      // exactly the bug that cost this project a day in babak 13.
      return { ok: false, error: "Pembayaran BERHASIL, tapi stok produk gagal dikurangi — laporkan ke admin agar stok dikoreksi (transaksi tidak perlu diulang)." };
    }
  }

  revalidatePath("/kasir/pos");
  revalidatePath("/manager/inventory");
  revalidatePath("/kasir/sessions");
  revalidatePath("/manager/sessions");
  revalidatePath("/kasir/receipts");
  revalidatePath("/manager/bookings");
  revalidatePath("/therapist/commission");
  revalidatePath("/owner/payroll");

  return { ok: true };
}
