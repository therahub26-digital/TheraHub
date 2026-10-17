import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Satu panggilan auth.getUser() per request, dibagi seluruh lapisan data.
//
// KENAPA (audit performa 2026-10-17): setiap modul lib/data/*.ts memanggil
// `supabase.auth.getUser()` sendiri-sendiri. Itu BUKAN baca cookie lokal —
// getUser() selalu melakukan round trip HTTP ke Supabase Auth untuk
// memvalidasi token. Satu halaman dashboard yang menyentuh 8–10 modul
// (bookings, sessions, outlets, rooms, notifications, ...) jadi membayar
// 8–10 round trip auth berurutan sebelum query datanya sendiri jalan.
// Log API Supabase menunjukkan belasan `/auth/v1/user` dalam detik yang
// sama untuk satu kali buka halaman.
//
// cache() dari React menyatukannya jadi satu panggilan per render
// request. Bentuk kembaliannya SAMA PERSIS dengan supabase.auth.getUser()
// ({ data: { user }, error }), jadi pemanggil cukup ganti satu ekspresi.
// Validasi token tetap dilakukan server Auth (tetap getUser, bukan
// getSession), hanya tidak diulang.
//
// Di luar render (Server Action, Route Handler) React tidak menyediakan
// cache request, sehingga fungsi ini sekadar memanggil getUser() seperti
// biasa — perilakunya tidak berubah di sana.
// ---------------------------------------------------------------------

export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
