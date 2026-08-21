"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIso } from "@/lib/wallclock";

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

export async function payForSession(sessionId: string, paymentMethod: PaymentMethod): Promise<ActionResult> {
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

  const { data: pkg } = await supabase.from("service_packages").select("name").eq("id", booking.package_id).maybeSingle();

  const { data: outlet, error: outletErr } = await supabase
    .from("outlets")
    .select("tax_pct, service_charge_pct, receipt_prefix")
    .eq("id", session.outlet_id)
    .single();
  if (outletErr || !outlet) return { ok: false, error: "Outlet tidak ditemukan." };

  const subtotal = Number(booking.price);
  const serviceCharge = Math.round((subtotal * Number(outlet.service_charge_pct)) / 100);
  const tax = Math.round(((subtotal + serviceCharge) * Number(outlet.tax_pct)) / 100);
  const total = subtotal + serviceCharge + tax;

  const paidAt = nowIso();
  const date = paidAt.slice(0, 10);

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      receipt_no: receiptNo(outlet.receipt_prefix, date),
      outlet_id: session.outlet_id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      cashier_id: cashierId,
      subtotal,
      discount: 0,
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
    unit_price: subtotal,
    therapist_id: session.therapist_id,
  });
  if (itemErr) return { ok: false, error: "Transaksi tersimpan tapi item gagal disimpan — hubungi admin." };

  const { error: bookingUpdateErr } = await supabase.from("bookings").update({ status: "PAID" }).eq("id", booking.id);
  if (bookingUpdateErr) return { ok: false, error: "Transaksi tersimpan tapi status booking gagal diupdate." };

  revalidatePath("/kasir/sessions");
  revalidatePath("/manager/sessions");
  revalidatePath("/kasir/receipts");
  revalidatePath("/manager/bookings");

  return { ok: true };
}
