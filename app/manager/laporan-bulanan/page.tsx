import MonthlyReport from "@/components/MonthlyReport";
import { getMonthlyReport } from "@/lib/data/monthly-report";
import { monthlyReportPeriodOptions, requireMonthlyReportRole } from "@/lib/data/monthly-report-access";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { getEffectivePeriod } from "@/lib/data/commissions";
import { todayIsoDate } from "@/lib/wallclock";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function ManagerMonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; outlet?: string }>;
}) {
  const actor = await requireMonthlyReportRole(["manager"], "/manager/laporan-bulanan");
  const [params, effectivePeriod, visibleOutlets, live, tenant] = await Promise.all([
    searchParams,
    getEffectivePeriod(),
    getOutlets(),
    isLiveOutletsData(),
    getCurrentTenant(),
  ]);
  const period = params.period && PERIOD_PATTERN.test(params.period) ? params.period : effectivePeriod;
  const outlets = live ? visibleOutlets : [];
  const outletIds = actor.outlet_id ? [actor.outlet_id] : [];
  const report = await getMonthlyReport({ outletIds, period, includeProfit: false });
  const outlet = outlets.find((item) => item.id === actor.outlet_id);

  return (
    <MonthlyReport
      data={report}
      tenantName={tenant?.brandName ?? "Tenant"}
      outletLabel={outlet?.name ?? "Outlet belum ditentukan"}
      outletNames={Object.fromEntries(outlets.map((item) => [item.id, item.name]))}
      pathname="/manager/laporan-bulanan"
      isOwner={false}
      payrollHref={`/manager/payroll?period=${encodeURIComponent(period)}`}
      printDate={todayIsoDate()}
      periodOptions={monthlyReportPeriodOptions(effectivePeriod, period)}
    />
  );
}
