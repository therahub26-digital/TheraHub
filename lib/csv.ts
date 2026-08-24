/**
 * Pembangun CSV bersama — ditambahkan 2026-08-24 (backlog 4.5).
 *
 * Sebelum ini tidak ada satu pun fitur ekspor yang berfungsi di seluruh
 * aplikasi: tombol "Export" ada di /manager/pos, /manager/expenses,
 * /manager/reports, /owner/audit, /super-admin/audit, semuanya `disabled`
 * dengan tooltip "belum dibangun". File ini bagian pertama yang benar-benar
 * dibangun, dipakai lebih dulu oleh dua halaman yang datanya SUDAH live
 * (POS & Expenses) — halaman yang datanya masih mock sengaja belum
 * disambungkan, karena mengekspor angka karangan ke file yang bisa dikirim
 * ke luar aplikasi jauh lebih berbahaya daripada menampilkannya di layar
 * yang sudah diberi banner "data contoh".
 *
 * Keputusan format (sengaja, jangan diubah tanpa alasan):
 *
 * - **Pemisah koma, sesuai RFC 4180.** Excel dengan locale Indonesia
 *   memakai titik koma sebagai list separator, jadi ada godaan memakai
 *   ";" di sini. Tidak dilakukan: itu bukan CSV standar, dan file yang
 *   sama akan salah dibaca oleh Google Sheets, LibreOffice, pandas, dan
 *   importer akuntansi mana pun. Kompromi yang dipakai: SEMUA sel dikutip
 *   (lihat escapeCell), sehingga file tetap terbaca benar di parser standar
 *   apa pun; kalau Excel ID menaruhnya dalam satu kolom, Data → Text to
 *   Columns dengan pemisah koma menyelesaikannya dalam dua klik.
 *
 * - **BOM UTF-8** ditambahkan saat unduh (lihat ExportCsvButton), bukan di
 *   sini — supaya string yang dihasilkan fungsi ini tetap bersih kalau
 *   dipakai untuk hal lain (misalnya dikirim ke API). Tanpa BOM, Excel di
 *   Windows merusak semua karakter beraksen dan nama yang bukan ASCII.
 *
 * - **Angka mentah, bukan terformat.** Kolom uang berisi 150000, bukan
 *   "Rp150.000" — file ini untuk dihitung ulang di spreadsheet, dan
 *   pemisah ribuan Indonesia (titik) akan dibaca Excel sebagai desimal.
 *   Pemformatan rupiah tetap milik tampilan layar (lib/format.ts).
 *
 * - **Baris dipisah CRLF**, juga sesuai RFC 4180 dan yang diharapkan Excel.
 */

export type CsvColumn<T> = {
  /** Judul kolom sebagaimana muncul di baris pertama file. */
  header: string;
  /**
   * Nilai mentah untuk satu baris. Kembalikan angka apa adanya (jangan
   * diformat jadi rupiah), tanggal/jam dalam bentuk ISO, dan
   * null/undefined untuk sel kosong.
   */
  value: (row: T) => string | number | null | undefined;
};

/**
 * Mengutip satu sel. Semua sel dikutip tanpa kecuali — lihat catatan
 * pemisah koma di header file. Tanda kutip di dalam nilai digandakan,
 * sesuai RFC 4180.
 */
function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '""';
  return `"${String(raw).replace(/"/g, '""')}"`;
}

/** Membangun isi file CSV (tanpa BOM) dari daftar baris + definisi kolom. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Nama file yang aman dipakai di Windows/macOS/Linux: huruf kecil, hanya
 * a–z/0–9/tanda hubung, plus tanggal supaya beberapa kali ekspor di hari
 * berbeda tidak saling menimpa di folder Unduhan.
 */
export function csvFilename(base: string, date: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}-${date}.csv`;
}
