// ---------------------------------------------------------------------
// Daftar bank untuk field "Nama Bank" di Profil Terapis.
//
// Kenapa daftar tertutup, bukan teks bebas: sebelum ini kolom
// `employee_personal_data.bank_name` diketik manual, jadi satu bank yang
// sama bisa tersimpan sebagai "bca", "BCA", "Bank BCA", atau "b c a" —
// dan kolom itu dipakai untuk transfer payroll & reimbursement, tempat
// ejaan yang tidak seragam bikin daftar transfer harus dirapikan manual
// tiap periode.
//
// BJB ditaruh di urutan atas bersama bank besar karena Amethyst di
// Bandung dan BJB adalah bank daerah Jawa Barat — banyak dipakai staf.
//
// CATATAN: file ini SENGAJA bukan file "use server". File "use server"
// cuma boleh meng-export async function; meng-export const array dari
// sana pernah dua kali menjatuhkan build Vercel (lihat backlog 7.11 dan
// 7.19). Konstanta bersama seperti ini tempatnya di lib/constants/.
// ---------------------------------------------------------------------

export const BANKS: string[] = [
  "BCA",
  "Bank Mandiri",
  "BNI",
  "BRI",
  "Bank BJB",
  "BSI (Bank Syariah Indonesia)",
  "BTN",
  "CIMB Niaga",
  "Danamon",
  "Permata",
  "OCBC",
  "Maybank",
  "Panin",
  "Bank Mega",
  "BTPN / Jenius",
  "Muamalat",
  "Sinarmas",
  "Bank Jago",
  "SeaBank",
  "Neo Commerce",
  "Allo Bank",
  "blu by BCA Digital",
];

/** Nilai sentinel untuk opsi "Lainnya" — bukan nama bank, jangan disimpan apa adanya. */
export const BANK_OTHER = "__LAINNYA__";
