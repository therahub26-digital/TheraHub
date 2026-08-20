"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addMin } from "@/lib/format";

// ---------------------------------------------------------------------
// Server Action: createBooking — the write half of the booking module.
// lib/data/bookings.ts (read-only) already reads real rows once they
// exist; this is what actually makes them exist. Runs as the signed-in
// staff user (createClient(), not the admin/service-role client), so
// every write is still governed by 0002_rls_policies.sql's
// `bookings_staff` / `customers_staff_manage` policies — a kasir/manager
// can only write within their own outlet/tenant, same as every read.
//
// Conflict rule: a therapist or a room can only be in one ACTIVE booking
// at a time. "Active" deliberately excludes CANCELLED/NO_SHOW/COMPLETED —
// a cancelled slot must free up the therapist/room for a new booking.
// Overlap is checked in JS on the (small, same-day, same-outlet) result
// set rather than a Postgres range-overlap query, since scheduled_start/
// scheduled_end are plain timestamptz and this keeps the check readable;
// revisit with a DB-level exclusion constraint if booking volume ever
// makes the day/outlet slice large enough for a race condition to matter.
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
  roomId: string;
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
  if (!input.packageId || !input.therapistId || !input.roomId) {
    return { ok: false, error: "Layanan, terapis, dan room wajib dipilih." };
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
    .select("id, duration_min, list_price")
    .eq("id", input.packageId)
    .single();
  if (pkgErr || !pkg) return { ok: false, error: "Paket layanan tidak ditemukan." };

  const scheduledEndHHMM = addMin(input.startTime, pkg.duration_min);
  const startIso = `${input.date}T${input.startTime}:00+00:00`;
  const endIso = `${input.date}T${scheduledEndHHMM}:00+00:00`;

  const { data: sameDayBookings, error: sameDayErr } = await supabase
    .from("bookings")
    .select("id, therapist_id, room_id, scheduled_start, scheduled_end")
    .eq("outlet_id", input.outletId)
    .eq("date", input.date)
    .in("status", ACTIVE_STATUSES);
  if (sameDayErr) return { ok: false, error: "Gagal memeriksa jadwal yang sudah ada — coba lagi." };

  const conflict = (sameDayBookings ?? []).find((b) => {
    const sameTherapist = b.therapist_id === input.therapistId;
    const sameRoom = b.room_id === input.roomId;
    if (!sameTherapist && !sameRoom) return false;
    return overlaps(startIso, endIso, b.scheduled_start, b.scheduled_end);
  });
  if (conflict) {
    const sameTherapist = conflict.therapist_id === input.therapistId;
    return {
      ok: false,
      error: sameTherapist
        ? "Terapis ini sudah punya booking lain di jam tersebut. Pilih terapis atau jam lain."
        : "Room ini sudah dipakai booking lain di jam tersebut. Pilih room atau jam lain.",
    };
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
      room_id: input.roomId,
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

  revalidatePath("/manager/bookings");
  revalidatePath("/kasir");

  return { ok: true, bookingId: booking.id };
}
