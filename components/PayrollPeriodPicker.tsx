"use client";

import { useRouter } from "next/navigation";

type PayrollPeriodPickerProps = {
  period: string;
  periods: { value: string; label: string }[];
};

export default function PayrollPeriodPicker({ period, periods }: PayrollPeriodPickerProps) {
  const router = useRouter();

  return (
    <label>
      <span className="sr-only">Periode payroll</span>
      <select
        aria-label="Periode payroll"
        className="input"
        value={period}
        onChange={(event) => router.push(`/manager/payroll?period=${encodeURIComponent(event.target.value)}`)}
      >
        {periods.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </label>
  );
}
