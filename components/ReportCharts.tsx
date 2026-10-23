// Grafik laporan (2026-10-23). Semua SVG murni tanpa JS di klien, supaya
// tampil sama di layar, pratinjau cetak, dan PDF. Warna diisi inline (bukan
// background CSS) karena aturan @media print memutihkan semua background.
import { num, pct, rp } from "@/lib/format";
import type { TrendPoint } from "@/lib/data/monthly-report";

export const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];
const MUTED = "#94a3b8";

function short(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const tidy = (amount: number, decimals: number) => num(amount, decimals).replace(/,0$/, "");
  if (abs >= 1_000_000_000) return `${sign}${tidy(abs / 1_000_000_000, 1)}M`;
  if (abs >= 1_000_000) return `${sign}${tidy(abs / 1_000_000, abs >= 10_000_000 ? 0 : 1)}jt`;
  if (abs >= 1_000) return `${sign}${tidy(abs / 1_000, 0)}rb`;
  return `${sign}${num(abs)}`;
}

/** Batas atas sumbu yang bulat (1, 2, 2.5, 5 × 10ⁿ per garis) supaya label grid enak dibaca. */
function niceMax(value: number, ticks = 4): number {
  if (value <= 0) return 1;
  const raw = value / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? raw;
  return step * ticks;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function Empty({ text }: { text: string }) {
  return <p className="monthly-empty-inline">{text}</p>;
}

/* ---------------------------------------------------------------- Tren */

export function TrendChart({ points, noun }: { points: TrendPoint[]; noun: string }) {
  if (!points.some((point) => point.revenue > 0)) return <Empty text="Belum ada transaksi lunas pada periode-periode ini." />;
  const chart = { left: 64, right: 930, top: 30, bottom: 220 };
  const height = chart.bottom - chart.top;
  const maxRevenue = niceMax(Math.max(...points.map((point) => point.revenue), 1));
  const maxTx = niceMax(Math.max(...points.map((point) => point.transactions), 1));
  const slot = (chart.right - chart.left) / points.length;
  const barWidth = Math.min(64, slot * 0.56);
  const yRevenue = (value: number) => chart.bottom - value / maxRevenue * height;
  const yTx = (value: number) => chart.bottom - value / maxTx * height;
  const line = points.map((point, index) => `${chart.left + slot * (index + 0.5)},${yTx(point.transactions)}`).join(" ");
  const current = points[points.length - 1];
  const before = points[points.length - 2];
  return (
    <>
      <svg className="report-chart" viewBox="0 0 1000 260" role="img" aria-label={`Tren pendapatan ${points.length} ${noun} terakhir`}>
        <title>{`Tren pendapatan & transaksi ${points.length} ${noun} terakhir`}</title>
        {Array.from({ length: 5 }, (_, index) => {
          const ratio = (4 - index) / 4;
          const y = chart.top + height * index / 4;
          return (
            <g key={index} className="report-chart-grid">
              <line x1={chart.left} x2={chart.right} y1={y} y2={y} />
              <text x={chart.left - 8} y={y + 4} textAnchor="end">{short(maxRevenue * ratio)}</text>
              <text x={chart.right + 8} y={y + 4} textAnchor="start">{num(maxTx * ratio)}</text>
            </g>
          );
        })}
        <text className="report-chart-label" x={chart.left - 8} y={14} textAnchor="end">Rp</text>
        <text className="report-chart-label" x={chart.right + 8} y={14} textAnchor="start">transaksi</text>
        {points.map((point, index) => {
          const center = chart.left + slot * (index + 0.5);
          const y = yRevenue(point.revenue);
          return (
            <g key={point.start}>
              <rect
                x={center - barWidth / 2} y={y} width={barWidth} height={Math.max(0, chart.bottom - y)} rx={3}
                fill={point.isCurrent ? CHART_COLORS[0] : "#6ee7b7"}
                fillOpacity={point.running ? 0.6 : 1}
                stroke={point.running ? CHART_COLORS[0] : "none"} strokeDasharray={point.running ? "5 4" : undefined} strokeWidth={point.running ? 2 : 0}
              >
                <title>{`${point.label}: ${rp(point.revenue)} · ${num(point.transactions)} transaksi${point.running ? " (berjalan)" : ""}`}</title>
              </rect>
              {point.revenue > 0 && (chart.bottom - y > 30
                ? <text className="report-chart-inbar" x={center} y={y + 17} textAnchor="middle">{short(point.revenue)}</text>
                : <text className="report-chart-value" x={center} y={y - 6} textAnchor="middle">{short(point.revenue)}</text>)}
              <text className={`report-chart-label${point.isCurrent ? " strong" : ""}`} x={center} y={chart.bottom + 18} textAnchor="middle">{point.label}</text>
              {point.running && <text className="report-chart-label" x={center} y={chart.bottom + 32} textAnchor="middle">berjalan</text>}
            </g>
          );
        })}
        <polyline points={line} fill="none" stroke={CHART_COLORS[1]} strokeWidth={3} strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.start} cx={chart.left + slot * (index + 0.5)} cy={yTx(point.transactions)} r={4} fill={CHART_COLORS[1]} className="report-chart-dot">
            <title>{`${point.label}: ${num(point.transactions)} transaksi`}</title>
          </circle>
        ))}
      </svg>
      <div className="report-chart-legend">
        <span><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="3" fill={CHART_COLORS[0]} /></svg>Pendapatan (sumbu kiri)</span>
        <span><svg width="14" height="12" aria-hidden><line x1="0" x2="14" y1="6" y2="6" stroke={CHART_COLORS[1]} strokeWidth="3" /></svg>Transaksi lunas (sumbu kanan)</span>
        {current && before && before.revenue > 0 && !current.running && (
          <span className="muted">{current.label} vs {before.label}: {current.revenue >= before.revenue ? "+" : ""}{pct((current.revenue - before.revenue) / before.revenue * 100)}</span>
        )}
        {current?.running && <span className="muted">Batang bergaris putus = periode masih berjalan</span>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- Donat */

export type DonutSlice = { label: string; value: number; detail?: string };

export function DonutChart({ slices, centerTitle, format = (value) => rp(value, { short: true }), empty }: {
  slices: DonutSlice[];
  centerTitle: string;
  format?: (value: number) => string;
  empty: string;
}) {
  const rows = slices.filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return <Empty text={empty} />;
  // Lebih dari 7 potong digabung "Lainnya" supaya legenda tetap terbaca.
  const visible = rows.length > 7
    ? [...rows.slice(0, 6), { label: "Lainnya", value: rows.slice(6).reduce((sum, slice) => sum + slice.value, 0) }]
    : rows;
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const legendTop = Math.max(18, 110 - visible.length * 13);
  return (
    <svg className="report-chart" viewBox="0 0 520 220" role="img" aria-label={`${centerTitle}: ${visible.map((slice) => `${slice.label} ${pct(slice.value / total * 100)}`).join(", ")}`}>
      <title>{centerTitle}</title>
      <g transform="translate(110 110) rotate(-90)">
        <circle r={radius} fill="none" stroke="#e2e8f0" strokeOpacity={0.25} strokeWidth={34} />
        {visible.map((slice, index) => {
          const length = slice.value / total * circumference;
          const element = (
            <circle
              key={slice.label} r={radius} fill="none" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={34}
              strokeDasharray={`${Math.max(0, length - (visible.length > 1 ? 1.5 : 0))} ${circumference}`} strokeDashoffset={-offset}
            >
              <title>{`${slice.label}: ${format(slice.value)} (${pct(slice.value / total * 100)})`}</title>
            </circle>
          );
          offset += length;
          return element;
        })}
      </g>
      <text className="report-chart-label" x={110} y={104} textAnchor="middle">{centerTitle}</text>
      <text className="report-chart-total" x={110} y={126} textAnchor="middle">{format(total)}</text>
      {visible.map((slice, index) => {
        const y = legendTop + index * 26;
        return (
          <g key={slice.label}>
            <rect x={232} y={y - 10} width={12} height={12} rx={3} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            <text className="report-chart-text" x={252} y={y}>{clip(slice.label, 22)}</text>
            <text className="report-chart-text strong" x={512} y={y} textAnchor="end">{pct(slice.value / total * 100, 0)}</text>
            <text className="report-chart-label" x={466} y={y} textAnchor="end">{format(slice.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------- Batang horizontal */

export type HBarRow = { label: string; value: number; note?: string; secondary?: number };

/** Batang horizontal; `secondary` (opsional) = pembanding, digambar tipis abu di bawahnya. */
export function HorizontalBars({ rows, format = (value) => rp(value, { short: true }), primaryLabel, secondaryLabel, empty, color = CHART_COLORS[0] }: {
  rows: HBarRow[];
  format?: (value: number) => string;
  primaryLabel?: string;
  secondaryLabel?: string;
  empty: string;
  color?: string;
}) {
  if (!rows.some((row) => row.value > 0 || (row.secondary ?? 0) > 0)) return <Empty text={empty} />;
  const compare = rows.some((row) => row.secondary !== undefined);
  const rowHeight = compare ? 34 : 26;
  const labelWidth = 190;
  const right = 760;
  const top = 8;
  const height = top + rows.length * rowHeight + 6;
  const maximum = Math.max(...rows.flatMap((row) => [row.value, row.secondary ?? 0]), 1);
  const width = (value: number) => Math.max(value > 0 ? 2 : 0, value / maximum * (right - labelWidth));
  return (
    <>
      <svg className="report-chart" viewBox={`0 0 1000 ${height}`} role="img" aria-label={rows.map((row) => `${row.label} ${format(row.value)}`).join(", ")}>
        {rows.map((row, index) => {
          const y = top + index * rowHeight;
          const barHeight = compare ? 14 : 16;
          return (
            <g key={`${row.label}-${index}`}>
              <text className="report-chart-text" x={labelWidth - 10} y={y + barHeight - 3} textAnchor="end">{clip(row.label, 26)}</text>
              <rect x={labelWidth} y={y} width={width(row.value)} height={barHeight} rx={3} fill={color}>
                <title>{`${row.label}: ${format(row.value)}${row.note ? ` · ${row.note}` : ""}`}</title>
              </rect>
              {compare && (
                <rect x={labelWidth} y={y + barHeight + 2} width={width(row.secondary ?? 0)} height={8} rx={2} fill={MUTED} fillOpacity={0.7}>
                  <title>{`${row.label} (${secondaryLabel ?? "pembanding"}): ${format(row.secondary ?? 0)}`}</title>
                </rect>
              )}
              <text className="report-chart-text strong" x={labelWidth + width(row.value) + 8} y={y + barHeight - 3}>
                {format(row.value)}
                {row.note && <tspan className="report-chart-label" dx={8}>{row.note}</tspan>}
              </text>
            </g>
          );
        })}
      </svg>
      {compare && (
        <div className="report-chart-legend">
          <span><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="3" fill={color} /></svg>{primaryLabel ?? "Periode ini"}</span>
          <span><svg width="12" height="8" aria-hidden><rect width="12" height="8" rx="2" fill={MUTED} /></svg>{secondaryLabel ?? "Pembanding"}</span>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------- Batang vertikal sederhana */

export function ColumnChart({ rows, format = (value) => num(value), empty, highlightMax = true }: {
  rows: { label: string; value: number }[];
  format?: (value: number) => string;
  empty: string;
  highlightMax?: boolean;
}) {
  if (!rows.some((row) => row.value > 0)) return <Empty text={empty} />;
  const chart = { left: 20, right: 980, top: 26, bottom: 190 };
  const maximum = Math.max(...rows.map((row) => row.value), 1);
  const slot = (chart.right - chart.left) / rows.length;
  const barWidth = Math.min(70, slot * 0.6);
  return (
    <svg className="report-chart" viewBox="0 0 1000 220" role="img" aria-label={rows.map((row) => `${row.label} ${format(row.value)}`).join(", ")}>
      <line className="report-chart-axis" x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} />
      {rows.map((row, index) => {
        const center = chart.left + slot * (index + 0.5);
        const y = chart.bottom - row.value / maximum * (chart.bottom - chart.top);
        const isMax = highlightMax && row.value === maximum;
        return (
          <g key={row.label}>
            <rect x={center - barWidth / 2} y={y} width={barWidth} height={chart.bottom - y} rx={3} fill={isMax ? CHART_COLORS[0] : "#6ee7b7"}>
              <title>{`${row.label}: ${format(row.value)}`}</title>
            </rect>
            <text className="report-chart-value" x={center} y={y - 6} textAnchor="middle">{format(row.value)}</text>
            <text className={`report-chart-label${isMax ? " strong" : ""}`} x={center} y={chart.bottom + 18} textAnchor="middle">{row.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------- Waterfall */

export type WaterfallStep = { label: string; value: number };

/** Pendapatan → dikurangi biaya satu per satu → hasil akhir. `steps` = pengurang (bernilai positif). */
export function WaterfallChart({ start, steps, resultLabel }: { start: WaterfallStep; steps: WaterfallStep[]; resultLabel: string }) {
  if (start.value <= 0 && !steps.some((step) => step.value)) return <Empty text="Belum ada data pendapatan atau biaya." />;
  const visibleSteps = steps.filter((step) => step.value !== 0);
  const result = start.value - visibleSteps.reduce((sum, step) => sum + step.value, 0);
  const levels: { label: string; from: number; to: number; kind: "start" | "minus" | "result" }[] = [
    { label: start.label, from: 0, to: start.value, kind: "start" },
  ];
  let running = start.value;
  for (const step of visibleSteps) {
    levels.push({ label: step.label, from: running, to: running - step.value, kind: "minus" });
    running -= step.value;
  }
  levels.push({ label: resultLabel, from: 0, to: result, kind: "result" });
  const chart = { left: 64, right: 990, top: 28, bottom: 214 };
  const rawMinimum = Math.min(0, ...levels.flatMap((level) => [level.from, level.to]));
  const span = niceMax(Math.max(...levels.flatMap((level) => [level.from, level.to]), 1) - rawMinimum);
  const minimum = rawMinimum < 0 ? -niceMax(-rawMinimum, 1) : 0;
  const maximum = minimum + Math.max(span, niceMax(Math.max(...levels.flatMap((level) => [level.from, level.to]), 1) - minimum));
  const y = (value: number) => chart.bottom - (value - minimum) / (maximum - minimum) * (chart.bottom - chart.top);
  const slot = (chart.right - chart.left) / levels.length;
  const barWidth = Math.min(80, slot * 0.62);
  const colorOf = (level: typeof levels[number]) => level.kind === "start" ? CHART_COLORS[0]
    : level.kind === "minus" ? CHART_COLORS[4]
      : level.to >= 0 ? CHART_COLORS[1] : "#b91c1c";
  return (
    <svg className="report-chart" viewBox="0 0 1000 256" role="img" aria-label={levels.map((level) => `${level.label} ${rp(level.kind === "minus" ? level.to - level.from : level.to)}`).join(", ")}>
      <title>{`${start.label} sampai ${resultLabel}`}</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = minimum + (maximum - minimum) * (4 - index) / 4;
        return (
          <g key={index} className="report-chart-grid">
            <line x1={chart.left} x2={chart.right} y1={y(value)} y2={y(value)} />
            <text x={chart.left - 8} y={y(value) + 4} textAnchor="end">{short(value)}</text>
          </g>
        );
      })}
      {minimum < 0 && <line className="report-chart-axis" x1={chart.left} x2={chart.right} y1={y(0)} y2={y(0)} />}
      {levels.map((level, index) => {
        const center = chart.left + slot * (index + 0.5);
        const topValue = Math.max(level.from, level.to);
        const bottomValue = Math.min(level.from, level.to);
        const amount = level.kind === "minus" ? level.to - level.from : level.to;
        const next = levels[index + 1];
        return (
          <g key={`${level.label}-${index}`}>
            <rect x={center - barWidth / 2} y={y(topValue)} width={barWidth} height={Math.max(1, y(bottomValue) - y(topValue))} rx={3} fill={colorOf(level)}>
              <title>{`${level.label}: ${rp(amount)}${start.value > 0 ? ` (${pct(Math.abs(amount) / start.value * 100)} dari pendapatan)` : ""}`}</title>
            </rect>
            {next && next.kind === "minus" && (
              <line className="report-chart-connector" x1={center + barWidth / 2} x2={center + slot - barWidth / 2} y1={y(level.to)} y2={y(level.to)} />
            )}
            <text className="report-chart-value" x={center} y={y(topValue) - 6} textAnchor="middle">{short(amount)}</text>
            <text className={`report-chart-label${level.kind !== "minus" ? " strong" : ""}`} x={center} y={chart.bottom + 18} textAnchor="middle">{clip(level.label, 16)}</text>
            {level.kind !== "start" && start.value > 0 && (
              <text className="report-chart-label" x={center} y={chart.bottom + 32} textAnchor="middle">{amount < 0 && level.kind === "result" ? "−" : ""}{pct(Math.abs(amount) / start.value * 100, 0)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
