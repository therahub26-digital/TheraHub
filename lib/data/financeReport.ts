import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { FinanceRows } from "@/lib/finance/aggregate";

// ---------------------------------------------------------------------
// Baris mentah laporan keuangan untuk SATU ATAU BANYAK outlet dalam satu
// rentang tanggal — dipakai /manager/finance (outlet sendiri) dan
// portal owner (lintas cabang). Agregasinya di lib/finance/aggregate.ts.
//
// Kenapa tidak memakai getTransactionsForOutlet(): fungsi itu memuat
// SELURUH tabel transactions tenant dengan satu select tanpa batas —
// begitu tenant melewati batas baris PostgREST (umumnya 1000), hasilnya
// terpotong diam-diam (pelajaran komisi 141→61, lib/supabase/paginate.ts).
// Di sini setiap query dibatasi outlet + rentang DI DATABASE, hanya
// kolom yang dihitung, dan lewat fetchAllRows.
//
// RLS yang menentukan siapa melihat apa: manager hanya outletnya
// (_is_outlet_staff / _is_manager_here), owner/admin seluruh outlet
// tenant. Pemanggil tetap mengirim daftar outlet yang memang boleh ia
// lihat — RLS adalah pagar kedua, bukan satu-satunya.
//
// paid_at mengikuti konvensi wallclock (jam WIB disimpan sebagai UTC),
// jadi batas hari WIB = `${tanggal}T00:00:00+00:00` dan tanggal WIB
// sebuah transaksi = paid_at.slice(0, 10).
//
// null = tidak ada sesi login (mode demo "Ganti Role") → pemanggil
// menampilkan konten contoh berbanner, konvensi §6.2.
// ---------------------------------------------------------------------

export async function getFinanceRows(outletIds: string[], start: string, endExcl: string): Promise<FinanceRows | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (outletIds.length === 0) return { tx: [], commissions: [], expenses: [] };

  const [tx, comm, exp] = await Promise.all([
    fetchAllRows<{ outlet_id: string; paid_at: string | null; total: number | string; payment_method: string | null }>(
      async (from, to) => {
        const { data, error } = await supabase
          .from("transactions")
          .select("outlet_id, paid_at, total, payment_method")
          .in("outlet_id", outletIds)
          .eq("status", "PAID")
          .gte("paid_at", `${start}T00:00:00+00:00`)
          .lt("paid_at", `${endExcl}T00:00:00+00:00`)
          .order("paid_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data, error };
      }
    ),
    fetchAllRows<{ outlet_id: string; date: string; amount: number | string; status: string }>(async (from, to) => {
      const { data, error } = await supabase
        .from("commission_entries")
        .select("outlet_id, date, amount, status")
        .in("outlet_id", outletIds)
        .gte("date", start)
        .lt("date", endExcl)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
    fetchAllRows<{ outlet_id: string; date: string; amount: number | string; status: string }>(async (from, to) => {
      const { data, error } = await supabase
        .from("expenses")
        .select("outlet_id, date, amount, status")
        .in("outlet_id", outletIds)
        .gte("date", start)
        .lt("date", endExcl)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }),
  ]);

  // Satu query gagal = laporan tidak bisa dipercaya. Lebih jujur
  // melempar (error boundary menampilkan pesan) daripada menampilkan
  // pendapatan tanpa pengeluaran seolah-olah lengkap.
  const err = tx.error ?? comm.error ?? exp.error;
  if (err) throw new Error(`Laporan keuangan gagal dimuat: ${(err as { message?: string }).message ?? String(err)}`);

  return {
    tx: tx.rows
      .filter((r) => r.paid_at)
      .map((r) => ({
        outletId: r.outlet_id,
        date: (r.paid_at as string).slice(0, 10),
        total: Number(r.total),
        method: r.payment_method ?? "Cash",
      })),
    commissions: comm.rows.map((r) => ({ outletId: r.outlet_id, date: r.date, amount: Number(r.amount), status: r.status })),
    expenses: exp.rows.map((r) => ({ outletId: r.outlet_id, date: r.date, amount: Number(r.amount), status: r.status })),
  };
}
