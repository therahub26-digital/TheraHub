"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addMin } from "@/lib/format";
import { notifyTherapist } from "@/lib/notify";

// ---------------------------------------------------------------------
// Server Action: createBooking — the write half of the booking module.
// lib/data/bookings.ts (read-only) already reads real rows once they
// exist; this is what actually makes them exist. Runs as the signed-in
// staff user (createClient(), not the admin/service-role client), so
// every write is still governed by 0002_rls_policies.sql's
// `bookings_staff` / `customers_staff_manage` policies — a kasir/manager
// can only write within their own outlet/tenant, same as every read.
//
// Conflict rule: a therapist can only be in one ACTIVE booking at a
// time. "Active" deliberately excludes CANCELLED/NO_SHOW/COMPLETED — a
// cancelled slot must free up the therapist for a new booking.
// Overlap is checked in JS on the (small, same-day, same-outlet) result
// set rather than a Postgres range-overlap query, since scheduled_start/
// scheduled_end are plain timestamptz and this keeps the check readable;
// revisit with a DB-level exclusion constraint if booking volume ever
// makes the day/outlet slice large enough for a race condition to matter.
//
// NO ROOM AT BOOKING TIME — decided 2026-08-21. A room is picked live at
// check-in (checkInBooking, lib/actions/sessions.ts) from whatever is
// actually free that moment, not reserved days ahead. The therapist a
// guest books IS the service they're buying, so it has to be locked in
// advance; which of the outlet's interchangeable rooms they end up in
// does not, and locking one in advance only manufactured false
// conflicts (a room "booked" for 2pm that's actually been empty since
// 1:45 because the prior session ran short). `bookings.room_id` stays
// nullable through BOOKED/CONFIRMED/ARRIVED and gets filled in exactly
// once, at check-in.
// ---------------------------------------------------------------------

const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SESSION"];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type CreateBookingInput = {
  outletId: string;
  customerName: string;
  customerPhone: string;
  packageId: string;
  therapistId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  notes?: string;
  source: "Walk-in" | "Kasir" | "Phone" | "WhatsApp";
};

export type CreateBookingResult = { ok: true; bookingId: string } | { ok: false; error: string };

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (!customerName || !customerPhone) {
    return { ok: false, error: "Nama dan nomor telepon tamu wajib diisi." };
  }
  if (!input.packageId || !input.therapistId) {
    return { ok: false, error: "Layanan dan terapis wajib dipilih." };
  }

  // Resolve the signed-in staff member's tenant — needed to create a new
  // customer row under the right tenant when the phone number is new.
  const { data: staffRow, error: staffErr } = await supabase
    .from("app_users")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (staffErr || !staffRow?.tenant_id) {
    return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
  }
  const tenantId = staffRow.tenant_id as string;

  const { data: pkg, error: pkgErr } = await supabase
    .from("service_packages")
    .select("id, name, duration_min, list_price")
    .eq("id", input.packageId)
    .single();
  if (pkgErr || !pkg) return { ok: false, error: "Paket layanan tidak ditemukan." };

  const scheduledEndHHMM = addMin(input.startTime, pkg.duration_min);
  const startIso = `${input.date}T${input.startTime}:00+00:00`;
  const endIso = `${input.date}T${scheduledEndHHMM}:00+00:00`;

  const { data: sameDayBookings, error: sameDayErr } = await supabase
    .from("bookings")
    .select("id, therapist_id, scheduled_start, scheduled_end")
    .eq("outlet_id", input.outletId)
    .eq("date", input.date)
    .eq("therapist_id", input.therapistId)
    .in("status", ACTIVE_STATUSES);
  if (sameDayErr) return { ok: false, error: "Gagal memeriksa jadwal yang sudah ada — coba lagi." };

  const conflict = (sameDayBookings ?? []).find((b) => overlaps(startIso, endIso, b.scheduled_start, b.scheduled_end));
  if (conflict) {
    return { ok: false, error: "Terapis ini sudah punya booking lain di jam tersebut. Pilih terapis atau jam lain." };
  }

  // Find an existing customer by phone within this tenant, else create one.
  let customerId: string;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", customerPhone)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error: newCustomerErr } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenantId,
        name: customerName,
        phone: customerPhone,
        segment: "New",
        membership: "None",
        prepaid_balance: 0,
        loyalty_points: 0,
        marketing_consent: false,
        avatar_tone: "sky",
      })
      .select("id")
      .single();
    if (newCustomerErr || !newCustomer) return { ok: false, error: "Gagal menyimpan data tamu baru — coba lagi." };
    customerId = newCustomer.id;
  }

  const code = `BK-${input.date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      code,
      outlet_id: input.outletId,
      customer_id: customerId,
      therapist_id: input.therapistId,
      room_id: null, // assigned live at check-in — see file header
      package_id: input.packageId,
      duration_min: pkg.duration_min,
      price: pkg.list_price,
      date: input.date,
      scheduled_start: startIso,
      scheduled_end: endIso,
      status: "BOOKED",
      source: input.source,
      notes: input.notes || null,
      add_on_ids: [],
    })
    .select("id")
    .single();

  if (insertErr || !booking) return { ok: false, error: "Gagal menyimpan booking — coba lagi." };

  // "ada bookingan baru" — user feedback 2026-08-23. Best-effort; see
  // lib/notify.ts's header for why this never fails the booking itself.
  await notifyTherapist(supabase, input.therapistId, {
    type: "booking.new",
    title: "Booking baru",
    body: `${customerName} · ${pkg.name} · ${input.date} ${input.startTime}`,
  });

  revalidatePath("/manager/bookings");
  revalidatePath("/kasir");

  return { ok: true, bookingId: booking.id };
}

// ---------------------------------------------------------------------
// Staff-side cancel/reassign — added 2026-08-22 for the daily off/leave
// reconciliation workflow (components/ScheduleCheckPage.tsx): a manager
// or kasir marks a therapist OFF/LEAVE for today, sees which of that
// therapist's own bookings today are affected, and for each one either
// reassigns it to a different available therapist or cancels it
// outright. Distinct from cancelCustomerBooking() (lib/actions/
// customerBookings.ts) — this is a STAFF action, not gated to "the
// booking's own customer," and reuses the same conflict-check shape as
// createBooking() above for the reassign case.
// ---------------------------------------------------------------------

const STAFF_CANCELLABLE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED"];

export type ActionResultBooking = { ok: true } | { ok: false; error: string };

export async function cancelBookingStaff(bookingId: string): Promise<ActionResultBooking> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: booking, error: fetchErr } = await supabase.from("bookings").select("id, status").eq("id", bookingId).maybeSingle();
  if (fetchErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!STAFF_CANCELLABLE_STATUSES.includes(booking.status)) {
    return { ok: false, error: "Booking ini sudah tidak bisa dibatalkan (sudah check-in/selesai)." };
  }

  // RLS's bookings_staff policy already scopes this UPDATE to the staff
  // member's own outlet/tenant — nothing more to check here.
  const { error: updateErr } = await supabase.from("bookings").update({ status: "CANCELLED" }).eq("id", bookingId);
  if (updateErr) return { ok: false, error: "Gagal membatalkan booking — coba lagi." };

  revalidatePath("/manager/bookings");
  revalidatePath("/manager/schedule-check");
  revalidatePath("/kasir");
  revalidatePath("/kasir/schedule-check");
  revalidatePath("/customer/history");
  return { ok: true };
}

export async function reassignBookingTherapist(bookingId: string, newTherapistId: string): Promise<ActionResultBooking> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("id, outlet_id, date, scheduled_start, scheduled_end, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!STAFF_CANCELLABLE_STATUSES.includes(booking.status)) {
    return { ok: false, error: "Booking ini sudah tidak bisa diubah (sudah check-in/selesai)." };
  }

  const { data: newTherapist, error: therapistErr } = await supabase
    .from("employees")
    .select("id, outlet_id, is_therapist, status")
    .eq("id", newTherapistId)
    .maybeSingle();
  if (
    therapistErr ||
    !newTherapist ||
    !newTherapist.is_therapist ||
    newTherapist.outlet_id !== booking.outlet_id ||
    newTherapist.status !== "ACTIVE"
  ) {
    return { ok: false, error: "Terapis pengganti tidak tersedia di outlet ini." };
  }

  const { data: sameDayBookings, error: sameDayErr } = await supabase
    .from("bookings")
    .select("id, therapist_id, scheduled_start, scheduled_end")
    .eq("outlet_id", booking.outlet_id)
    .eq("date", booking.date)
    .eq("therapist_id", newTherapistId)
    .neq("id", bookingId)
    .in("status", ACTIVE_STATUSES);
  if (sameDayErr) return { ok: false, error: "Gagal memeriksa jadwal terapis pengganti — coba lagi." };

  const conflict = (sameDayBookings ?? []).find((b) => overlaps(booking.scheduled_start, booking.scheduled_end, b.scheduled_start, b.scheduled_end));
  if (conflict) {
    return { ok: false, error: "Terapis pengganti sudah punya booking lain di jam yang sama." };
  }

  const { error: updateErr } = await supabase.from("bookings").update({ therapist_id: newTherapistId }).eq("id", bookingId);
  if (updateErr) return { ok: false, error: "Gagal mengganti terapis — coba lagi." };

  revalidatePath("/manager/bookings");
  revalidatePath("/manager/schedule-check");
  revalidatePath("/kasir");
  revalidatePath("/kasir/schedule-check");
  revalidatePath("/customer/history");
  return { ok: true };
}
