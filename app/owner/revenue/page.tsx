import { PageHead, Card, CardHead, StatCard } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { TrendArea, GroupedBars } from "@/components/Charts";
import { MONTHLY_TREND, CONSOLIDATED_PNL, TENANT_PNL, OUTLETS } from "@/lib/mock";
import { rp, pct } from "@/lib/format";
import Link from "next/link";
import FinanceReport from "@/components/FinanceReport";
import PrintButton from "@/components/PrintButton";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { getEffectiveToday } from "@/lib/data/bookings";
import { getFinanceRows } from "@/lib/data/financeReport";
import { parseFinanceParams, trendBuckets } from "@/lib/finance/periods";
import { ACTIVE_TENANT } from "@/lib/mock";

// ---------------------------------------------------------------------
// UPDATE 2026-10-15 — Laporan Keuangan LINTAS CABANG untuk owner
// (permintaan Adjie: "per hari/minggu/bulan, grafik, dan tampilan pemilik
// lintas cabang"). Sesi owner sungguhan melihat data asli:
//   ?outlet=all (default) → konsolidasi semua cabang + perbandingan
//                           cabang + tren pendapatan per cabang;
//   ?outlet=<id>          → satu cabang saja (tampilan sama dengan manager).
// Menjawab keputusan 2.1 untuk halaman ini dengan KEDUANYA: agregat
// semua cabang sebagai default, pemilih cabang untuk menyaring.
// Mode demo "Ganti Role" (tanpa sesi) tetap menampilkan konten contoh
// lama di bawah apa adanya, berbanner — konvensi §6.2.
// ---------------------------------------------------------------------

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string; g?: string; d?: string }>;
}) {
  const [sp, live, tenant] = await Promise.all([searchParams, isLiveOutletsData(), getCurrentTenant()]);
  if (live) {
    const [outlets, today] = await Promise.all([getOutlets(), getEffectiveToday()]);
    const { gran, date } = parseFinanceParams(sp, today);
    const single = outlets.find((o) => o.id === sp.outlet);
    const scope = single ? [single] : outlets;
    const buckets = trendBuckets(gran, date);
    const rows = await getFinanceRows(scope.map((o) => o.id), buckets[0].start, buckets[buckets.length - 1].endExcl);
    const outletParam = single ? single.id : "all";
    const chip = (id: string, label: string) => (
      <Link
        key={id}
        href={`/owner/revenue?outlet=${id}&g=${gran}&d=${date}`}
        className={`btn btn-sm ${id === outletParam ? "btn-primary" : "btn-ghost"}`}
      >
        {label}
      </Link>
    );
    return (
      <>
        <PageHead
          title="Laporan Keuangan"
          desc="Pendapatan, komisi, pengeluaran, dan sisa kas seluruh cabang — per hari, minggu, atau bulan."
          actions={<PrintButton label="Cetak / Simpan PDF" />}
        />
        <div className="row g2 wrap no-print" style={{ marginBottom: 16 }}>
          {chip("all", `Semua cabang (${outlets.length})`)}
          {outlets.map((o) => chip(o.id, o.name))}
        </div>
        {rows ? (
          <FinanceReport
            basePath="/owner/revenue"
            extraParams={{ outlet: outletParam }}
            outlets={scope.map((o) => ({ id: o.id, name: o.name, code: o.code }))}
            gran={gran}
            date={date}
            today={today}
            rows={rows}
            scopeLabel={single ? single.name : `Semua cabang (${outlets.length})`}
            csvBase={single ? single.code : "semua-cabang"}
            tenantName={tenant?.brandName ?? ACTIVE_TENANT.name}
            printOutletName={single?.name ?? "Semua cabang"}
          />
        ) : (
          <MockDataNotice>Sesi login tidak terbaca — muat ulang halaman atau masuk kembali.</MockDataNotice>
        )}
      </>
    );
  }

  const pnlSeries = MONTHLY_TREND.map((m) => ({ month: m.month, revenue: m.revenue, profit: m.profit }));

  return (
    <>
      <PageHead title="Revenue & Profitability" desc="P&L style summary dan tren konsolidasi seluruh outlet." />

      <MockDataNotice>
        Seluruh angka di halaman ini contoh tampilan, bukan hasil perhitungan lintas-outlet yang
        sebenarnya. Portal Owner belum dimigrasi ke data asli karena bentuknya masih menunggu
        keputusan Anda (pemilih outlet manual vs agregat semua outlet). Yang sudah nyata di portal
        ini hanya <strong>Payroll</strong>; angka operasional lain ada di portal Manager.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Revenue" value={rp(TENANT_PNL.revenue, { short: true })} icon="circle-dollar" toneKey="gold" />
        <StatCard label="Gross Margin" value={rp(TENANT_PNL.grossMargin, { short: true })} icon="trending-up" toneKey="teal" foot={pct((TENANT_PNL.grossMargin / TENANT_PNL.revenue) * 100)} />
        <StatCard label="Operating Profit" value={rp(TENANT_PNL.operatingProfit, { short: true })} icon="wallet" toneKey="sky" foot={pct((TENANT_PNL.operatingProfit / TENANT_PNL.revenue) * 100)} />
        <StatCard label="COGS + OPEX" value={rp(TENANT_PNL.cogs + TENANT_PNL.opex, { short: true })} icon="receipt" toneKey="rose" />
      </div>

      <Card className="card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Revenue vs Profit — 6 Bulan</h3>
        <TrendArea data={pnlSeries} xKey="month" yKey="revenue" color="#f0b429" height={230} />
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="P&L per Outlet" sub="Bulan berjalan · Agustus 2026" />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Outlet</th><th>Revenue</th><th>COGS</th><th>Gross Margin</th><th>Komisi</th><th>Payroll</th><th>OPEX</th><th>Operating Profit</th><th>Margin</th></tr>
            </thead>
            <tbody>
              {CONSOLIDATED_PNL.map((p) => {
                const o = OUTLETS.find((x) => x.id === p.outletId)!;
                return (
                  <tr key={p.outletId}>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{o.name.replace("Amethyst — ", "")}</td>
                    <td className="num">{rp(p.revenue, { short: true })}</td>
                    <td className="num muted">{rp(p.cogs, { short: true })}</td>
                    <td className="num">{rp(p.grossMargin, { short: true })}</td>
                    <td className="num muted">{rp(p.commission, { short: true })}</td>
                    <td className="num muted">{rp(p.payroll, { short: true })}</td>
                    <td className="num muted">{rp(p.opex, { short: true })}</td>
                    <td className="num strong" style={{ color: "var(--success)" }}>{rp(p.operatingProfit, { short: true })}</td>
                    <td className="num">{pct(p.margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Struktur Biaya" sub="Komisi, payroll, dan OPEX per outlet" />
        <div className="card-body">
          <GroupedBars
            data={CONSOLIDATED_PNL.map((p) => ({
              name: OUTLETS.find((o) => o.id === p.outletId)!.name.replace("Amethyst — ", ""),
              Komisi: p.commission,
              Payroll: p.payroll,
              OPEX: p.opex,
            }))}
            xKey="name"
            series={[
              { key: "Komisi", label: "Komisi" },
              { key: "Payroll", label: "Payroll" },
              { key: "OPEX", label: "OPEX" },
            ]}
            money
            height={260}
          />
        </div>
      </Card>
    </>
  );
}
