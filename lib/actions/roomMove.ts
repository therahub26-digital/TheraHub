"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveToday } from "@/lib/data/bookings";

// ---------------------------------------------------------------------
// Pindah kamar oleh TERAPIS lewat scan QR (Adjie, 2026-10-15 malam):
// "therapis bisa minta pindah kamar, misal ketika sudah mau masuk kamar,
//  ternyata kamar belum dirapihkan, dia pindah ke kamar lain. masing2
//  kamar dibuatkan qr code, tinggal pindah kamar dan scan qr ruangan
//  baru."
//
// Alurnya: QR di pintu tiap kamar berisi URL /therapist/room-move?room=
// <id>. Terapis scan dengan kamera HP → halaman konfirmasi → tombol
// "Pindah ke kamar ini" → action ini. Yang dipindah adalah booking
// AKTIF terapis itu sendiri hari ini (CHECKED_IN atau IN_SESSION) —
// dan sesinya sekalian bila sudah berjalan.
//
// Validasi kamar tujuan MENIRU checkInBooking() (lib/actions/sessions.ts)
// persis: outlet sama, status ACTIVE, dan belum dipegang booking aktif
// lain — pemeriksaan ulang di server ini yang menangkap dua orang
// berebut kamar yang sama pada detik yang sama.
//
// TANPA RLS BARU: policy bookings_therapist_complete (0012) dan
// sessions_therapist (0002) memang sudah mengizinkan terapis meng-
// update baris MILIKNYA SENDIRI — pindah kamar hanyalah pemakaian
// kedua dari ijin yang sama yang dipakai completeSession().
// ---------------------------------------------------------------------

export type RoomMoveResult = { ok: true; roomName: string } | { ok: false; error: string };

const MOVABLE_STATUSES = ["CHECKED_IN", "IN_SESSION"];

export async function moveMyActiveBookingRoom(roomId: string): Promise<RoomMoveResult> {
  if (!roomId) return { ok: false, error: "QR tidak dikenali — tidak ada kamar yang dituju." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("auth_user_id", user.id).maybeSingle();
  if (!appUser?.employee_id) return { ok: false, error: "Akun ini tidak terhubung ke data karyawan." };

  const today = await getEffectiveToday();

  // Booking aktif terapis ini hari ini — satu-satunya yang boleh pindah.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, outlet_id, room_id, status")
    .eq("therapist_id", appUser.employee_id)
    .eq("date", today)
    .in("status", MOVABLE_STATUSES)
    .limit(2);
  const booking = bookings?.[0];
  if (!booking) {
    return { ok: false, error: "Tidak ada tamu yang sedang Anda tangani (check-in/sesi berjalan) — tidak ada yang perlu dipindah kamar." };
  }
  if (booking.room_id === roomId) {
    return { ok: false, error: "Tamu Anda memang sudah di kamar ini." };
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id, outlet_id, name, status")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !room) return { ok: false, error: "Kamar tidak ditemukan — QR mungkin dari outlet lain." };
  if (room.outlet_id !== booking.outlet_id) return { ok: false, error: "Kamar ini bukan milik outlet Anda." };
  if (room.status !== "ACTIVE") return { ok: false, error: `Kamar ${room.name} sedang ${room.status.toLowerCase()} — pilih kamar lain.` };

  const { data: holder } = await supabase
    .from("bookings")
    .select("id")
    .eq("room_id", roomId)
    .in("status", MOVABLE_STATUSES)
    .neq("id", booking.id)
    .maybeSingle();
  if (holder) return { ok: false, error: `Kamar ${room.name} sedang dipakai tamu lain — pilih kamar lain.` };

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({ room_id: roomId })
    .eq("id", booking.id)
    .in("status", MOVABLE_STATUSES);
  if (updateErr) return { ok: false, error: "Gagal memindah kamar — coba lagi." };

  // Sesi yang sudah berjalan ikut pindah, supaya layar monitor kasir/
  // manager menunjuk kamar yang benar. Gagal-lunak: booking-nya sudah
  // pindah (itu sumber kebenaran check-in berikutnya), kegagalan di sini
  // tidak membatalkan perpindahan.
  if (booking.status === "IN_SESSION") {
    await supabase
      .from("sessions")
      .update({ room_id: roomId })
      .eq("booking_id", booking.id)
      .neq("status", "COMPLETED");
  }

  revalidatePath("/therapist");
  revalidatePath("/therapist/session");
  revalidatePath("/manager/bookings");
  revalidatePath("/manager/sessions");
  revalidatePath("/kasir");
  revalidatePath("/kasir/sessions");

  return { ok: true, roomName: room.name };
}
