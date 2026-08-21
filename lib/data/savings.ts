import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Tabungan karyawan — saldo yang nyata, bukan angka hiasan.
//
// Sampai sekarang halaman payslip membaca `savingsOf()` dari lib/mock.
// Itu bisa diterima selama tabungan hanya dekorasi di layar demo, tapi
// tidak lagi begitu: uang ini benar-benar dipotong dari gaji orang dan
// benar-benar dipegang perusahaan sampai dicairkan. Saldo yang salah di
// sini bukan bug tampilan, melainkan klaim keliru tentang berapa uang
// seseorang yang masih disimpan.
//
// SALDO SELALU DIHITUNG DARI PENJUMLAHAN BARIS, tidak pernah dibaca dari
// satu kolom "saldo terakhir". Kolom `balance_after` tetap diisi sebagai
// catatan historis pada saat baris dibuat, tapi ia tidak boleh jadi
// sumber kebenaran: begitu ada satu baris yang disisipkan, dihapus, atau
// diperbaiki di tengah urutan, semua `balance_after` sesudahnya menjadi
// bohong tanpa ada yang tahu. Penjumlahan tidak bisa basi.
// ---------------------------------------------------------------------

export type SavingsEntry = {
  id: string;
  employeeId: string;
  date: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "INTEREST";
  amount: number;
  period: string | null;
  ref: string | null;
  note: string;
};

/** Saldo = setoran + bunga − penarikan. Dihitung, bukan disimpan. */
export function balanceOf(entries: SavingsEntry[]): number {
  return entries.reduce(
    (sum, e) => (e.type === "WITHDRAWAL" ? sum - e.amount : sum + e.amount),
    0
  );
}

function mapEntry(row: {
  id: string;
  employee_id: string;
  date: string;
  type: SavingsEntry["type"];
  amount: number | string;
  period: string | null;
  ref: string | null;
  note: string | null;
}): SavingsEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    period: row.period ?? null,
    ref: row.ref ?? null,
    note: row.note ?? "",
  };
}

/**
 * Semua baris tabungan satu karyawan, terbaru dulu.
 *
 * Mengembalikan array kosong (bukan mock) saat tidak ada sesi login.
 * Saldo tabungan palsu di layar seseorang lebih berbahaya daripada layar
 * kosong: yang satu salah dipercaya, yang satu jelas belum ada isinya.
 */
export async function getSavingsForEmployee(employeeId: string): Promise<SavingsEntry[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("savings_entries")
    .select("id, employee_id, date, type, amount, period, ref, note")
    .eq("employee_id", employeeId)
    .order("date", { ascending: false });
  if (error || !data) return [];

  return data.map(mapEntry);
}

/**
 * Saldo tabungan setiap karyawan di satu outlet, untuk pandangan manager.
 *
 * Manager perlu melihat ini sebelum mencairkan: mencairkan lebih besar
 * dari saldo berarti membayarkan uang yang tidak pernah disetor orang itu.
 */
export async function getSavingsBalancesForOutlet(
  outletId: string
): Promise<Map<string, number>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  // Lewat employees supaya baris lama yang belum punya outlet_id (kolom
  // itu baru ditambahkan di 0007) tetap ikut terhitung. Menyaring
  // langsung pada savings_entries.outlet_id akan diam-diam menjatuhkan
  // riwayat sebelum migrasi.
  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id")
    .eq("outlet_id", outletId);
  const ids = (employeeRows ?? []).map((e) => e.id);
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("savings_entries")
    .select("employee_id, type, amount")
    .in("employee_id", ids);
  if (error || !data) return new Map();

  const balances = new Map<string, number>();
  for (const row of data) {
    const delta = row.type === "WITHDRAWAL" ? -Number(row.amount) : Number(row.amount);
    balances.set(row.employee_id, (balances.get(row.employee_id) ?? 0) + delta);
  }
  return balances;
}
