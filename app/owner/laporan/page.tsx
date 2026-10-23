import MonthlyReport from "@/components/MonthlyReport";
import ReportPeriodBar from "@/components/ReportPeriodBar";
import { getPeriodReport } from "@/lib/data/monthly-report";
import { requireMonthlyReportRole } from "@/lib/data/monthly-report-access";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { parseReportParams, reportHref } from "@/lib/report/params";
import { todayIsoDate } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Laporan Owner — Harian · Mingguan · Bulanan (2026-10-23). Satu mesin
// (getPeriodReport) dan satu tampilan (MonthlyReport) untuk tiga jenis.
// Admin boleh membuka (menu Insight), estimasi laba hanya untuk Owner
// (keputusan Adjie 17–18 Okt).
// ---------------------------------------------------------------------

const BASE = "/owner/laporan";

export default async function OwnerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string; tanggal?: string; periode?: string; outlet?: string; pratinjau?: string }>;
}) {
  const actor = await requireMonthlyReportRole(["owner", "admin"], BASE);
  const isOwner = actor.role === "owner";
  const today = todayIsoDate();
  const [sp, allOutlets, live, tenant] = await Promise.all([searchParams, getOutlets(), isLiveOutletsData(), getCurrentTenant()]);
  const { kind, anchor, outlet } = parseReportParams(sp, today);
  const outlets = live ? allOutlets : [];
  const selectedOutlet = outlets.some((o) => o.id === outlet) ? outlet : "all";
  const scope = selectedOutlet === "all" ? outlets : outlets.filter((o) => o.id === selectedOutlet);
  const report = await getPeriodReport({ outletIds: scope.map((o) => o.id), kind, anchor, includeProfit: isOwner });

  return (
    <MonthlyReport
      data={report}
      tenantName={tenant?.brandName ?? "Tenant"}
      outletLabel={selectedOutlet === "all" ? "Semua cabang" : scope[0]?.name ?? "Semua cabang"}
      outletNames={Object.fromEntries(scope.map((o) => [o.id, o.name]))}
      pathname={BASE}
      isOwner={isOwner}
      payrollHref={`/owner/payroll?period=${encodeURIComponent(report.periodStart.slice(0, 7))}`}
      monthlyHref={reportHref(BASE, "month", report.periodStart.slice(0, 7), selectedOutlet)}
      printDate={today}
      controls={
        <ReportPeriodBar
          basePath={BASE}
          kind={kind}
          anchor={anchor}
          periodStart={report.periodStart}
          periodEnd={report.periodEnd}
          today={today}
          outlet={selectedOutlet}
          outlets={outlets.map(({ id, name }) => ({ id, name }))}
        />
      }
    />
  );
}
