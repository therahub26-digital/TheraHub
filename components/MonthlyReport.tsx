import Link from "next/link";
import { Badge, Card, CardHead, EmptyState, PageHead } from "@/components/ui";
import MonthlyReportFilters from "@/components/MonthlyReportFilters";
import PrintButton from "@/components/PrintButton";
import { fmtDateLong, monthLabel, num, pct, rp } from "@/lib/format";
import { percentageChange, percentagePointChange } from "@/lib/data/monthly-report-math";
import type { MonthlyReport } from "@/lib/data/monthly-report";

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
  periodOptions: { value: string; label: string }[];
  selectedOutlet?: string;
  outletOptions?: OutletOption[];
};

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

function changeLabel(
  current: number | null,
  previous: number | null,
  options: { points?: boolean; lowerIsBetter?: boolean } = {}
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
    label: `${arrow} ${change > 0 ? "+" : ""}${num(change, 1)}${options.points ? " poin" : "%"} vs bulan sebelumnya`,
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
}: MonthlyReportProps) {
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
    {
      label: "Utilisasi room",
      value: current.roomUtilizationPct === null ? "Tidak tersedia" : pct(current.roomUtilizationPct),
      comparison: changeLabel(current.roomUtilizationPct, previous.roomUtilizationPct, { points: true }),
    },
    {
      label: "Rating rata-rata",
      value: current.averageRating === null ? "Belum ada data" : `${num(current.averageRating, 1)} / 5`,
      comparison: changeLabel(current.averageRating, previous.averageRating),
    },
    {
      label: "Pelanggan kembali",
      value: current.returningCustomerPct === null ? "Belum ada data" : pct(current.returningCustomerPct),
      comparison: changeLabel(current.returningCustomerPct, previous.returningCustomerPct, { points: true }),
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
    ...(data.profit ? [{
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
  const serviceRows = data.revenue.current.byService;
  const extras = data.revenue.current.addOnsAndProducts;
  const hasPaidSales = transactionsExist || serviceRows.length > 0 || extras.length > 0;

  return (
    <div className="monthly-report">
      <div className="monthly-print-header">
        <h1>Laporan Bulanan</h1>
        <div><strong>{tenantName}</strong> · {outletLabel}</div>
        <div>Periode: {monthLabel(data.period)} · Pembanding: {monthLabel(data.previousPeriod)}</div>
        <div>Status: {data.status} · Dicetak: {fmtDateLong(printDate)}</div>
      </div>
      <PageHead
        title="Laporan Bulanan"
        desc={`${outletLabel} · ${monthLabel(data.period)} dibanding ${monthLabel(data.previousPeriod)}`}
        actions={
          <>
            <MonthlyReportFilters
              pathname={pathname}
              period={data.period}
              periods={periodOptions}
              outlet={selectedOutlet}
              outlets={outletOptions}
            />
            <Badge tone={data.status === "FINAL" ? "success" : "warning"}>{data.status}</Badge>
            <PrintButton label="Cetak / Simpan PDF" />
          </>
        }
      />

      <Section number="01" title="Ringkasan">
        <div className="monthly-metrics-grid">
          {metrics.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} comparison={metric.comparison} detail={metric.detail} />)}
        </div>
        {isOwner && (data.perOutlet?.current.length ?? 0) > 1 && (
          <Card className="monthly-card">
            <CardHead title="Perbandingan cabang" sub="Pendapatan dan biaya SDM pada periode terpilih" />
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
        <Card className="monthly-card">
          <CardHead title="Pendapatan harian" sub="Akhir pekan ditandai dengan warna berbeda" />
          <div className="card-body"><DailyRevenueChart values={data.revenue.current.byDay} hasTransactions={transactionsExist} /></div>
        </Card>
        <div className="monthly-two-column">
          <Card className="monthly-card">
            <CardHead title="Layanan terlaris" />
            {serviceRows.length || extras.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Layanan / item</th><th className="num">Jumlah</th><th className="num">Nilai</th><th className="num">Porsi</th></tr></thead>
                  <tbody>
                    {serviceRows.map((row) => (
                      <tr key={`service-${row.name}`}><td>{row.name}</td><td className="num">{num(row.quantity)}</td><td className="num">{rp(row.amount)}</td><td className="num">{pct(row.sharePct)}</td></tr>
                    ))}
                    {extras.map((row) => (
                      <tr key={`${row.type}-${row.name}`}><td>{row.type === "PRODUCT" ? "Produk" : "Add-on"} · {row.name}</td><td className="num">{num(row.quantity)}</td><td className="num">{rp(row.amount)}</td><td className="num">—</td></tr>
                    ))}
                    <tr className="strong"><td colSpan={2}>Total transaksi PAID</td><td className="num">{hasPaidSales ? rp(current.revenue) : "Belum ada data"}</td><td className="num">100%</td></tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="card-body"><p className="monthly-empty-inline">Belum ada data layanan atau penjualan.</p></div>}
          </Card>
          <Card className="monthly-card">
            <CardHead title="Metode pembayaran" />
            <div className="card-body"><Payments rows={data.revenue.current.byPaymentMethod} /></div>
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
        <Card className="monthly-card">
          <CardHead title="Peta keramaian kunjungan" sub="Jumlah sesi selesai menurut jam dan hari" />
          <div className="card-body"><VisitHeatmap values={data.customers.current.visitHoursByWeekday} /></div>
        </Card>
      </Section>

      <Section number="04" title="SDM & Payroll">
        {data.payroll.current ? (
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
                action={<Link className="btn btn-primary btn-sm no-print" href={payrollHref}>Buka Payroll {monthLabel(data.period)}</Link>}
              />
            </div>
          </Card>
        )}
      </Section>

      <Section number="05" title="Kinerja Terapis">
        <div className="monthly-highlight-grid">
          <Card className="monthly-highlight">
            <CardHead title="Terbaik bulan ini" />
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
        {data.therapists.current.length ? (
          <Card className="monthly-card">
            <CardHead title="Peringkat terapis" />
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>#</th><th>Terapis</th><th>Cabang</th><th className="num">Skor</th><th className="num">Treatment</th><th className="num">Pendapatan dihasilkan</th><th className="num">Komisi</th><th className="num">Rating</th><th className="num">Sesi diperpanjang</th><th className="num">Terlambat</th></tr></thead>
                <tbody>
                  {[...data.therapists.current].sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1)).map((row, index) => (
                    <tr key={row.employeeId}>
                      <td>{index + 1}</td><td>{row.name}</td><td>{outletNames[row.outletId] ?? "—"}</td>
                      <td className="num">{row.performanceScore === null ? "Belum cukup data" : `${row.performanceScore}/100`}</td>
                      <td className="num">{num(row.treatments)}</td><td className="num">{rp(row.generatedRevenue)}</td>
                      <td className="num">{rp(row.commission)}</td><td className="num">{showValue(row.averageRating, (value) => num(value, 1))}</td>
                      <td className="num">{row.extendedSessionPct === null ? "Belum ada data" : pct(row.extendedSessionPct)}</td><td className="num">{num(row.lateCount)}</td>
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

      {data.profit && (
        <Section number="08" title="Estimasi Laba Operasional">
          <Card className="monthly-card">
            <CardHead title="Estimasi per cabang" sub="Komisi dihitung satu kali; gaji & tunjangan tidak mencakup komisi." />
            {data.profit.perOutlet.current.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Cabang</th><th className="num">Pendapatan</th><th className="num">Komisi</th><th className="num">Gaji & tunjangan</th><th className="num">Pengeluaran</th><th className="num">Bahan</th><th className="num">Estimasi laba</th><th className="num">% pendapatan</th></tr></thead>
                  <tbody>
                    {data.profit.perOutlet.current.map((row) => (
                      <tr key={row.outletId}>
                        <td>{row.outletName}</td>                        <td className="num">{transactionsExist ? rp(row.revenue) : "Belum ada data"}</td><td className="num">{rp(row.commission)}</td>
                        <td className="num">{row.payrollCost === null ? "Belum dihitung" : rp(row.payrollCost)}</td>
                        <td className="num">{row.expenses === null ? "Belum ada data" : rp(row.expenses)}</td>
                        <td className="num">{row.materials === null ? "Belum ada data" : rp(row.materials)}</td>
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
