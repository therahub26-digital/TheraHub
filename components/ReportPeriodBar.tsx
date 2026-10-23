"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { addDaysIso, type ReportKind } from "@/lib/data/monthly-report-math";
import { reportHref } from "@/lib/report/params";

// ---------------------------------------------------------------------
// Bilah pilih laporan: Harian · Mingguan · Bulanan, ◀ periode ▶, pilih
// tanggal/bulan, dan (owner) cakupan cabang. Navigasi lewat URL supaya
// tiap laporan bisa dibagikan/di-bookmark dan dicetak apa adanya.
// ---------------------------------------------------------------------

type Props = {
  basePath: string;
  kind: ReportKind;
  /** YYYY-MM (bulanan) atau tanggal di dalam periode. */
  anchor: string;
  periodStart: string;
  periodEnd: string;
  today: string;
  outlet?: string;
  outlets?: { id: string; name: string }[];
};

const TABS: { kind: ReportKind; label: string }[] = [
  { kind: "day", label: "Harian" },
  { kind: "week", label: "Mingguan" },
  { kind: "month", label: "Bulanan" },
];

function shiftMonth(period: string, delta: number) {
  const d = new Date(`${period}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default function ReportPeriodBar({ basePath, kind, anchor, periodStart, periodEnd, today, outlet, outlets }: Props) {
  const router = useRouter();
  const go = (k: ReportKind, a: string, o = outlet) => router.push(reportHref(basePath, k, a, o));
  // Pindah jenis memakai tanggal yang masih masuk akal: akhir periode (atau hari ini bila periode berjalan).
  const focusDate = periodEnd < today ? periodEnd : today;
  const prev = kind === "month" ? shiftMonth(anchor, -1) : addDaysIso(periodStart, kind === "week" ? -7 : -1);
  const next = kind === "month" ? shiftMonth(anchor, 1) : addDaysIso(periodStart, kind === "week" ? 7 : 1);
  const nextDisabled = kind === "month" ? next > today.slice(0, 7) : next > today;

  return (
    <div className="report-period-bar no-print">
      <div className="report-kind-tabs" role="tablist" aria-label="Jenis laporan">
        {TABS.map((t) => (
          <Link
            key={t.kind}
            role="tab"
            aria-selected={t.kind === kind}
            className={`report-kind-tab${t.kind === kind ? " active" : ""}`}
            href={reportHref(basePath, t.kind, t.kind === "month" ? focusDate.slice(0, 7) : focusDate, outlet)}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="row g1">
        <Link className="btn btn-ghost btn-sm btn-icon" href={reportHref(basePath, kind, prev, outlet)} aria-label="Periode sebelumnya">
          <Icon name="chevron-left" size={15} />
        </Link>
        {kind === "month" ? (
          <input
            className="input report-date-input"
            type="month"
            aria-label="Pilih bulan"
            value={anchor}
            max={today.slice(0, 7)}
            onChange={(e) => e.target.value && go(kind, e.target.value)}
          />
        ) : (
          <input
            className="input report-date-input"
            type="date"
            aria-label={kind === "week" ? "Pilih tanggal di minggu itu" : "Pilih tanggal"}
            value={anchor}
            max={today}
            onChange={(e) => e.target.value && go(kind, e.target.value)}
          />
        )}
        {nextDisabled ? (
          <span className="btn btn-ghost btn-sm btn-icon" aria-disabled="true" style={{ opacity: 0.35 }}><Icon name="chevron-right" size={15} /></span>
        ) : (
          <Link className="btn btn-ghost btn-sm btn-icon" href={reportHref(basePath, kind, next, outlet)} aria-label="Periode berikutnya">
            <Icon name="chevron-right" size={15} />
          </Link>
        )}
      </div>
      {outlets && outlets.length > 1 && (
        <select
          className="input report-outlet-select"
          aria-label="Cakupan cabang"
          value={outlet ?? "all"}
          onChange={(e) => go(kind, anchor, e.target.value)}
        >
          <option value="all">Semua cabang</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </div>
  );
}
