import Link from "next/link";
import { Badge, Card, CardHead, EmptyState, PageHead } from "@/components/ui";
import MonthlyReportFilters from "@/components/MonthlyReportFilters";
import PrintButton from "@/components/PrintButton";
import { fmtDateLong, num, pct, rp } from "@/lib/format";
import { percentageChange, percentagePointChange } from "@/lib/data/monthly-report-math";
import type { MonthlyReport } from "@/lib/data/monthly-report";
import { ColumnChart, DonutChart, HorizontalBars, TrendChart, WaterfallChart } from "@/components/ReportCharts";

type OutletOption = { id: string; name: string };
type MonthlyReportProps = {
  data: MonthlyReport;
  tenantName: string;
  outletLabel: string;
  outletNames: Record<string, string>;
  pathname: string;
  isOwner: boolean;
  payrollHref: string;
  printDate: string;
  /** Bulanan (lama): pilihan bulan. Diabaikan bila `controls` diisi. */
  periodOptions?: { value: string; label: string }[];
  selectedOutlet?: string;
  outletOptions?: OutletOption[];
  /** Bilah pilih jenis & periode (Harian/Mingguan/Bulanan) — 2026-10-23. */
  controls?: React.ReactNode;
  /** Tautan ke laporan bulanan dari bulan periode ini (dipakai bagian SDM harian/mingguan). */
  monthlyHref?: string;
};

const KIND_TEXT = {
  day: { title: "Laporan Harian", noun: "hari", bucket: "hari", payrollNote: "Gaji & tunjangan dihitung per bulan" },
  week: { title: "Laporan Mingguan", noun: "minggu", bucket: "hari", payrollNote: "Gaji & tunjangan dihitung per bulan" },
  month: { title: "Laporan Bulanan", noun: "bulan", bucket: "minggu", payrollNote: "" },
} as const;

function visitsByWeekday(values: MonthlyReport["customers"]["current"]["visitHoursByWeekday"]) {
  return weekdaysOrder.map((day) => ({
    label: day.label,
    value: values.filter((item) => item.weekday === day.day).reduce((sum, item) => sum + item.visits, 0),
  }));
}

const weekdaysOrder = [
  { day: 1, label: "Senin" },
  { day: 2, label: "Selasa" },
  { day: 3, label: "Rabu" },
  { day: 4, label: "Kamis" },
  { day: 5, label: "Jumat" },
  { day: 6, label: "Sabtu" },
  { day: 0, label: "Minggu" },
];

const weekdays = [
  { day: 1, label: "Sen" },
  { day: 2, label: "Sel" },
  { day: 3, label: "Rab" },
  { day: 4, label: "Kam" },
  { day: 5, label: "Jum" },
  { day: 6, label: "Sab" },
  { day: 0, label: "Min" },
];

function showValue(value: number | null, format: (value: number) => string, missing = "Belum ada data") {
  return value === null ? missing : format(value);
}

type Comparison = { label: string; tone: "good" | "bad" | "flat" };

function baseChangeLabel(
  current: number | null,
  previous: number | null,
  options: { points?: boolean; lowerIsBetter?: boolean; vs?: string } = {}
): Comparison | null {
  if (current === null || previous === null) return null;
  const change = options.points
    ? percentagePointChange(current, previous)
    : percentageChange(current, previous);
  if (change === null) return null;
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "•";
  const tone = change === 0
    ? "flat"
    : (change > 0) !== (options.lowerIsBetter ?? false) ? "good" : "bad";
  return {
    label: `${arrow} ${change > 0 ? "+" : ""}${num(change, 1)}${options.points ? " poin" : "%"} vs ${options.vs ?? "bulan sebelumnya"}`,
    tone,
  };
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="monthly-report-section">
      <div className="monthly-section-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  comparison,
  detail,
}: {
  label: string;
  value: string;
  comparison?: Comparison | null;
  detail?: string;
}) {
  return (
    <div className="monthly-metric">
      <span className="monthly-metric-label">{label}</span>
      <strong>{value}</strong>
      {detail && <small className="monthly-change bad">{detail}</small>}
      {comparison
        ? <small className={`monthly-change ${comparison.tone}`}>{comparison.label}</small>
        : <small className="monthly-change flat">vs pembanding tidak tersedia</small>}
    </div>
  );
}

function DailyRevenueChart({
  values,
  hasTransactions,
}: {
  values: MonthlyReport["revenue"]["current"]["byDay"];
  hasTransactions: boolean;
}) {
  if (!values.length || !hasTransactions) {
    return <p className="monthly-empty-inline">Belum ada pendapatan harian untuk periode ini.</p>;
  }
  const highest = values.reduce((best, item) => item.amount > best.amount ? item : best, values[0]);
  const maximum = Math.max(...values.map((item) => item.amount), 1);
  const top = maximum;
  const chart = { left: 66, right: 990, top: 24, bottom: 222 };
  const plotWidth = chart.right - chart.left;
  const plotHeight = chart.bottom - chart.top;
  const slotWidth = plotWidth / values.length;
  const barWidth = Math.min(20, slotWidth * 0.62);
  const valueY = (amount: number) => chart.bottom - amount / top * plotHeight;
  const axisLabel = (value: number) => value >= 1_000_000
    ? `${num(value / 1_000_000, value % 1_000_000 ? 1 : 0)}jt`
    : value >= 1_000 ? `${num(value / 1_000, value % 1_000 ? 1 : 0)}rb` : num(value);
  const highestX = chart.left + slotWidth * (values.indexOf(highest) + 0.5);
  const highestY = valueY(highest.amount);
  return (
    <svg
      className="monthly-daily-chart"
      viewBox="0 0 1000 260"
      role="img"
      aria-label="Grafik pendapatan harian; Sabtu dan Minggu dibedakan warnanya"
    >
      <title>Pendapatan harian</title>
      <desc>Grafik pendapatan per hari dengan nilai tertinggi ditandai.</desc>
      {Array.from({ length: 5 }, (_, index) => {
        const value = top * (4 - index) / 4;
        const y = chart.top + plotHeight * index / 4;
        return (
          <g key={index} className="monthly-chart-gridline">
            <line x1={chart.left} x2={chart.right} y1={y} y2={y} />
            <text x={chart.left - 8} y={y + 4} textAnchor="end">{axisLabel(value)}</text>
          </g>
        );
      })}
      {values.map((item, index) => {
        const weekday = new Date(`${item.date}T00:00:00Z`).getUTCDay();
        const x = chart.left + slotWidth * index + (slotWidth - barWidth) / 2;
        const y = valueY(item.amount);
        const day = Number(item.date.slice(8, 10));
        return (
          <g key={item.date} className="monthly-chart-bar">
            <rect
              x={x}
              y={item.amount > 0 ? y : chart.bottom}
              width={barWidth}
              height={Math.max(0, chart.bottom - y)}
              className={weekday === 0 || weekday === 6 ? "weekend" : ""}
            >
              <title>{`${item.date}: ${rp(item.amount)}`}</title>
            </rect>
            <text className="monthly-chart-date" x={x + barWidth / 2} y={chart.bottom + 20} textAnchor="middle">
              {day}
            </text>
          </g>
        );
      })}
      <g className="monthly-chart-maximum">
        <circle cx={highestX} cy={highestY} r="4" />
        <text x={Math.min(chart.right - 2, Math.max(chart.left + 2, highestX))} y={Math.max(14, highestY - 9)} textAnchor="middle">
          Tertinggi · {rp(highest.amount, { short: true })}
        </text>
      </g>
    </svg>
  );
}

function Payments({ rows }: { rows: MonthlyReport["revenue"]["current"]["byPaymentMethod"] }) {
  if (!rows.length) return <p className="monthly-empty-inline">Belum ada transaksi pembayaran.</p>;
  const maximum = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <div className="monthly-payment-list">
      {rows.map((row) => (
        <div className="monthly-payment-row" key={row.method}>
          <div className="between g2">
            <strong>{row.method}</strong>
            <span>{rp(row.amount)} <small className="muted">· {row.transactions} transaksi</small></span>
          </div>
          <div className="monthly-payment-track"><i style={{ width: `${Math.max(1, row.amount / maximum * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

const EXTRA_TYPE_LABEL: Record<string, string> = {
  EXTENSION: "Perpanjangan",
  ADD_ON: "Add-on",
  PRODUCT: "Produk",
  FOOD: "Makanan",
  BEVERAGE: "Minuman",
};

type CashflowRows = MonthlyReport["costs"]["current"]["weekly"];

function CashflowChart({ rows, fixedPayroll, showContribution, bucketWord = "minggu" }: {
  bucketWord?: string;
  rows: CashflowRows;
  fixedPayroll: number | null;
  showContribution: boolean;
}) {
  const hasData = rows.some((row) => row.revenue || row.commission || row.expenses || row.materials);
  if (!hasData) return <p className="monthly-empty-inline">Belum ada data pendapatan atau biaya pada periode ini.</p>;
  const chart = { left: 70, right: 990, top: 24, bottom: 222 };
  const costOf = (row: CashflowRows[number]) => row.commission + row.expenses + row.materials;
  const values = [
    ...rows.map((row) => row.revenue),
    ...rows.map(costOf),
    ...(showContribution ? rows.map((row) => row.cumulativeContribution) : []),
    ...(showContribution && fixedPayroll ? [fixedPayroll] : []),
  ];
  const rawMax = Math.max(...values, 1);
  const rawMin = Math.min(0, ...values);
  const step = (rawMax - rawMin) / 4;
  const top = rawMax;
  const bottom = rawMin;
  const plotHeight = chart.bottom - chart.top;
  const y = (value: number) => chart.bottom - (value - bottom) / (top - bottom) * plotHeight;
  const slot = (chart.right - chart.left) / rows.length;
  const barWidth = Math.min(46, slot * 0.28);
  const axisLabel = (value: number) => Math.abs(value) >= 1_000_000
    ? `${num(value / 1_000_000, 1)}jt`
    : Math.abs(value) >= 1_000 ? `${num(value / 1_000, 0)}rb` : num(value);
  const linePoints = rows.map((row, index) => `${chart.left + slot * (index + 0.5)},${y(row.cumulativeContribution)}`).join(" ");
  return (
    <>
      <svg className="monthly-daily-chart" viewBox="0 0 1000 260" role="img" aria-label={`Pendapatan dan biaya per ${bucketWord}`}>
        <title>{`Pendapatan vs biaya per ${bucketWord}`}</title>
        {Array.from({ length: 5 }, (_, index) => {
          const value = bottom + step * (4 - index);
          const lineY = y(value);
          return (
            <g key={index} className="monthly-chart-gridline">
              <line x1={chart.left} x2={chart.right} y1={lineY} y2={lineY} />
              <text x={chart.left - 8} y={lineY + 4} textAnchor="end">{axisLabel(value)}</text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const center = chart.left + slot * (index + 0.5);
          const revenueX = center - barWidth - 3;
          const costX = center + 3;
          let stackTop = y(0);
          const segments = (["commission", "expenses", "materials"] as const).map((kind) => {
            const height = Math.max(0, y(0) - y(row[kind]));
            stackTop -= height;
            return { kind, height, top: stackTop };
          });
          return (
            <g key={row.label}>
              <rect className="monthly-cash-revenue" x={revenueX} y={y(row.revenue)} width={barWidth} height={Math.max(0, y(0) - y(row.revenue))}>
                <title>{`Tgl ${row.label}: pendapatan ${rp(row.revenue)}`}</title>
              </rect>
              {segments.map((segment) => segment.height > 0 && (
                <rect key={segment.kind} className={`monthly-cash-${segment.kind}`} x={costX} y={segment.top} width={barWidth} height={segment.height}>
                  <title>{`Tgl ${row.label}: ${segment.kind === "commission" ? "komisi" : segment.kind === "expenses" ? "pengeluaran" : "bahan & HPP"} ${rp(row[segment.kind])}`}</title>
                </rect>
              ))}
              <text className="monthly-chart-date" x={center} y={chart.bottom + 20} textAnchor="middle">Tgl {row.label}</text>
            </g>
          );
        })}
        {showContribution && fixedPayroll !== null && fixedPayroll > 0 && (
          <g className="monthly-cash-fixed">
            <line x1={chart.left} x2={chart.right} y1={y(fixedPayroll)} y2={y(fixedPayroll)} />
            <text x={chart.right} y={y(fixedPayroll) - 6} textAnchor="end">Gaji & tunjangan bulan ini · {rp(fixedPayroll, { short: true })}</text>
          </g>
        )}
        {showContribution && (
          <g className="monthly-cash-line">
            <polyline points={linePoints} />
            {rows.map((row, index) => (
              <circle key={row.label} cx={chart.left + slot * (index + 0.5)} cy={y(row.cumulativeContribution)} r="4">
                <title>{`s.d. tgl ${row.end.slice(8)}: kontribusi kumulatif ${rp(row.cumulativeContribution)}`}</title>
              </circle>
            ))}
          </g>
        )}
      </svg>
      <div className="monthly-cash-legend">
        <span><i className="monthly-cash-revenue" />Pendapatan</span>
        <span><i className="monthly-cash-commission" />Komisi</span>
        <span><i className="monthly-cash-expenses" />Pengeluaran</span>
        <span><i className="monthly-cash-materials" />Bahan & HPP</span>
        {showContribution && <span><i className="monthly-cash-line-key" />Kontribusi kumulatif (sebelum gaji)</span>}
      </div>
    </>
  );
}

type UsageRows = MonthlyReport["inventory"]["current"]["weeklyUsage"];

function UsageChart({ rows, bucketWord = "minggu" }: { rows: UsageRows; bucketWord?: string }) {
  if (!rows.some((row) => row.visits || row.materialCost)) {
    return <p className="monthly-empty-inline">Belum ada kunjungan atau pemakaian bahan pada periode ini.</p>;
  }
  const chart = { left: 56, right: 930, top: 24, bottom: 222 };
  const plotHeight = chart.bottom - chart.top;
  const maxVisits = Math.max(...rows.map((row) => row.visits), 1);
  const maxCost = Math.max(...rows.map((row) => row.materialCost), 1);
  const yVisits = (value: number) => chart.bottom - value / maxVisits * plotHeight;
  const yCost = (value: number) => chart.bottom - value / maxCost * plotHeight;
  const slot = (chart.right - chart.left) / rows.length;
  const barWidth = Math.min(60, slot * 0.45);
  const costLabel = (value: number) => value >= 1_000_000 ? `${num(value / 1_000_000, 1)}jt` : `${num(value / 1_000, 0)}rb`;
  const points = rows.map((row, index) => `${chart.left + slot * (index + 0.5)},${yCost(row.materialCost)}`).join(" ");
  return (
    <>
      <svg className="monthly-daily-chart" viewBox="0 0 1000 260" role="img" aria-label={`Jumlah tamu dan biaya bahan per ${bucketWord}`}>
        <title>{`Jumlah tamu vs biaya bahan per ${bucketWord}`}</title>
        {Array.from({ length: 5 }, (_, index) => {
          const ratio = (4 - index) / 4;
          const lineY = chart.top + plotHeight * index / 4;
          return (
            <g key={index} className="monthly-chart-gridline">
              <line x1={chart.left} x2={chart.right} y1={lineY} y2={lineY} />
              <text x={chart.left - 8} y={lineY + 4} textAnchor="end">{num(maxVisits * ratio, 0)}</text>
              <text x={chart.right + 8} y={lineY + 4} textAnchor="start">{costLabel(maxCost * ratio)}</text>
            </g>
          );
        })}
        <text className="monthly-chart-date" x={chart.left - 8} y={14} textAnchor="end">tamu</text>
        <text className="monthly-chart-date" x={chart.right + 8} y={14} textAnchor="start">Rp bahan</text>
        {rows.map((row, index) => {
          const center = chart.left + slot * (index + 0.5);
          return (
            <g key={row.label}>
              <rect className="monthly-cash-revenue" x={center - barWidth / 2} y={yVisits(row.visits)} width={barWidth} height={Math.max(0, chart.bottom - yVisits(row.visits))}>
                <title>{`Tgl ${row.label}: ${row.visits} tamu`}</title>
              </rect>
              <text className="monthly-chart-date" x={center} y={chart.bottom + 20} textAnchor="middle">Tgl {row.label}</text>
            </g>
          );
        })}
        <g className="monthly-cash-line">
          <polyline points={points} />
          {rows.map((row, index) => (
            <circle key={row.label} cx={chart.left + slot * (index + 0.5)} cy={yCost(row.materialCost)} r="4">
              <title>{`Tgl ${row.label}: bahan ${rp(row.materialCost)}${row.costPerVisit === null ? "" : ` · ${rp(row.costPerVisit)}/tamu`}`}</title>
            </circle>
          ))}
        </g>
      </svg>
      <div className="monthly-cash-legend">
        <span><i className="monthly-cash-revenue" />Jumlah tamu (sumbu kiri)</span>
        <span><i className="monthly-cash-line-key" />Biaya bahan treatment (sumbu kanan)</span>
      </div>
    </>
  );
}

const USAGE_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  WAJAR: { label: "Wajar", tone: "success" },
  BOROS: { label: "Boros", tone: "danger" },
  HEMAT: { label: "Lebih hemat", tone: "warning" },
  TANPA_TAKARAN: { label: "Takaran belum diatur", tone: "neutral" },
};

function RevenueByCategory({ rows }: { rows: MonthlyReport["revenue"]["current"]["byCategory"] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (!total) return <p className="monthly-empty-inline">Belum ada data penjualan.</p>;
  const maximum = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <div className="monthly-payment-list">
      {rows.map((row) => (
        <div className="monthly-payment-row" key={row.key}>
          <div className="between g2">
            <strong>{row.label}</strong>
            <span>{row.amount ? rp(row.amount) : "—"} <small className="muted">· {pct(row.sharePct)} · {num(row.quantity)} item</small></span>
          </div>
          <div className="monthly-payment-track"><i style={{ width: `${row.amount ? Math.max(1, row.amount / maximum * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function VisitHeatmap({ values }: { values: MonthlyReport["customers"]["current"]["visitHoursByWeekday"] }) {
  if (!values.length) return <p className="monthly-empty-inline">Belum ada data kunjungan per jam.</p>;
  const hours = [...new Set(values.map((item) => item.hour))].sort((a, b) => a - b);
  const maximum = Math.max(...values.map((item) => item.visits), 1);
  const countAt = (weekday: number, hour: number) =>
    values.find((item) => item.weekday === weekday && item.hour === hour)?.visits ?? 0;
  return (
    <div className="table-wrap">
      <table className="tbl monthly-heatmap">
        <thead><tr><th>Jam</th>{weekdays.map((day) => <th key={day.day}>{day.label}</th>)}</tr></thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th>{String(hour).padStart(2, "0")}:00</th>
              {weekdays.map((day) => {
                const count = countAt(day.day, hour);
                return (
                  <td
                    key={day.day}
                    aria-label={`${day.label} pukul ${hour}: ${count} kunjungan`}
                    className={count ? "occupied" : ""}
                    style={{ backgroundColor: count ? `rgba(16, 185, 129, ${0.15 + count / maximum * 0.65})` : undefined }}
                  >
                    {count || "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function attentionReason(row: MonthlyReport["therapists"]["current"][number]) {
  if (row.averageRating !== null && row.averageRating <= 3) return `Rating ${num(row.averageRating, 1)} dari 5`;
  if (row.lateCount >= 3) return `${row.lateCount} kali terlambat`;
  if (row.performanceScore !== null && row.performanceScore < 60) return `Skor ${row.performanceScore}/100`;
  return null;
}

export default function MonthlyReport({
  data,
  tenantName,
  outletLabel,
  outletNames,
  pathname,
  isOwner,
  payrollHref,
  printDate,
  periodOptions,
  selectedOutlet,
  outletOptions,
  controls,
  monthlyHref,
}: MonthlyReportProps) {
  const isMonth = data.kind === "month";
  const text = KIND_TEXT[data.kind];
  const current = data.summary.current;
  const previous = data.summary.previous;
  const transactionsExist = data.revenue.current.byPaymentMethod.length > 0;
  const previousTransactionsExist = data.revenue.previous.byPaymentMethod.length > 0;
  const currentPayrollIncomplete = data.payrollMissingOutlets.current.length > 0;
  const previousPayrollIncomplete = data.payrollMissingOutlets.previous.length > 0;
  const payrollIncompleteMessage = currentPayrollIncomplete
    ? `Payroll ${data.payrollMissingOutlets.current.join(", ")} belum dihitung`
    : undefined;
  const hasCustomerData = data.customers.current.active + data.customers.current.noShow
    + data.customers.current.cancelled + data.customers.current.extendedSessions > 0;
  const hasProfitInputs = transactionsExist || (data.payroll.current?.rows.length ?? 0) > 0
    || (data.profit?.current.commission ?? 0) !== 0
    || data.costs.current.expensesByCategory.length > 0
    || data.costs.current.materials.some((item) => item.quantity > 0);
  const changeLabel = (
    current: number | null,
    previous: number | null,
    options: { points?: boolean; lowerIsBetter?: boolean } = {}
  ) => baseChangeLabel(current, previous, { ...options, vs: data.comparisonLabel });
  const metrics = [
    {
      label: "Pendapatan bersih",
      value: transactionsExist ? rp(current.revenue) : "Belum ada data",
      comparison: transactionsExist && previousTransactionsExist ? changeLabel(current.revenue, previous.revenue) : null,
    },
    {
      label: "Kunjungan",
      value: hasCustomerData || transactionsExist ? num(current.visits) : "Belum ada data",
      comparison: hasCustomerData && (previous.visits > 0 || data.customers.previous.active > 0)
        ? changeLabel(current.visits, previous.visits) : null,
    },
    {
      label: "Rata-rata transaksi",
      value: transactionsExist ? rp(current.averageTransaction) : "Belum ada data",
      comparison: transactionsExist && previousTransactionsExist ? changeLabel(current.averageTransaction, previous.averageTransaction) : null,
    },
    ...(isMonth ? [
    {
      label: "Biaya SDM",
      value: currentPayrollIncomplete ? "Tidak lengkap" : current.humanResourceCost === null ? "Belum ada data" : rp(current.humanResourceCost),
      detail: payrollIncompleteMessage,
      comparison: !currentPayrollIncomplete && !previousPayrollIncomplete
        ? changeLabel(current.humanResourceCost, previous.humanResourceCost, { lowerIsBetter: true })
        : null,
    },
    {
      label: "Biaya SDM / pendapatan",
      value: currentPayrollIncomplete ? "Tidak lengkap" : current.humanResourceCostPct === null ? "Belum ada data" : pct(current.humanResourceCostPct),
      detail: payrollIncompleteMessage,
      comparison: !currentPayrollIncomplete && !previousPayrollIncomplete
        ? changeLabel(current.humanResourceCostPct, previous.humanResourceCostPct, { points: true, lowerIsBetter: true })
        : null,
    },
    ] : [
      {
        label: "Komisi terapis",
        value: transactionsExist ? rp(current.commission) : "Belum ada data",
        detail: undefined,
        comparison: transactionsExist && previousTransactionsExist
          ? changeLabel(current.commission, previous.commission, { lowerIsBetter: true })
          : null,
      },
      {
        label: "Komisi / pendapatan",
        value: transactionsExist && current.revenue > 0 ? pct(current.commission / current.revenue * 100) : "Belum ada data",
        detail: undefined,
        comparison: transactionsExist && previousTransactionsExist && current.revenue > 0 && previous.revenue > 0
          ? changeLabel(current.commission / current.revenue * 100, previous.commission / previous.revenue * 100, { points: true, lowerIsBetter: true })
          : null,
      },
    ]),
    {
      label: "Utilisasi room",
      value: current.roomUtilizationPct === null ? "Tidak tersedia" : pct(current.roomUtilizationPct),
      comparison: previousTransactionsExist
        ? changeLabel(current.roomUtilizationPct, previous.roomUtilizationPct, { points: true })
        : null,
    },
    {
      label: "Rating rata-rata",
      value: current.averageRating === null ? "Belum ada data" : `${num(current.averageRating, 1)} / 5`,
      comparison: changeLabel(current.averageRating, previous.averageRating),
    },
    {
      label: "Pelanggan kembali",
      value: current.returningCustomerPct === null ? "Belum ada data" : pct(current.returningCustomerPct),
      comparison: previousTransactionsExist
        ? changeLabel(current.returningCustomerPct, previous.returningCustomerPct, { points: true })
        : null,
    },
    {
      label: "Pengeluaran",
      value: data.costs.current.expensesByCategory.length
        ? rp(data.costs.current.expensesByCategory.reduce((sum, row) => sum + row.amount, 0))
        : "Belum ada data",
      comparison: data.costs.current.expensesByCategory.length && data.costs.previous.expensesByCategory.length
        ? changeLabel(
          data.costs.current.expensesByCategory.reduce((sum, row) => sum + row.amount, 0),
          data.costs.previous.expensesByCategory.reduce((sum, row) => sum + row.amount, 0),
          { lowerIsBetter: true }
        )
        : null,
    },
    ...(data.profit && !isMonth ? [{
      label: "Kontribusi sebelum gaji",
      value: transactionsExist ? rp(data.profit.current.contributionBeforePayroll) : "Belum ada data",
      detail: undefined,
      comparison: transactionsExist && previousTransactionsExist
        ? changeLabel(data.profit.current.contributionBeforePayroll, data.profit.previous.contributionBeforePayroll)
        : null,
    }] : []),
    ...(data.profit && isMonth ? [{
      label: "Estimasi laba operasional",
      value: currentPayrollIncomplete
        ? "Tidak lengkap"
        : data.profit.current.total === null
          ? "Belum ada data"
        : hasProfitInputs ? rp(data.profit.current.total) : "Belum ada data",
      detail: payrollIncompleteMessage,
      comparison: !currentPayrollIncomplete && !previousPayrollIncomplete
        ? changeLabel(data.profit.current.total, data.profit.previous.total)
        : null,
    }] : []),
  ];
  const best = data.therapists.current
    .filter((row) => row.performanceScore !== null)
    .sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1))[0];
  const needsAttention = data.therapists.current
    .map((row) => ({ row, reason: attentionReason(row) }))
    .filter((item): item is { row: typeof data.therapists.current[number]; reason: string } => item.reason !== null)
    .sort((a, b) => (a.row.performanceScore ?? 101) - (b.row.performanceScore ?? 101))[0];
  const outletCount = Object.keys(outletNames).length;
  const serviceRows = data.revenue.current.byService;
  const extras = data.revenue.current.addOnsAndProducts;
  const hasPaidSales = transactionsExist || serviceRows.length > 0 || extras.length > 0;

  return (
    <div className="monthly-report">
      <div className="monthly-print-header">
        <h1>{text.title}</h1>
        <div><strong>{tenantName}</strong> · {outletLabel}</div>
        <div>Periode: {data.periodLabel} · Pembanding: {data.comparisonLabel}</div>
        <div>Status: {data.status} · Dicetak: {fmtDateLong(printDate)}</div>
      </div>
      <PageHead
        title={text.title}
        desc={`${outletLabel} · ${data.periodLabel} dibanding ${data.comparisonDays === null ? data.comparisonLabel : `hari yang sama ${text.noun} lalu (${data.comparisonLabel})`}`}
        actions={
          <>
            {controls ?? (periodOptions && (
              <MonthlyReportFilters
                pathname={pathname}
                period={data.period}
                periods={periodOptions}
                outlet={selectedOutlet}
                outlets={outletOptions}
              />
            ))}
            <Badge tone={data.status === "FINAL" ? "success" : "warning"}>{data.status}</Badge>
            <PrintButton label="Cetak / Simpan PDF" />
          </>
        }
      />

      <Section number="01" title="Ringkasan">
        <div className="monthly-metrics-grid">
          {metrics.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} comparison={metric.comparison} detail={metric.detail} />)}
        </div>
        {data.trend.length > 1 && (
          <Card className="monthly-card">
            <CardHead title={`Tren ${data.trend.length} ${text.noun} terakhir`} sub="Pendapatan dan jumlah transaksi lunas per periode; batang tergelap = periode laporan ini" />
            <div className="card-body"><TrendChart points={data.trend} noun={text.noun} /></div>
          </Card>
        )}
        {isOwner && (data.perOutlet?.current.length ?? 0) > 1 && (
          <Card className="monthly-card">
            <CardHead title="Perbandingan cabang" sub="Pendapatan dan biaya SDM pada periode terpilih" />
            <div className="card-body">
              <HorizontalBars
                rows={(data.perOutlet?.current ?? []).map((row) => ({
                  label: row.outletName,
                  value: row.revenue,
                  secondary: data.perOutlet?.previous.find((item) => item.outletId === row.outletId)?.revenue ?? 0,
                  note: `${num(row.visits)} kunjungan`,
                }))}
                primaryLabel={data.periodLabel}
                secondaryLabel={data.comparisonLabel}
                empty="Belum ada pendapatan cabang."
              />
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Cabang</th><th className="num">Pendapatan</th><th className="num">Kunjungan</th><th className="num">Rata-rata transaksi</th><th className="num">Biaya SDM / pendapatan</th></tr></thead>
                <tbody>
                  {data.perOutlet?.current.map((row) => (
                    <tr key={row.outletId}>
                      <td>{row.outletName}</td>
                      <td className="num">{transactionsExist ? rp(row.revenue) : "Belum ada data"}</td>
                      <td className="num">{hasCustomerData || transactionsExist ? num(row.visits) : "Belum ada data"}</td>
                      <td className="num">{transactionsExist ? rp(row.averageTransaction) : "Belum ada data"}</td>
                      <td className="num">{row.humanResourceCostPct === null ? "Belum ada data" : pct(row.humanResourceCostPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Section>

      <Section number="02" title="Pendapatan & Penjualan">
        {data.revenue.current.byDay.length > 1 && (
          <Card className="monthly-card">
            <CardHead title="Pendapatan per hari" sub="Akhir pekan ditandai dengan warna berbeda" />
            <div className="card-body"><DailyRevenueChart values={data.revenue.current.byDay} hasTransactions={transactionsExist} /></div>
          </Card>
        )}
        <div className="monthly-two-column">
          <Card className="monthly-card">
            <CardHead title="Pendapatan per jenis" sub="Layanan, perpanjangan, add-on, makanan & minuman, produk retail" />
            <div className="card-body monthly-chart-stack">
              <DonutChart slices={data.revenue.current.byCategory.map((row) => ({ label: row.label, value: row.amount }))} centerTitle="Total penjualan" empty="Belum ada data penjualan." />
              <RevenueByCategory rows={data.revenue.current.byCategory} />
            </div>
          </Card>
          <Card className="monthly-card">
            <CardHead title="Makanan & minuman" sub="Penjualan F&B dan laba kotornya" />
            {data.revenue.current.fnb.items.length ? (
              <>
                <div className="card-body">
                  <div className="monthly-fnb-stats">
                    <span><small className="muted">Transaksi dengan F&B</small><strong>{data.revenue.current.fnb.attachPct === null ? "—" : pct(data.revenue.current.fnb.attachPct)}</strong></span>
                    <span><small className="muted">Rata-rata F&B per transaksi</small><strong>{data.revenue.current.fnb.averagePerTransaction === null ? "—" : rp(data.revenue.current.fnb.averagePerTransaction)}</strong></span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Item</th><th className="num">Terjual</th><th className="num">Penjualan</th><th className="num">Laba kotor</th></tr></thead>
                    <tbody>
                      {data.revenue.current.fnb.items.map((row) => (
                        <tr key={row.name}><td>{row.name}</td><td className="num">{num(row.quantity)}</td><td className="num">{rp(row.amount)}</td><td className="num">{row.grossProfit === null ? "—" : rp(row.grossProfit)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada penjualan makanan & minuman pada periode ini.</p></div>}
          </Card>
        </div>
        <div className="monthly-two-column">
          <Card className="monthly-card">
            <CardHead title="Layanan & item terlaris" />
            {serviceRows.length > 0 && (
              <div className="card-body">
                <HorizontalBars
                  rows={serviceRows.slice(0, 8).map((row) => ({ label: row.name, value: row.amount, note: `${num(row.quantity)}×` }))}
                  empty="Belum ada layanan terjual."
                />
              </div>
            )}
            {serviceRows.length || extras.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Layanan / item</th><th className="num">Jumlah</th><th className="num">Nilai</th><th className="num">Porsi</th></tr></thead>
                  <tbody>
                    {serviceRows.map((row) => (
                      <tr key={`service-${row.name}`}><td>{row.name}</td><td className="num">{num(row.quantity)}</td><td className="num">{rp(row.amount)}</td><td className="num">{pct(row.sharePct)}</td></tr>
                    ))}
                    {extras.map((row) => (
                      <tr key={`${row.type}-${row.name}`}><td>{EXTRA_TYPE_LABEL[row.type] ?? row.type} · {row.name}</td><td className="num">{num(row.quantity)}</td><td className="num">{rp(row.amount)}</td><td className="num">—</td></tr>
                    ))}
                    <tr className="strong"><td colSpan={2}>Total transaksi PAID</td><td className="num">{hasPaidSales ? rp(current.revenue) : "Belum ada data"}</td><td className="num">100%</td></tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada data layanan atau penjualan.</p></div>}
          </Card>
          <Card className="monthly-card">
            <CardHead title="Metode pembayaran" />
            <div className="card-body monthly-chart-stack">
              <DonutChart slices={data.revenue.current.byPaymentMethod.map((row) => ({ label: row.method, value: row.amount }))} centerTitle="Total dibayar" empty="Belum ada transaksi pembayaran." />
              <Payments rows={data.revenue.current.byPaymentMethod} />
            </div>
          </Card>
        </div>
        <Card className="monthly-card">
          <CardHead title="Potongan promo" sub={`${data.revenue.current.promoTransactions} transaksi berpromo`} />
          <div className="card-body">
            {hasPaidSales
              ? <strong>{rp(data.revenue.current.promoDiscount)}</strong>
              : <p className="monthly-empty-inline">Belum ada data transaksi berpromo.</p>}
          </div>
        </Card>
      </Section>

      <Section number="03" title="Kunjungan & Pelanggan">
        <div className="monthly-customer-metrics">
          {[
            ["Pelanggan aktif", data.customers.current.active],
            ["Pelanggan baru", data.customers.current.new],
            ["Pelanggan kembali", data.customers.current.returning],
            ["No-show", data.customers.current.noShow],
            ["Dibatalkan", data.customers.current.cancelled],
            ["Sesi diperpanjang", data.customers.current.extendedSessions],
          ].map(([label, value]) => (
            <Metric key={String(label)} label={String(label)} value={hasCustomerData ? num(Number(value)) : "Belum ada data"} />
          ))}
        </div>
        {hasCustomerData && (
          <div className="monthly-two-column">
            <Card className="monthly-card">
              <CardHead title="Pelanggan baru vs kembali" sub={`${num(data.customers.current.active)} pelanggan aktif`} />
              <div className="card-body">
                <DonutChart
                  slices={[
                    { label: "Pelanggan baru", value: data.customers.current.new },
                    { label: "Pelanggan kembali", value: data.customers.current.returning },
                  ]}
                  centerTitle="Pelanggan"
                  format={(value) => num(value)}
                  empty="Belum ada pelanggan pada periode ini."
                />
              </div>
            </Card>
            <Card className="monthly-card">
              <CardHead title="Kunjungan per hari" sub="Total sesi selesai menurut hari dalam seminggu" />
              <div className="card-body">
                <ColumnChart rows={visitsByWeekday(data.customers.current.visitHoursByWeekday)} empty="Belum ada data kunjungan." />
              </div>
            </Card>
          </div>
        )}
        <Card className="monthly-card">
          <CardHead title="Peta keramaian kunjungan" sub="Jumlah sesi selesai menurut jam dan hari" />
          <div className="card-body"><VisitHeatmap values={data.customers.current.visitHoursByWeekday} /></div>
        </Card>
      </Section>

      <Section number="04" title={isMonth ? "SDM & Payroll" : "SDM & Komisi"}>
        {!isMonth ? (
          <Card className="monthly-card">
            <CardHead title={`Komisi terapis ${data.periodLabel}`} sub="Dari entri komisi yang tercatat saat pembayaran; kehadiran per terapis ada di bagian 05" />
            <div className="card-body">
              <div className="monthly-customer-metrics">
                <Metric label="Total komisi" value={transactionsExist ? rp(current.commission) : "Belum ada data"} comparison={transactionsExist && previousTransactionsExist ? changeLabel(current.commission, previous.commission, { lowerIsBetter: true }) : null} />
                <Metric label="Terapis bertugas" value={num(data.therapists.current.filter((row) => row.treatments > 0).length)} />
                <Metric label="Treatment selesai" value={num(data.therapists.current.reduce((sum, row) => sum + row.treatments, 0))} />
              </div>
              <p className="monthly-empty-inline">
                {text.payrollNote}. Slip payroll, gaji pokok, tunjangan, dan potongan ada di Laporan Bulanan.
                {monthlyHref && <> <Link className="no-print" href={monthlyHref}>Buka Laporan Bulanan →</Link></>}
              </p>
            </div>
          </Card>
        ) : data.payroll.current ? (
          <Card className="monthly-card">
            <CardHead title="Payroll tersimpan" sub="Slip payroll final untuk periode terpilih" />
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Karyawan</th><th>Cabang</th><th>Jabatan</th><th className="num">Gaji pokok</th><th className="num">Tunjangan</th><th className="num">Komisi</th><th className="num">Potongan</th><th className="num">Take-home</th></tr></thead>
                <tbody>
                  {data.payroll.current.rows.map((row) => (
                    <tr key={`${row.outletId}-${row.employeeId}`}>
                      <td>{row.employeeName || "—"}</td><td>{row.outletName || outletNames[row.outletId] || "—"}</td>
                      <td>{row.jobTitle ?? "—"}</td><td className="num">{rp(row.fixed)}</td>
                      <td className="num">{rp(row.allowance)}</td><td className="num">{rp(row.commission)}</td>
                      <td className="num">{rp(row.deductions)}</td><td className="num strong">{rp(row.netPay)}</td>
                    </tr>
                  ))}
                  <tr className="strong">
                    <td colSpan={3}>Total</td><td className="num">{rp(data.payroll.current.rows.reduce((sum, row) => sum + row.fixed, 0))}</td>
                    <td className="num">{rp(data.payroll.current.rows.reduce((sum, row) => sum + row.allowance, 0))}</td>
                    <td className="num">{rp(data.payroll.current.rows.reduce((sum, row) => sum + row.commission, 0))}</td>
                    <td className="num">{rp(data.payroll.current.totalDeductions)}</td><td className="num">{rp(data.payroll.current.totalNetPay)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="monthly-card">
            <div className="card-body">
              <EmptyState
                title="Payroll belum dihitung untuk periode ini"
                desc="Biaya SDM dan estimasi laba menunggu slip payroll tersimpan."
                action={<Link className="btn btn-primary btn-sm no-print" href={payrollHref}>Buka Payroll {data.periodLabel}</Link>}
              />
            </div>
          </Card>
        )}
      </Section>

      <Section number="05" title="Kinerja Terapis">
        <div className="monthly-highlight-grid">
          <Card className="monthly-highlight">
            <CardHead title={`Terbaik ${text.noun} ini`} />
            <div className="card-body">
              {best ? (
                <>
                  <strong>{best.name}</strong>
                  <p>{best.performanceScore}/100 · {outletNames[best.outletId] ?? "Cabang"}</p>
                  <small>{best.treatments} treatment · rating {showValue(best.averageRating, (value) => `${num(value, 1)}/5`)}</small>
                </>
              ) : <p className="monthly-empty-inline">Belum cukup data untuk menentukan peringkat.</p>}
            </div>
          </Card>
          <Card className="monthly-highlight">
            <CardHead title="Perlu perhatian" />
            <div className="card-body">
              {needsAttention ? (
                <>
                  <strong>{needsAttention.row.name}</strong>
                  <p>{needsAttention.reason} · {outletNames[needsAttention.row.outletId] ?? "Cabang"}</p>
                  <small>Gunakan data ini sebagai sinyal tindak lanjut, bukan penilaian tunggal.</small>
                </>
              ) : <p className="monthly-empty-inline">Tidak ada indikator perhatian berbasis data pada periode ini.</p>}
            </div>
          </Card>
        </div>
        {data.therapists.current.some((row) => row.generatedRevenue > 0) && (
          <Card className="monthly-card">
            <CardHead title="Pendapatan per terapis" sub="Urut pendapatan yang dihasilkan; catatan = jumlah treatment dan skor kinerja" />
            <div className="card-body">
              <HorizontalBars
                rows={[...data.therapists.current]
                  .sort((a, b) => b.generatedRevenue - a.generatedRevenue)
                  .map((row) => ({
                    label: outletCount > 1 ? `${row.name} · ${outletNames[row.outletId] ?? ""}` : row.name,
                    value: row.generatedRevenue,
                    note: `${num(row.treatments)} treatment${row.performanceScore === null ? "" : ` · skor ${row.performanceScore}`}`,
                  }))}
                color="#3b82f6"
                empty="Belum ada pendapatan per terapis."
              />
            </div>
          </Card>
        )}
        {data.therapists.current.length ? (
          <Card className="monthly-card">
            <CardHead title="Peringkat terapis" sub="Skor: jumlah tamu 40% · rating pelanggan 25% · kehadiran 25% · ketepatan waktu 10%" />
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>#</th><th>Terapis</th>{outletCount > 1 && <th>Cabang</th>}<th className="num">Skor</th><th className="num">Treatment</th><th className="num">Pendapatan dihasilkan</th><th className="num">Komisi</th><th className="num">Rating (ulasan)</th><th className="num">Sesi diperpanjang</th><th className="num">Kehadiran</th><th className="num">Terlambat</th><th className="num">Cuti/libur</th><th className="num">Nilai manajemen</th></tr></thead>
                <tbody>
                  {[...data.therapists.current].sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1)).map((row, index) => (
                    <tr key={row.employeeId}>
                      <td>{index + 1}</td><td>{row.name}</td>{outletCount > 1 && <td>{outletNames[row.outletId] ?? "—"}</td>}
                      <td className="num">{row.performanceScore === null ? "Belum cukup data" : `${row.performanceScore}/100`}</td>
                      <td className="num">{num(row.treatments)}</td><td className="num">{rp(row.generatedRevenue)}</td>
                      <td className="num">{rp(row.commission)}</td>
                      <td className="num">{row.averageRating === null ? "—" : `${num(row.averageRating, 1)} (${num(row.reviewCount)})`}</td>
                      <td className="num">{row.extendedSessionPct === null ? "—" : pct(row.extendedSessionPct)}</td>
                      <td className="num">{row.attendancePct === null ? (row.expectedDays === 0 ? "—" : "Belum ada data") : `${num(row.presentDays)}/${num(row.expectedDays)} (${pct(row.attendancePct)})`}</td>
                      <td className="num">{num(row.lateCount)}</td>
                      <td className="num">{num(row.leaveDays)}</td>
                      <td className="num">{row.managementRating === null ? "—" : `${num(row.managementRating, 1)}/5`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="monthly-card"><div className="card-body"><p className="monthly-empty-inline">Belum ada data kinerja terapis.</p></div></Card>
        )}
      </Section>

      <Section number="06" title="Pendapatan vs Biaya">
        <Card className="monthly-card">
          <CardHead
            title={`Pendapatan vs biaya per ${text.bucket}`}
            sub={isOwner
              ? `Batang kiri pendapatan, batang kanan biaya variabel. Garis = kontribusi kumulatif sebelum gaji${isMonth ? "; bulan menutup gaji saat garis melewati garis putus-putus" : ""}.`
              : "Batang kiri pendapatan, batang kanan biaya variabel (komisi, pengeluaran, bahan & HPP)."}
          />
          <div className="card-body">
            <CashflowChart rows={data.costs.current.weekly} fixedPayroll={isMonth ? data.costs.current.fixedPayroll : null} showContribution={Boolean(data.profit)} bucketWord={text.bucket} />
          </div>
          {data.costs.current.weekly.length > 0 && (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>{isMonth ? "Minggu" : "Tanggal"}</th><th className="num">Pendapatan</th><th className="num">Komisi</th><th className="num">Pengeluaran</th><th className="num">Bahan & HPP</th>{data.profit && <th className="num">Kontribusi</th>}</tr></thead>
                <tbody>
                  {data.costs.current.weekly.map((row) => (
                    <tr key={row.label}>
                      <td>Tgl {row.label}</td><td className="num">{rp(row.revenue)}</td><td className="num">{rp(row.commission)}</td>
                      <td className="num">{rp(row.expenses)}</td><td className="num">{rp(row.materials)}</td>
                      {data.profit && <td className="num">{rp(row.contribution)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="monthly-card">
          <CardHead title="Pengeluaran per kategori" sub="Pengeluaran yang diajukan/disetujui pada periode ini" />
          {data.costs.current.expensesByCategory.length > 0 && (
            <div className="card-body">
              <HorizontalBars
                rows={data.costs.current.expensesByCategory.map((row) => ({
                  label: row.category,
                  value: row.amount,
                  secondary: data.costs.previous.expensesByCategory.find((item) => item.category === row.category)?.amount ?? 0,
                }))}
                primaryLabel={data.periodLabel}
                secondaryLabel={data.comparisonLabel}
                color="#ef4444"
                empty="Belum ada pengeluaran."
              />
            </div>
          )}
          {data.costs.current.expensesByCategory.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Kategori</th><th className="num">{`${text.noun[0].toUpperCase()}${text.noun.slice(1)} ini`}</th><th className="num">{data.comparisonLabel}</th><th className="num">% pendapatan</th></tr></thead>
                <tbody>
                  {data.costs.current.expensesByCategory.map((row) => {
                    const previousRow = data.costs.previous.expensesByCategory.find((item) => item.category === row.category);
                    return (
                      <tr key={row.category}>
                        <td>{row.category}</td><td className="num">{rp(row.amount)}</td>
                        <td className="num">{previousRow ? rp(previousRow.amount) : "—"}</td>
                        <td className="num">{current.revenue > 0 ? pct(row.amount / current.revenue * 100) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada pengeluaran tercatat pada periode ini.</p></div>}
        </Card>
      </Section>

      <Section number="07" title="Inventory & Pemakaian Bahan">
        <Card className="monthly-card">
          <CardHead
            title={`Jumlah tamu vs biaya bahan per ${text.bucket}`}
            sub={data.inventory.current.materialCostPerVisit === null
              ? "Biaya bahan = unit yang dikeluarkan dari gudang ke ruang treatment"
              : `Rata-rata biaya bahan ${rp(data.inventory.current.materialCostPerVisit)} per tamu${data.inventory.previous.materialCostPerVisit === null ? "" : ` (${data.comparisonLabel}: ${rp(data.inventory.previous.materialCostPerVisit)})`}`}
          />
          <div className="card-body"><UsageChart rows={data.inventory.current.weeklyUsage} bucketWord={text.bucket} /></div>
        </Card>
        <Card className="monthly-card">
          <CardHead
            title="Pemakaian bahan vs perkiraan"
            sub={data.status === "FINAL"
              ? "Perkiraan = jumlah tamu ÷ takaran (1 unit ≈ N tamu). Selisih dalam ±20% dianggap wajar."
              : `Periode masih berjalan: bahan diambil per pak/botol sehingga selisih belum bermakna. Status Wajar/Boros dinilai setelah ${text.noun} tutup.`}
          />
          {data.inventory.current.consumables.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Bahan</th><th className="num">Takaran</th><th className="num">Dikeluarkan</th><th className="num">Perkiraan</th><th className="num">Selisih</th><th className="num">Biaya</th><th>Status</th></tr></thead>
                <tbody>
                  {data.inventory.current.consumables.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.name}</td>
                      <td className="num">{row.guestsPerUnit === null ? "—" : `1 ${row.uom} ≈ ${num(row.guestsPerUnit, 1)} tamu`}</td>
                      <td className="num">{num(row.issuedUnits, 1)} {row.uom}</td>
                      <td className="num">{row.expectedUnits === null ? "—" : `${num(row.expectedUnits, 1)} ${row.uom}`}</td>
                      <td className="num">{row.variancePct === null ? "—" : `${row.variancePct > 0 ? "+" : ""}${num(row.variancePct, 0)}%`}</td>
                      <td className="num">{rp(row.cost)}</td>
                      <td>{data.status === "FINAL" || row.status === "TANPA_TAKARAN"
                        ? <Badge tone={USAGE_STATUS[row.status].tone}>{USAGE_STATUS[row.status].label}</Badge>
                        : <span className="muted small">Dinilai setelah {text.noun} tutup</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-body">
              <p className="monthly-empty-inline">Belum ada bahan dengan takaran atau pemakaian tercatat. Atur takaran di Inventory → Daftar Produk, lalu catat lewat tombol &ldquo;Keluarkan Bahan&rdquo;.</p>
            </div>
          )}
        </Card>
        {/* 18 Okt 2026: 6 kolom rupiah tidak muat di setengah lebar A4 (terpotong
            di PDF) — kartu ini sekarang selebar penuh, stok minimum di bawahnya. */}
        <div className="stack g4">
          <Card className="monthly-card">
            <CardHead title="Pergerakan stok per kategori (Rp)" sub={`Nilai stok saat ini ${rp(data.inventory.current.stockValueNow)} (harga pokok)`} />
            {data.inventory.current.byCategory.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Kategori</th><th className="num">Pembelian</th><th className="num">Terjual (HPP)</th><th className="num">Pemakaian</th><th className="num">Transfer</th><th className="num">Selisih opname</th></tr></thead>
                  <tbody>
                    {data.inventory.current.byCategory.map((row) => (
                      <tr key={row.category}>
                        <td>{row.category}</td><td className="num">{rp(row.purchased)}</td><td className="num">{rp(row.sold)}</td>
                        <td className="num">{rp(row.usedInTreatment)}</td><td className="num">{rp(row.transferNet)}</td>
                        <td className="num">{rp(row.opnameVariance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada pergerakan stok pada periode ini.</p></div>}
          </Card>
          <Card className="monthly-card">
            <CardHead title="Stok di bawah minimum" sub={`Selisih stok opname ${text.noun} ini ${rp(data.inventory.current.opnameVarianceTotal)}`} />
            {data.costs.current.lowStockItems.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Produk</th><th>Cabang</th><th className="num">Stok</th><th className="num">Minimum</th></tr></thead>
                  <tbody>
                    {data.costs.current.lowStockItems.map((row) => (
                      <tr key={`${row.outletId}-${row.productId}`}>
                        <td>{row.name}</td><td>{outletNames[row.outletId] ?? "—"}</td>
                        <td className="num">{num(row.quantity)}</td><td className="num">{num(row.minimum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="card-body"><p className="monthly-empty-inline">Semua stok di atas minimum.</p></div>}
          </Card>
        </div>
      </Section>

      {data.profit && !isMonth && (
        <Section number="08" title="Kontribusi Sebelum Gaji">
          <Card className="monthly-card">
            <CardHead title="Dari pendapatan ke kontribusi" sub="Pendapatan dikurangi biaya variabel satu per satu; persen = porsi dari pendapatan" />
            <div className="card-body">
              <WaterfallChart
                start={{ label: "Pendapatan", value: data.profit.current.revenue }}
                steps={[
                  { label: "Komisi", value: data.profit.current.commission },
                  { label: "Pengeluaran", value: data.profit.current.expenses ?? 0 },
                  { label: "Bahan treatment", value: data.profit.current.materials ?? 0 },
                  { label: "HPP produk", value: data.profit.current.costOfGoodsSold ?? 0 },
                ]}
                resultLabel="Kontribusi"
              />
            </div>
          </Card>
          <Card className="monthly-card">
            <CardHead title="Kontribusi per cabang" sub="Pendapatan − komisi − pengeluaran − bahan treatment − HPP produk. Gaji & tunjangan tetap dihitung di laporan bulanan." />
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Cabang</th><th className="num">Pendapatan</th><th className="num">Komisi</th><th className="num">Pengeluaran</th><th className="num">Bahan treatment</th><th className="num">HPP produk</th><th className="num">Kontribusi</th><th className="num">% pendapatan</th></tr></thead>
                <tbody>
                  {data.profit.perOutlet.current.map((row) => {
                    const contribution = row.revenue - row.commission - (row.expenses ?? 0) - (row.materials ?? 0) - (row.costOfGoodsSold ?? 0);
                    return (
                      <tr key={row.outletId}>
                        <td>{row.outletName}</td><td className="num">{rp(row.revenue)}</td><td className="num">{rp(row.commission)}</td>
                        <td className="num">{rp(row.expenses ?? 0)}</td><td className="num">{rp(row.materials ?? 0)}</td><td className="num">{rp(row.costOfGoodsSold ?? 0)}</td>
                        <td className="num strong">{rp(contribution)}</td><td className="num">{row.revenue > 0 ? pct(contribution / row.revenue * 100) : "—"}</td>
                      </tr>
                    );
                  })}
                  {data.profit.perOutlet.current.length > 1 && (
                    <tr className="strong">
                      <td>Total</td><td className="num">{rp(data.profit.current.revenue)}</td><td className="num">{rp(data.profit.current.commission)}</td>
                      <td className="num">{rp(data.profit.current.expenses ?? 0)}</td><td className="num">{rp(data.profit.current.materials ?? 0)}</td><td className="num">{rp(data.profit.current.costOfGoodsSold ?? 0)}</td>
                      <td className="num">{rp(data.profit.current.contributionBeforePayroll)}</td>
                      <td className="num">{data.profit.current.revenue > 0 ? pct(data.profit.current.contributionBeforePayroll / data.profit.current.revenue * 100) : "—"}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="monthly-profit-note">Kontribusi ini belum dikurangi gaji pokok & tunjangan, dan bukan laporan laba-rugi akuntansi.</p>
        </Section>
      )}

      {data.profit && isMonth && (
        <Section number="08" title="Estimasi Laba Operasional">
          <Card className="monthly-card">
            <CardHead
              title={data.profit.current.payrollCost === null ? "Dari pendapatan ke kontribusi (gaji belum dihitung)" : "Dari pendapatan ke estimasi laba"}
              sub="Pendapatan dikurangi biaya satu per satu; persen = porsi dari pendapatan"
            />
            <div className="card-body">
              <WaterfallChart
                start={{ label: "Pendapatan", value: data.profit.current.revenue }}
                steps={[
                  { label: "Komisi", value: data.profit.current.commission },
                  ...(data.profit.current.payrollCost === null ? [] : [{ label: "Gaji & tunjangan", value: data.profit.current.payrollCost }]),
                  { label: "Pengeluaran", value: data.profit.current.expenses ?? 0 },
                  { label: "Bahan treatment", value: data.profit.current.materials ?? 0 },
                  { label: "HPP produk", value: data.profit.current.costOfGoodsSold ?? 0 },
                ]}
                resultLabel={data.profit.current.payrollCost === null ? "Kontribusi" : "Estimasi laba"}
              />
            </div>
          </Card>
          <Card className="monthly-card">
            <CardHead title="Estimasi per cabang" sub="Komisi dihitung satu kali; gaji & tunjangan tidak mencakup komisi." />
            {data.profit.perOutlet.current.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Cabang</th><th className="num">Pendapatan</th><th className="num">Komisi</th><th className="num">Gaji & tunjangan</th><th className="num">Pengeluaran</th><th className="num">Bahan treatment</th><th className="num">HPP produk terjual</th><th className="num">Estimasi laba</th><th className="num">% pendapatan</th></tr></thead>
                  <tbody>
                    {data.profit.perOutlet.current.map((row) => (
                      <tr key={row.outletId}>
                        <td>{row.outletName}</td>                        <td className="num">{transactionsExist ? rp(row.revenue) : "Belum ada data"}</td><td className="num">{rp(row.commission)}</td>
                        <td className="num">{row.payrollCost === null ? "Belum dihitung" : rp(row.payrollCost)}</td>
                        <td className="num">{row.expenses === null ? "Belum ada data" : rp(row.expenses)}</td>
                        <td className="num">{row.materials === null ? "Belum ada data" : rp(row.materials)}</td>
                        <td className="num">{row.costOfGoodsSold === null ? "Belum ada data" : rp(row.costOfGoodsSold)}</td>
                        <td className="num strong">
                          {row.profit === null
                            ? "Belum dihitung"
                            : row.revenue === 0 && row.commission === 0 && row.payrollCost === null && row.expenses === null && row.materials === null
                              ? "Belum ada data"
                              : rp(row.profit)}
                        </td>
                        <td className="num">{row.profit === null || row.revenue <= 0 ? "—" : pct(row.profit / row.revenue * 100)}</td>
                      </tr>
                    ))}
                    <tr className="strong">
                      <td>Total</td>                      <td className="num">{transactionsExist ? rp(data.profit.current.revenue) : "Belum ada data"}</td>
                      <td className="num">{rp(data.profit.current.commission)}</td>
                      <td className="num">{data.profit.current.payrollCost === null ? "Belum dihitung" : rp(data.profit.current.payrollCost)}</td>
                      <td className="num">{data.profit.current.expenses === null ? "Belum ada data" : rp(data.profit.current.expenses)}</td>
                      <td className="num">{data.profit.current.materials === null ? "Belum ada data" : rp(data.profit.current.materials)}</td>
                      <td className="num">{data.profit.current.costOfGoodsSold === null ? "Belum ada data" : rp(data.profit.current.costOfGoodsSold)}</td>
                      <td className="num">{data.profit.current.total === null
                        ? "Belum dihitung"
                        : hasProfitInputs ? rp(data.profit.current.total) : "Belum ada data"}</td>
                      <td className="num">{data.profit.current.total === null || data.profit.current.revenue <= 0 ? "—" : pct(data.profit.current.total / data.profit.current.revenue * 100)}</td>
                    </tr>
                  </tbody>
              </table>
            </div>
          ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada data laba per cabang.</p></div>}
          </Card>
          <p className="monthly-profit-note">Estimasi ini bukan laporan laba-rugi akuntansi.</p>
        </Section>
      )}
    </div>
  );
}
