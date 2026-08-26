import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Identitas orang yang sedang login — khusus untuk ditampilkan di UI.
//
// KENAPA MODUL INI ADA (ditemukan 2026-08-26, dari layar sungguhan):
// `components/Shell.tsx` selama ini SELALU merender persona demo yang
// di-hardcode di `lib/nav.ts` — ia tidak pernah membaca siapa yang
// benar-benar login. Selama akun yang di-seed kebetulan cocok dengan
// persona-nya, ini tidak terlihat: Dewi login dan melihat "Dewi
// Anggraini", Sinta melihat "Sinta Maharani". Begitu ada akun yang TIDAK
// cocok dengan persona-nya — akun super-admin `therahub26@gmail.com` —
// sidebar dengan percaya diri menampilkan nama orang lain sama sekali,
// "Rangga Pratama · Platform Owner".
//
// Ini kelas bug yang sama dengan "mobile avatar identity mismatch" di
// review round awal: layar menyatakan sesuatu yang tidak pernah dibaca
// dari sumber manapun. Portal terapis & customer sudah lama
// memperbaikinya dengan meneruskan nama sungguhan ke MobileShell lewat
// prop `avatarName`; empat portal desktop tidak pernah ikut.
//
// Konvensi dual-mode yang sama dengan seluruh lib/data/*.ts berlaku di
// sini, termasuk aturan terpentingnya: pemicu fallback adalah TIDAK ADA
// SESI AUTH, bukan "0 baris". `null` berarti "tidak ada yang login" —
// yaitu mode "Ganti Role" — dan pemanggilnya yang memutuskan mau
// menampilkan apa untuk keadaan itu.
// ---------------------------------------------------------------------

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Nama orang yang sedang login, apa adanya dari `app_users.name`.
 *
 * Mengembalikan `null` HANYA kalau tidak ada sesi auth. Kalau ada sesi
 * tapi barisnya tidak ketemu (mis. identitas customer yang hidup di
 * tabel lain, atau baris yang belum tersambung), kita jatuh ke alamat
 * email — sebuah fakta yang membosankan tapi benar, jauh lebih baik
 * daripada nama karangan yang terlihat meyakinkan.
 *
 * cache() supaya seluruh pohon render satu request berbagi satu
 * lookup, pola yang sama dengan `getCurrentOutlet()`.
 */
export const getSignedInName = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("app_users")
    .select("name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data) return user.email ?? null;
  return str((data as Row).name) || user.email || null;
});
