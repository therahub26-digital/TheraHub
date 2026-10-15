"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Write layer penilaian (migrasi 0038) — dua jalur yang sengaja beda
// pemiliknya:
//
// submitCustomerReview — tamu menilai SATU kunjungan yang sudah dibayar.
//   Insert lewat client tamu sendiri; RLS customer_reviews_customer_insert
//   menjamin customer_id = dirinya, dan validasi di sini menjamin
//   booking-nya memang miliknya (SELECT lewat RLS bookings_customer),
//   statusnya PAID, dan punya terapis. UNIQUE booking_id menolak
//   penilaian kedua di level database, bukan cuma di sini.
//
// saveManagementReview — manager (atau admin/owner) menilai terapis per
//   bulan; upsert pada (employee_id, period) supaya nilai bulan yang
//   sama diperbarui, tidak ditumpuk. RLS
//   therapist_management_reviews_staff yang menegakkan siapa boleh —
//   terapis/kasir akan ditolak database meski memanggil action ini
//   langsung.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

const PERIOD_RE = /^\d{4}-\d{2}$/;

export async function submitCustomerReview(bookingId: string, rating: number, comment?: string): Promise<ActionResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Penilaian harus bintang 1 sampai 5." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: customerRow } = await supabase
    .from("customers")
    .select("id, tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customerRow) return { ok: false, error: "Akun ini belum terhubung ke profil customer manapun." };

  // SELECT lewat RLS bookings_customer — hanya booking milik tamu ini
  // sendiri yang bisa terbaca, jadi lolosnya baris di sini sekaligus
  // bukti kepemilikan.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, therapist_id, outlet_id, date")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Kunjungan tidak ditemukan." };
  if (booking.status !== "PAID") return { ok: false, error: "Penilaian hanya untuk kunjungan yang sudah selesai dibayar." };
  if (!booking.therapist_id) return { ok: false, error: "Kunjungan ini tidak tercatat terapisnya — hubungi outlet." };

  const { error: insertErr } = await supabase.from("customer_reviews").insert({
    tenant_id: customerRow.tenant_id,
    booking_id: booking.id,
    customer_id: customerRow.id,
    employee_id: booking.therapist_id,
    outlet_id: booking.outlet_id,
    visit_date: booking.date,
    rating,
    comment: comment?.trim() || null,
  });
  if (insertErr) {
    // 23505 = unique_violation pada booking_id — sudah pernah dinilai.
    if ((insertErr as { code?: string }).code === "23505") {
      return { ok: false, error: "Kunjungan ini sudah pernah Anda nilai." };
    }
    if ((insertErr as { code?: string }).code === "42P01") {
      return { ok: false, error: "Fitur penilaian belum aktif di database ini (migrasi 0038). Laporkan ke admin." };
    }
    return { ok: false, error: "Gagal menyimpan penilaian — coba lagi." };
  }

  revalidatePath("/customer/history");
  return { ok: true };
}

export async function saveManagementReview(
  employeeId: string,
  outletId: string,
  period: string,
  rating: number,
  note?: string
): Promise<ActionResult> {
  if (!PERIOD_RE.test(period)) return { ok: false, error: "Periode tidak valid." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Penilaian harus bintang 1 sampai 5." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  // reviewed_by = baris karyawan si penilai, kalau akunnya memang
  // terhubung ke karyawan (admin/owner bisa saja tidak) — kolomnya
  // nullable dengan sengaja; siapa boleh menulis tetap urusan RLS.
  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { error: upsertErr } = await supabase.from("therapist_management_reviews").upsert(
    {
      employee_id: employeeId,
      outlet_id: outletId,
      period,
      rating,
      note: note?.trim() || null,
      reviewed_by: appUser?.employee_id ?? null,
      // Metadata UTC asli (§6.1 frame kedua), BUKAN wallclock: kolom ini
      // default now() dan upsert tidak memicu default saat UPDATE.
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,period" }
  );
  if (upsertErr) {
    if ((upsertErr as { code?: string }).code === "42P01") {
      return { ok: false, error: "Fitur penilaian belum aktif di database ini (migrasi 0038). Laporkan ke admin." };
    }
    return { ok: false, error: "Gagal menyimpan penilaian — periksa hak akses Anda dan coba lagi." };
  }

  revalidatePath("/manager/performance");
  revalidatePath("/owner/therapists");
  return { ok: true };
}
