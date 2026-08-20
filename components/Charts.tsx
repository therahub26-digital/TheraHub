"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { CAT, CHART_GRID, CHART_MUTED, CHART_INK_2 } from "@/lib/chartColors";
import { rp, num } from "@/lib/format";

const axisTick = { fill: CHART_MUTED, fontSize: 11, fontFamily: "var(--font-inter)" };
const tooltipStyle = {
  background: "#141c2b",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  fontSize: 12.5,
  color: "#f1f5f9",
  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
  padding: "8px 12px",
};

function fmtY(v: number, money?: boolean) {
  if (!money) return num(v);
  if (v >= 1_000_000) return `${num(v / 1_000_000, 1)}jt`;
  if (v >= 1_000) return `${num(v / 1_000, 0)}rb`;
  return String(v);
}

// ---------------------------------------------------------- Area (trend)
export function TrendArea({
  data,
  xKey,
  yKey,
  money = true,
  height = 220,
  color = "var(--accent)",
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  money?: boolean;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => fmtY(v, money)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [money ? rp(Number(v)) : num(Number(v)), undefined]}
          labelStyle={{ color: CHART_INK_2, marginBottom: 4, fontWeight: 600 }}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 4, fill: color, stroke: "#0a0f18", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------- Multi-line
export function MultiLine({
  data,
  xKey,
  series,
  height = 240,
  money = false,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: { key: string; label: string }[];
  height?: number;
  money?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmtY(v, money)} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: CHART_INK_2, marginBottom: 4, fontWeight: 600 }}
          formatter={(v) => (money ? rp(Number(v)) : num(Number(v)))}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 12, color: CHART_INK_2 }}
        />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={CAT[i % CAT.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0f18" }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------- Bars
export function BarsChart({
  data,
  xKey,
  yKey,
  height = 220,
  money = true,
  color = "var(--accent)",
  horizontal = false,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  height?: number;
  money?: boolean;
  color?: string;
  horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 6, right: 12, left: horizontal ? 8 : 4, bottom: 0 }}
        barCategoryGap={horizontal ? 10 : 14}
      >
        <CartesianGrid stroke={CHART_GRID} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtY(v, money)} />
            <YAxis type="category" dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => fmtY(v, money)} />
          </>
        )}
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(v) => [money ? rp(Number(v)) : num(Number(v)), undefined]}
          labelStyle={{ color: CHART_INK_2, marginBottom: 4, fontWeight: 600 }}
        />
        <Bar dataKey={yKey} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 16 : 28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------- Grouped bars
export function GroupedBars({
  data,
  xKey,
  series,
  height = 240,
  money = false,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: { key: string; label: string }[];
  height?: number;
  money?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }} barGap={3}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => fmtY(v, money)} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: CHART_INK_2, marginBottom: 4, fontWeight: 600 }} />
        <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: CHART_INK_2 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={CAT[i % CAT.length]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------- Donut
export function DonutChart({
  data,
  nameKey,
  valueKey,
  height = 220,
  centerLabel,
  centerValue,
  colors,
}: {
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  colors?: string[];
}) {
  const palette = colors ?? CAT;
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="#0a0f18"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20, color: "var(--text-1)" }}>
            {centerValue}
          </div>
          {centerLabel && <div className="tiny dim">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}

export function LegendList({ data, colors }: { data: { label: string; value: string }[]; colors?: string[] }) {
  const palette = colors ?? CAT;
  return (
    <div className="stack g2">
      {data.map((d, i) => (
        <div key={d.label} className="row between small">
          <span className="row g2">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: palette[i % palette.length], flexShrink: 0 }} />
            <span className="muted">{d.label}</span>
          </span>
          <span className="strong" style={{ color: "var(--text-1)", fontWeight: 600 }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------- Sparkline (mini)
export function Sparkline({ data, yKey, color = "var(--accent)", height = 36 }: { data: Record<string, unknown>[]; yKey: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={1.75} fill="url(#sparkFill)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
