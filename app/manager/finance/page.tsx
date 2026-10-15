import Link from "next/link";
import { PageHead } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import FinanceReport from "@/components/FinanceReport";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getFinanceRows } from "@/lib/data/financeReport";
import { parseFinanceParams, trendBuckets } from "@/lib/finance/periods";

// ---------------------------------------------------------------------
// Laporan Keuangan outlet — permintaan Adjie 2026-10-15: "laporan
// keuangan bisa cek per hari/minggu/bulan, grafik". /manager/reports
// tetap ada (ringkasan bulan berjalan + item terlaris + kontribusi
// terapis); halaman ini yang bisa dipilih periodenya. Outlet = outlet
// manager yang login (getCurrentOutlet), RLS memagari di belakangnya.
// ---------------------------------------------------------------------

export default async function ManagerFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; d?: string }>;
}) {
  const [sp, outlet, today] = await Promise.all([searchParams, getCurrentOutlet(), getEffectiveToday()]);
  const { gran, date } = parseFinanceParams(sp, today);
  const buckets = trendBuckets(gran, date);
  const rows = await getFinanceRows([outlet.id], buckets[0].start, buckets[buckets.length - 1].endExcl);

  return (
    <>
      <PageHead
        title="Laporan Keuangan"
        desc={`${outlet.name} · pendapatan, komisi, pengeluaran, dan sisa kas — per hari, minggu, atau bulan.`}
        actions={
          <Link href="/manager/reports" className="btn btn-ghost btn-sm">
            Ringkasan bulanan &amp; item terlaris
          </Link>
        }
      />
      {rows ? (
        <FinanceReport
          basePath="/manager/finance"
          outlets={[{ id: outlet.id, name: outlet.name, code: outlet.code }]}
          gran={gran}
          date={date}
          today={today}
          rows={rows}
          scopeLabel={outlet.name}
          csvBase={outlet.code}
        />
      ) : (
        <MockDataNotice>
          Laporan keuangan hanya tersedia untuk akun manager sungguhan — mode demo &quot;Ganti Role&quot; tidak
          punya data transaksi asli. Masuk dengan akun manager untuk melihat angka outlet Anda.
        </MockDataNotice>
      )}
    </>
  );
}
