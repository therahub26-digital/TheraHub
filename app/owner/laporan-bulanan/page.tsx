import MonthlyReport from "@/components/MonthlyReport";
import { getMonthlyReport } from "@/lib/data/monthly-report";
import { monthlyReportPeriodOptions, requireMonthlyReportRole } from "@/lib/data/monthly-report-access";
import { getOutlets, isLiveOutletsData } from "@/lib/data/outlets";
import { getCurrentTenant } from "@/lib/data/tenant";
import { getEffectivePeriod } from "@/lib/data/commissions";
import { todayIsoDate } from "@/lib/wallclock";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function OwnerMonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; outlet?: string }>;
}) {
  const actor = await requireMonthlyReportRole(["owner", "admin"], "/owner/laporan-bulanan");
  // UAT 18 Okt 2026: Admin juga boleh membuka laporan ini (menu Insight), tapi
  // keputusan Adjie: estimasi laba HANYA untuk Owner. Dulu includeProfit &
  // isOwner selalu true di rute ini, jadi Admin ikut melihat Bagian 08.
  const isOwner = actor.role === "owner";
  const [params, effectivePeriod, allOutlets, live, tenant] = await Promise.all([
    searchParams,
    getEffectivePeriod(),
    getOutlets(),
    isLiveOutletsData(),
    getCurrentTenant(),
  ]);
  const period = params.period && PERIOD_PATTERN.test(params.period) ? params.period : effectivePeriod;
  const outlets = live ? allOutlets : [];
  const selectedOutlet = params.outlet && outlets.some((outlet) => outlet.id === params.outlet)
    ? params.outlet
    : "all";
  const scope = selectedOutlet === "all" ? outlets : outlets.filter((outlet) => outlet.id === selectedOutlet);
  const report = await getMonthlyReport({
    outletIds: scope.map((outlet) => outlet.id),
    period,
    includeProfit: isOwner,
  });
  const singleOutlet = scope.length === 1 ? scope[0] : null;

  return (
    <MonthlyReport
      data={report}
      tenantName={tenant?.brandName ?? "Tenant"}
      outletLabel={selectedOutlet === "all" ? "Semua cabang" : singleOutlet?.name ?? "Semua cabang"}
      outletNames={Object.fromEntries(outlets.map((outlet) => [outlet.id, outlet.name]))}
      pathname="/owner/laporan-bulanan"
      isOwner={isOwner}
      payrollHref={`/owner/payroll?period=${encodeURIComponent(period)}`}
      printDate={todayIsoDate()}
      periodOptions={monthlyReportPeriodOptions(effectivePeriod, period)}
      selectedOutlet={selectedOutlet}
      outletOptions={outlets.map(({ id, name }) => ({ id, name }))}
    />
  );
}
