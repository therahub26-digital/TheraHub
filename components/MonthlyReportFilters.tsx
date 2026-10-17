"use client";

import { useRouter } from "next/navigation";

type MonthlyReportFiltersProps = {
  pathname: string;
  period: string;
  periods: { value: string; label: string }[];
  outlet?: string;
  outlets?: { id: string; name: string }[];
};

export default function MonthlyReportFilters({
  pathname,
  period,
  periods,
  outlet,
  outlets,
}: MonthlyReportFiltersProps) {
  const router = useRouter();

  function navigate(key: "period" | "outlet", value: string) {
    const params = new URLSearchParams();
    params.set("period", key === "period" ? value : period);
    if (outlets) params.set("outlet", key === "outlet" ? value : outlet ?? "all");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      {outlets && (
        <label>
          <span className="sr-only">Cakupan cabang</span>
          <select
            aria-label="Cakupan cabang"
            className="input"
            value={outlet ?? "all"}
            onChange={(event) => navigate("outlet", event.target.value)}
          >
            <option value="all">Semua cabang</option>
            {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}
      <label>
        <span className="sr-only">Periode laporan</span>
        <select
          aria-label="Periode laporan"
          className="input"
          value={period}
          onChange={(event) => navigate("period", event.target.value)}
        >
          {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    </>
  );
}
