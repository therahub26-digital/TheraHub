"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addMin } from "@/lib/format";
import { GUEST_CHANGE_CUTOFF_MIN, guestCanStillChange, isStartInPast } from "@/lib/bookingRules";
import { getUnavailableTherapistIdsForCustomer } from "@/lib/data/scheduleExceptions";

// ---------------------------------------------------------------------
// Server Actions for the CUSTOMER-initiated half of the booking module
// (/customer/book, /customer/history's "Batalkan" button) — added
// 2026-08-22 per user request "halaman konsumen migrasi ke data real".
// Sibling to lib/actions/bookings.ts's createBooking() (the STAFF-
// initiated version used by kasir/manager's own booking form) — same
// conflict rule (a therapist can only be in one ACTIVE booking at a
// time) and the same "no room at booking time" decision (see that
// file's header for the full rationale). This version is entered by the
// customer themselves rather than a staff member typing a walk-in's
// name in, so the identity/ownership plumbing differs.
//
// ONE deliberate difference from createBooking(): the same-day conflict
// check below reads through the ADMIN (service-role) client, not the
// signed-in customer's own client. RLS's bookings_customer policy only
// lets a customer see THEIR OWN bookings (customer_id = their own id) —
// correct for privacy, but it means a customer's own client can't see
// OTHER customers' bookings for the same therapist/day to check for a
// clash. The actual INSERT below still runs through the normal
// authenticated client, so RLS's `customer_id = _current_customer_id()`
// check still applies — a customer can only ever create a booking
// attributed to themselves, the admin client is READ-ONLY here, used
// solely to see across that privacy boundary for conflict detection.
// ---------------------------------------------------------------------

const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN", "IN_SESSION"];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type CreateCustomerBookingInput = {
  outletId: string;
  packageId: string;
  therapistId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  notes?: string;
};

export type CreateCustomerBookingResult = { ok: true; bookingId: string } | { ok: false; error: string };

export async function createCustomerBooking(input: CreateCustomerBookingInput): Promise<CreateCustomerBookingResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: customerRow, error: customerErr } = await supabase
    .from("customers")
    .select("id, tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (customerErr || !customerRow) {
    return { ok: false, error: "Akun ini belum terhubung ke profil customer manapun." };
  }

  if (!input.packageId || !input.therapistId) {
    return { ok: false, error: "Layanan dan terapis wajib dipilih." };
  }

  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, tenant_id, booking_window_days")
    .eq("id", input.outletId)
    .maybeSingle();
  if (!outletRow || outletRow.tenant_id !== customerRow.tenant_id) {
    return { ok: false, error: "Outlet tidak ditemukan." };
  }

  // "booking bisa diatur admin H minus berapa, maksimal 3 hari kedepan,
  // defaultnya hanya bisa dipesan hari H" — client-side <input max> in
  // CustomerBookingForm already keeps a well-behaved browser inside this
  // window, but that's trivially bypassable (devtools, direct action call),
  // so the actual guarantee has to live here.
  const windowDays = outletRow.booking_window_days ?? 0;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const maxDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + windowDays);
  const maxDateStr = `${maxDateObj.getFullYear()}-${String(maxDateObj.getMonth() + 1).padStart(2, "0")}-${String(maxDateObj.getDate()).padStart(2, "0")}`;
  if (input.date < todayStr || input.date > maxDateStr) {
    return {
      ok: false,
      error:
        windowDays === 0
          ? "Outlet ini hanya menerima booking untuk hari ini."
          : `Booking hanya bisa dijadwalkan antara hari ini dan ${maxDateStr}.`,
    };
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from("service_packages")
    .select("id, outlet_id, duration_min, list_price")
    .eq("id", input.packageId)
    .single();
  if (pkgErr || !pkg || pkg.outlet_id !== input.outletId) {
    return { ok: false, error: "Paket layanan tidak ditemukan untuk outlet ini." };
  }

  const { data: therapistRow, error: therapistErr } = await supabase
    .from("employees")
    .select("id, outlet_id, is_therapist, status")
    .eq("id", input.therapistId)
    .maybeSingle();
  if (
    therapistErr ||
    !therapistRow ||
    !therapistRow.is_therapist ||
    therapistRow.outlet_id !== input.outletId ||
    therapistRow.status !== "ACTIVE"
  ) {
    return { ok: false, error: "Terapis tidak tersedia di outlet ini." };
  }

  // Schedule-exception guard (user repro 2026-08-23: "ayu masih bisa
  // dibooking padahal libur") — mirrors createBooking()'s guard in
  // lib/actions/bookings.ts, but reads via the admin client through
  // getUnavailableTherapistIdsForCustomer() since a customer's own
  // session client cannot see employee_schedule_exceptions at all (see
  // that function's header in lib/data/scheduleExceptions.ts for why).
  const unavailableIds = await getUnavailableTherapistIdsForCustomer([input.outletId], input.date);
  if (unavailableIds.has(input.therapistId)) {
    return { ok: false, error: "Terapis ini sedang libur/cuti pada tanggal tersebut. Pilih terapis lain." };
  }

  const scheduledEndHHMM = addMin(input.startTime, pkg.duration_min);
  const startIso = `${input.date}T${input.startTime}:00+00:00`;
  const endIso = `${input.date}T${scheduledEndHHMM}:00+00:00`;

  // See file header: this one read runs through the admin client on
  // purpose, to see across other customers' bookings for a conflict
  // check RLS would otherwise hide from this customer's own session.
  const admin = createAdminClient();
  const { data: sameDayBookings, error: sameDayErr } = await admin
    .from("bookings")
    .select("id, therapist_id, scheduled_start, scheduled_end")
    .eq("outlet_id", input.outletId)
    .eq("date", input.date)
    .eq("therapist_id", input.therapistId)
    .in("status", ACTIVE_STATUSES);
  if (sameDayErr) return { ok: false, error: "Gagal memeriksa jadwal yang sudah ada — coba lagi." };

  const conflict = (sameDayBookings ?? []).find((b) => overlaps(startIso, endIso, b.scheduled_start, b.scheduled_end));
  if (conflict) {
    return { ok: false, error: "Terapis ini sudah punya booking lain di jam tersebut. Pilih jam atau terapis lain." };
  }

  // Rule 1 (user, 2026-08-23): "booking hanya bisa dilakukan lebih dari
  // jam berjalan, tidak mungkin waktu yg sudah lewat". The date-window
  // check above only ever constrained the DAY, so "today at 08:00" was
  // still accepted at 13:00 — a booking that is a no-show the instant it
  // is created. The form now hides past slots too, but as with the
  // booking window that is a convenience, not the guarantee: this is.
  if (isStartInPast(startIso)) {
    return { ok: false, error: "Jam yang dipilih sudah lewat. Pilih jam setelah waktu sekarang." };
  }

  const code = `BK-${input.date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      code,
      outlet_id: input.outletId,
      customer_id: customerRow.id,
      therapist_id: input.therapistId,
      room_id: null, // assigned live at check-in, same as staff-created bookings
      package_id: input.packageId,
      duration_min: pkg.duration_min,
      price: pkg.list_price,
      date: input.date,
      scheduled_start: startIso,
      scheduled_end: endIso,
      status: "BOOKED",
      source: "Customer App",
      notes: input.notes || null,
      add_on_ids: [],
    })
    .select("id")
    .single();

  if (insertErr || !booking) return { ok: false, error: "Gagal menyimpan booking — coba lagi." };

  revalidatePath("/customer");
  revalidatePath("/customer/history");
  revalidatePath("/manager/bookings");
  revalidatePath("/kasir");

  return { ok: true, bookingId: booking.id };
}

export type CancelBookingResult = { ok: true } | { ok: false; error: string };

// A guest can only back out before they've actually shown up — once
// checked in (or later), cancelling client-side would desync from a
// session that may already be running. Staff-side cancellation for
// those later states, if ever needed, is a separate concern.
const CANCELLABLE_STATUSES = ["BOOKED", "CONFIRMED", "ARRIVED"];

export async function cancelCustomerBooking(bookingId: string): Promise<CancelBookingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("id, status, scheduled_start")
    .eq("id", bookingId)
    .maybeSingle();
  if (fetchErr || !booking) return { ok: false, error: "Booking tidak ditemukan." };
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return { ok: false, error: "Booking ini sudah tidak bisa dibatalkan (sudah check-in/selesai)." };
  }

  // Rule 2 (user, 2026-08-23): "budi bisa minta ganti jadwal atau
  // therapis minimal 1 jam sebelumnya". Inside the last hour the outlet
  // has already committed the therapist's slot and is about to start
  // chasing the guest by phone (see the kasir follow-up list on /kasir),
  // so a silent self-service cancellation at T-10 minutes is exactly
  // what the rule exists to prevent. The guest is pointed at the outlet
  // rather than simply blocked.
  if (!guestCanStillChange(booking.scheduled_start)) {
    return {
      ok: false,
      error: `Perubahan atau pembatalan lewat aplikasi hanya bisa sampai ${GUEST_CHANGE_CUTOFF_MIN} menit sebelum jadwal. Hubungi outlet untuk membatalkan.`,
    };
  }

  // RLS's bookings_customer policy ("for all") already ensures this UPDATE
  // can only ever touch a row where customer_id = the signed-in customer's
  // own id — nothing more to check here, the SELECT above already went
  // through the same RLS boundary.
  const { error: updateErr } = await supabase.from("bookings").update({ status: "CANCELLED" }).eq("id", bookingId);
  if (updateErr) return { ok: false, error: "Gagal membatalkan booking — coba lagi." };

  revalidatePath("/customer/history");
  revalidatePath("/customer");
  return { ok: true };
}
