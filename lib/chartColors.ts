// ============================================================
// Chart color roles — validated categorical order (dark surface),
// per dataviz skill. Fixed order, never cycled/reassigned by filter.
// Status colors stay mapped to the app's existing semantic tokens
// (already validated for contrast on the dark shell surface).
// ============================================================

export const CHART_SURFACE = "#0f1521";
export const CHART_GRID = "rgba(255,255,255,0.07)";
export const CHART_AXIS = "rgba(255,255,255,0.16)";
export const CHART_MUTED = "#64748b";
export const CHART_INK = "#f1f5f9";
export const CHART_INK_2 = "#cbd5e1";

/** Fixed categorical order — validated adjacent-pair CVD on dark surface. Never reorder per-filter. */
export const CAT = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua (close to brand teal)
  "#c98500", // 4 yellow/amber
  "#d55181", // 5 magenta
  "#9085e9", // 6 violet
  "#e66767", // 7 red
  "#008300", // 8 green
];

/** Status roles — never reused for a categorical series. */
export const STATUS = {
  good: "#22c55e",
  warning: "#f59e0b",
  serious: "#f97316",
  critical: "#ef4444",
  info: "#38bdf8",
};

/** Brand-driven single-hue sequence for one-series charts (falls back to accent CSS var at render). */
export const BRAND_SEQ = ["#10b981", "#0d9488", "#0f766e", "#115e59"];
