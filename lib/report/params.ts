// ---------------------------------------------------------------------
// Parameter URL halaman Laporan (Harian · Mingguan · Bulanan), 2026-10-23.
//   ?jenis=harian|mingguan|bulanan  &tanggal=YYYY-MM-DD  &periode=YYYY-MM  &outlet=<id|all>
// Modul murni — dipakai server page & bilah kontrol client.
// ---------------------------------------------------------------------
import type { ReportKind } from "@/lib/data/monthly-report-math";

export const KIND_SLUG: Record<ReportKind, string> = { day: "harian", week: "mingguan", month: "bulanan" };
const SLUG_KIND: Record<string, ReportKind> = { harian: "day", mingguan: "week", bulanan: "month" };

export type ReportParams = { kind: ReportKind; anchor: string; outlet: string };

export function parseReportParams(
  sp: { jenis?: string; tanggal?: string; periode?: string; outlet?: string },
  today: string,
  defaultKind: ReportKind = "month"
): ReportParams {
  const kind = SLUG_KIND[sp.jenis ?? ""] ?? defaultKind;
  const date = sp.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal) && sp.tanggal <= today ? sp.tanggal : today;
  const period = sp.periode && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.periode) ? sp.periode : date.slice(0, 7);
  return { kind, anchor: kind === "month" ? period : date, outlet: sp.outlet ?? "all" };
}

/** Bangun query string; `anchor` = YYYY-MM (bulanan) atau tanggal. */
export function reportHref(basePath: string, kind: ReportKind, anchor: string, outlet?: string, extra?: Record<string, string>) {
  const q = new URLSearchParams();
  q.set("jenis", KIND_SLUG[kind]);
  if (kind === "month") q.set("periode", anchor.slice(0, 7));
  else q.set("tanggal", anchor);
  if (outlet && outlet !== "all") q.set("outlet", outlet);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
  return `${basePath}?${q.toString()}`;
}
