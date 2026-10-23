import MonthlyReport from "@/components/MonthlyReport";
import ReportPeriodBar from "@/components/ReportPeriodBar";
import { getPeriodReport } from "@/lib/data/monthly-report";
import { requireMonthlyReportRole } from "@/lib/data/monthly-report-access";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { parseReportParams, reportHref } from "@/lib/report/params";
import { todayIsoDate } from "@/lib/wallclock";

// Laporan Manager — Harian · Mingguan · Bulanan (2026-10-23). Cakupan
// dikunci ke outlet manager di server; tanpa estimasi laba.
const BASE = "/manager/laporan";

export default async function ManagerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string; tanggal?: string; periode?: string; outlet?: string; pratinjau?: string }>;
}) {
  const actor = await requireMonthlyReportRole(["manager"], BASE);
  const today = todayIsoDate();
  const [sp, visibleOutlets, live, tenant] = await Promise.all([searchParams, getOutlets(), isLiveOutletsData(), getCurrentTenant()]);
  const { kind, anchor } = parseReportParams(sp, today);
  const outlets = live ? visibleOutlets : [];
  const outletIds = actor.outlet_id ? [actor.outlet_id] : [];
  const report = await getPeriodReport({ outletIds, kind, anchor, includeProfit: false });
  const outlet = outlets.find((item) => item.id === actor.outlet_id);

  return (
    <MonthlyReport
      data={report}
      tenantName={tenant?.brandName ?? "Tenant"}
      outletLabel={outlet?.name ?? "Outlet belum ditentukan"}
      outletNames={outlet ? { [outlet.id]: outlet.name } : {}}
      pathname={BASE}
      isOwner={false}
      payrollHref={`/manager/payroll?period=${encodeURIComponent(report.periodStart.slice(0, 7))}`}
      monthlyHref={reportHref(BASE, "month", report.periodStart.slice(0, 7))}
      printDate={today}
      controls={
        <ReportPeriodBar basePath={BASE} kind={kind} anchor={anchor} periodStart={report.periodStart} periodEnd={report.periodEnd} today={today} />
      }
    />
  );
}
