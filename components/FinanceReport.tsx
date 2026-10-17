import Link from "next/link";
import Icon from "@/components/Icon";
import { Card, CardHead, StatCard, EmptyState, InfoNote } from "@/components/ui";
import { MultiLine, GroupedBars, DonutChart, LegendList } from "@/components/Charts";
import ExportCsvButton from "@/components/ExportCsvButton";
import { rp, num, fmtDateLong } from "@/lib/format";
import { todayIsoDate } from "@/lib/wallclock";
import { toCsv, csvFilename } from "@/lib/csv";
import {
  GRANULARITY_LABEL,
  makeBucket,
  shiftBucket,
  trendBuckets,
  comparablePreviousEnd,
  type FinanceGranularity,
} from "@/lib/finance/periods";
import { totalsFor, revenueByMethod, deltaPct, hasAnyData, type FinanceRows, type FinanceTotals } from "@/lib/finance/aggregate";

// ---------------------------------------------------------------------
// Laporan Keuangan — satu komponen untuk manager (satu outlet) dan owner
// (lintas cabang). Permintaan Adjie 2026-10-15: cek per hari / minggu /
// bulan, grafik, tampilan pemilik lintas cabang.
//
// Server Component murni: pemilih periode & navigasi ◀ ▶ adalah LINK
// biasa (?g=&d=), jadi bisa dibagikan/di-bookmark dan tetap jalan tanpa
// JavaScript. Satu-satunya client island = grafik & tombol CSV.
//
// Angka: definisi di lib/finance/aggregate.ts (sama dengan /manager/reports).
// ---------------------------------------------------------------------

export type FinanceOutlet = { id: string; name: string; code: string };

function shortName(name: string): string {
  // "Amethyst — Cikawao" -> "Cikawao"; nama tanpa pemisah dibiarkan.
  const parts = name.split(/\s+[—–-]\s+/);
  return parts.length > 1 ? parts.slice(1).join(" — ") : name;
}

function DeltaText({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  const d = deltaPct(cur, prev);
  if (d === null) return <>{label}: belum ada pembanding</>;
  const up = d >= 0;
  return (
    <>
      <span style={{ color: up ? "var(--success)" : "var(--danger)" }}>
        {up ? "▲" : "▼"} {num(Math.abs(d), 1)}%
      </span>{" "}
      vs {label}
    </>
  );
}

export default function FinanceReport({
  basePath,
  extraParams = {},
  outlets,
  gran,
  date,
  today,
  rows,
  scopeLabel,
  csvBase,
  outletLinkBase,
  tenantName,
  printOutletName,
}: {
  /** Mis. "/manager/finance" atau "/owner/revenue". */
  basePath: string;
  /** Parameter URL tambahan yang dipertahankan saat berpindah periode (mis. { outlet: "all" }). */
  extraParams?: Record<string, string>;
  /** Outlet dalam cakupan laporan. >1 = tampilan lintas cabang. */
  outlets: FinanceOutlet[];
  gran: FinanceGranularity;
  /** Tanggal mana pun di dalam periode terpilih. */
  date: string;
  today: string;
  rows: FinanceRows;
  /** Mis. "Cikawao" atau "Semua cabang (2)". */
  scopeLabel: string;
  csvBase: string;
  /** Halaman tujuan saat nama cabang diklik (default basePath). */
  outletLinkBase?: string;
  tenantName: string;
  printOutletName: string;
}) {
  const multi = outlets.length > 1;
  const buckets = trendBuckets(gran, date);
  const selected = buckets[buckets.length - 1];
  const previous = buckets[buckets.length - 2] ?? makeBucket(gran, shiftBucket(gran, selected.start, -1));

  const cur = totalsFor(rows, selected.start, selected.endExcl);
  // Periode berjalan dibanding jumlah hari yang sama di periode sebelumnya.
  const prevWindow = comparablePreviousEnd(previous, selected, today);
  const prev = totalsFor(rows, previous.start, prevWindow.endExcl);
  const series = buckets.map((b) => ({ b, t: totalsFor(rows, b.start, b.endExcl) }));
  const trendHasData = series.some((s) => hasAnyData(s.t));
  const methods = revenueByMethod(rows, selected.start, selected.endExcl);

  const perOutlet: { o: FinanceOutlet; t: FinanceTotals }[] = outlets.map((o) => ({
    o,
    t: totalsFor(rows, selected.start, selected.endExcl, o.id),
  }));

  const href = (g: FinanceGranularity, d: string) => {
    const q = new URLSearchParams({ ...extraParams, g, d });
    return `${basePath}?${q.toString()}`;
  };
  const prevHref = href(gran, shiftBucket(gran, selected.start, -1));
  const nextStart = shiftBucket(gran, selected.start, 1);
  const canNext = nextStart <= today;
  const isCurrent = selected.start <= today && today < selected.endExcl;
  const unitWord = gran === "day" ? "hari" : gran === "week" ? "minggu" : "bulan";
  const prevLabel = prevWindow.partial ? `tanggal yang sama ${unitWord} sebelumnya` : `${unitWord} sebelumnya`;

  const totalTrend = totalsFor(rows, buckets[0].start, selected.endExcl);

  const trendCsv = toCsv(series, [
    { header: "Periode", value: (s) => s.b.long },
    { header: "Mulai", value: (s) => s.b.start },
    { header: "Transaksi", value: (s) => s.t.txCount },
    { header: "Pendapatan", value: (s) => s.t.revenue },
    { header: "Komisi Terapis", value: (s) => s.t.commission },
    { header: "Pengeluaran", value: (s) => s.t.expense },
    { header: "Sisa Kas Operasional", value: (s) => s.t.net },
  ]);

  return (
    <>
      <section className="finance-print-header">
        <h1>{tenantName}</h1>
        <div>{printOutletName}</div>
        <h2>Laporan Keuangan</h2>
        <div>Periode: {selected.long}</div>
        {/* UAT 18 Okt 2026: dulu new Date() di server Vercel (UTC) → antara 00:00–06:59 WIB
            tercetak tanggal KEMARIN. Pakai tanggal WIB yang sama dengan seluruh aplikasi. */}
        <div>Tanggal cetak: {fmtDateLong(todayIsoDate())}</div>
      </section>
      {/* ------------------------------------------------ toolbar periode */}
      <Card className="card-pad no-print" style={{ marginBottom: 16 }}>
        <div className="row between wrap g3" style={{ alignItems: "center" }}>
          <div className="row g2 wrap">
            {(["day", "week", "month"] as FinanceGranularity[]).map((g) => (
              <Link key={g} href={href(g, date)} className={`btn btn-sm ${g === gran ? "btn-primary" : "btn-ghost"}`}>
                {GRANULARITY_LABEL[g]}
              </Link>
            ))}
          </div>
          <div className="row g2 wrap" style={{ alignItems: "center" }}>
            <Link href={prevHref} className="btn btn-ghost btn-sm" title={`Ke ${prevLabel}`}>
              <Icon name="chevron-left" size={14} />
            </Link>
            <span className="strong" style={{ color: "var(--text-1)", minWidth: 150, textAlign: "center" }}>
              {selected.long}
            </span>
            {canNext ? (
              <Link href={href(gran, nextStart)} className="btn btn-ghost btn-sm" title={`Ke ${unitWord} berikutnya`}>
                <Icon name="chevron-right" size={14} />
              </Link>
            ) : (
              <span className="btn btn-ghost btn-sm" aria-disabled="true" style={{ opacity: 0.35, pointerEvents: "none" }}>
                <Icon name="chevron-right" size={14} />
              </span>
            )}
            {!isCurrent && (
              <Link href={href(gran, today)} className="btn btn-quiet btn-sm">
                {gran === "day" ? "Hari ini" : gran === "week" ? "Minggu ini" : "Bulan ini"}
              </Link>
            )}
            <form method="get" action={basePath} className="row g2" style={{ alignItems: "center" }}>
              {Object.entries(extraParams).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="g" value={gran} />
              <input type="date" name="d" defaultValue={date} max={today} className="input" style={{ width: 150 }} aria-label="Pilih tanggal" />
              <button type="submit" className="btn btn-ghost btn-sm">Buka</button>
            </form>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ angka periode */}
      <div className="grid grid-4 finance-report-kpis" style={{ marginBottom: 20 }}>
        <StatCard
          label={`Pendapatan · ${GRANULARITY_LABEL[gran]}`}
          value={rp(cur.revenue, { short: true })}
          icon="circle-dollar"
          toneKey="teal"
          foot={<DeltaText cur={cur.revenue} prev={prev.revenue} label={prevLabel} />}
        />
        <StatCard
          label="Transaksi Lunas"
          value={num(cur.txCount)}
          icon="receipt"
          toneKey="sky"
          deltaLabel={cur.txCount ? `Rata-rata struk ${rp(cur.avgTicket, { short: true })}` : "Belum ada transaksi"}
        />
        <StatCard
          label="Komisi + Pengeluaran"
          value={rp(cur.commission + cur.expense, { short: true })}
          icon="wallet"
          toneKey="gold"
          deltaLabel={`Komisi ${rp(cur.commission, { short: true })} · Pengeluaran ${rp(cur.expense, { short: true })}`}
        />
        <StatCard
          label="Sisa Kas Operasional"
          value={rp(cur.net, { short: true })}
          icon="trending-up"
          toneKey={cur.net >= 0 ? "violet" : "danger"}
          foot={<DeltaText cur={cur.net} prev={prev.net} label={prevLabel} />}
        />
      </div>

      {/* ------------------------------------------------ grafik tren */}
      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title={`Tren ${buckets.length} ${unitWord} terakhir`}
            sub={`${buckets[0].long} s.d. ${selected.long} · ${scopeLabel}`}
          />
          <div className="card-body">
            {trendHasData ? (
              <div className="finance-trend-chart">
                <MultiLine
                  data={series.map((s) => ({
                    label: s.b.short,
                    Pendapatan: s.t.revenue,
                    Beban: s.t.commission + s.t.expense,
                    "Sisa Kas": s.t.net,
                  }))}
                  xKey="label"
                  series={[
                    { key: "Pendapatan", label: "Pendapatan" },
                    { key: "Beban", label: "Komisi + Pengeluaran" },
                    { key: "Sisa Kas", label: "Sisa Kas" },
                  ]}
                  money
                  height={260}
                />
              </div>
            ) : (
              <EmptyState
                icon="trending-up"
                title="Belum ada transaksi di rentang ini"
                desc="Grafik terisi otomatis begitu kasir menyelesaikan pembayaran, komisi tercatat, atau pengeluaran disetujui."
              />
            )}
          </div>
        </Card>
        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Metode Pembayaran · {selected.long}</div>
          {methods.length ? (
            <>
              <DonutChart data={methods} nameKey="name" valueKey="value" height={160} centerValue={rp(cur.revenue, { short: true })} centerLabel={GRANULARITY_LABEL[gran]} />
              <div style={{ marginTop: 10 }}>
                <LegendList data={methods.map((m) => ({ label: m.name, value: rp(m.value, { short: true }) }))} />
              </div>
            </>
          ) : (
            <EmptyState icon="credit-card" title="Belum ada pembayaran" desc={`Tidak ada transaksi lunas pada ${selected.long}.`} />
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ lintas cabang */}
      {multi && (
        <>
          <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
            <Card style={{ gridColumn: "span 2" }}>
              <CardHead title="Perbandingan Cabang" sub={`${selected.long} · klik nama cabang untuk laporan cabang itu saja`} />
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Cabang</th>
                      <th className="num">Transaksi</th>
                      <th className="num">Pendapatan</th>
                      <th className="num">Komisi</th>
                      <th className="num">Pengeluaran</th>
                      <th className="num">Sisa Kas</th>
                      <th className="num">Porsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perOutlet.map(({ o, t }) => (
                      <tr key={o.id}>
                        <td>
                          <Link
                            href={`${outletLinkBase ?? basePath}?${new URLSearchParams({ ...extraParams, outlet: o.id, g: gran, d: date }).toString()}`}
                            className="strong"
                            style={{ color: "var(--text-1)" }}
                          >
                            {shortName(o.name)}
                          </Link>
                        </td>
                        <td className="num small">{num(t.txCount)}</td>
                        <td className="num strong">{rp(t.revenue, { short: true })}</td>
                        <td className="num small muted">{rp(t.commission, { short: true })}</td>
                        <td className="num small muted">{rp(t.expense, { short: true })}</td>
                        <td className="num strong" style={{ color: t.net >= 0 ? "var(--success)" : "var(--danger)" }}>{rp(t.net, { short: true })}</td>
                        <td className="num small">{cur.revenue > 0 ? `${num((t.revenue / cur.revenue) * 100, 1)}%` : "—"}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      <td className="strong" style={{ color: "var(--text-1)" }}>Total semua cabang</td>
                      <td className="num small strong">{num(cur.txCount)}</td>
                      <td className="num strong">{rp(cur.revenue, { short: true })}</td>
                      <td className="num small">{rp(cur.commission, { short: true })}</td>
                      <td className="num small">{rp(cur.expense, { short: true })}</td>
                      <td className="num strong" style={{ color: cur.net >= 0 ? "var(--success)" : "var(--danger)" }}>{rp(cur.net, { short: true })}</td>
                      <td className="num small">{cur.revenue > 0 ? "100%" : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="card-pad">
              <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Kontribusi Pendapatan · {selected.long}</div>
              {cur.revenue > 0 ? (
                <>
                  <DonutChart
                    data={perOutlet.filter((x) => x.t.revenue > 0).map((x) => ({ name: shortName(x.o.name), value: x.t.revenue }))}
                    nameKey="name"
                    valueKey="value"
                    height={160}
                    centerValue={rp(cur.revenue, { short: true })}
                    centerLabel="Total"
                  />
                  <div style={{ marginTop: 10 }}>
                    <LegendList data={perOutlet.map((x) => ({ label: shortName(x.o.name), value: rp(x.t.revenue, { short: true }) }))} />
                  </div>
                </>
              ) : (
                <EmptyState icon="building-2" title="Belum ada pendapatan" desc={`Belum ada transaksi lunas di cabang mana pun pada ${selected.long}.`} />
              )}
            </Card>
          </div>

          <Card style={{ marginBottom: 20 }}>
            <CardHead title="Tren Pendapatan per Cabang" sub={`${buckets.length} ${unitWord} terakhir`} />
            <div className="card-body">
              {trendHasData ? (
                <GroupedBars
                  data={buckets.map((b) => {
                    const row: Record<string, unknown> = { label: b.short };
                    outlets.forEach((o, i) => (row[`c${i}`] = totalsFor(rows, b.start, b.endExcl, o.id).revenue));
                    return row;
                  })}
                  xKey="label"
                  series={outlets.map((o, i) => ({ key: `c${i}`, label: shortName(o.name) }))}
                  money
                  height={260}
                />
              ) : (
                <EmptyState icon="bar-chart-3" title="Belum ada data" desc="Belum ada transaksi lunas di rentang ini." />
              )}
            </div>
          </Card>
        </>
      )}

      {/* ------------------------------------------------ tabel per periode */}
      <Card style={{ marginBottom: 20 }}>
        <CardHead
          title={`Rincian per ${unitWord}`}
          sub={`${scopeLabel} · terbaru di atas`}
          action={
            <ExportCsvButton
              csv={trendCsv}
              filename={csvFilename(`laporan-keuangan-${csvBase}-${gran}`, selected.start)}
              rowCount={series.length}
              label="Export CSV"
              emptyReason="Tidak ada data untuk diekspor."
            />
          }
        />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Periode</th>
                <th className="num">Transaksi</th>
                <th className="num">Pendapatan</th>
                <th className="num">Komisi</th>
                <th className="num">Pengeluaran</th>
                <th className="num">Sisa Kas</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map(({ b, t }) => (
                <tr key={b.key} style={b.key === selected.key ? { background: "rgba(16,185,129,0.06)" } : undefined}>
                  <td>
                    <Link href={href(gran, b.start)} className="small" style={{ color: "var(--text-1)" }}>
                      {b.long}
                    </Link>
                  </td>
                  <td className="num small">{t.txCount ? num(t.txCount) : <span className="dim">—</span>}</td>
                  <td className="num strong">{rp(t.revenue, { short: true })}</td>
                  <td className="num small muted">{rp(t.commission, { short: true })}</td>
                  <td className="num small muted">{rp(t.expense, { short: true })}</td>
                  <td className="num strong" style={{ color: t.net >= 0 ? "var(--success)" : "var(--danger)" }}>{rp(t.net, { short: true })}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <td className="strong" style={{ color: "var(--text-1)" }}>Total {buckets.length} {unitWord}</td>
                <td className="num small strong">{num(totalTrend.txCount)}</td>
                <td className="num strong">{rp(totalTrend.revenue, { short: true })}</td>
                <td className="num small">{rp(totalTrend.commission, { short: true })}</td>
                <td className="num small">{rp(totalTrend.expense, { short: true })}</td>
                <td className="num strong" style={{ color: totalTrend.net >= 0 ? "var(--success)" : "var(--danger)" }}>{rp(totalTrend.net, { short: true })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <InfoNote tone="info" icon="info" title="Cara angka dihitung">
        <strong>Pendapatan</strong> = transaksi lunas menurut tanggal bayar (batal/refund/belum lunas tidak dihitung).{" "}
        <strong>Komisi</strong> = komisi terapis yang tidak dibatalkan. <strong>Pengeluaran</strong> = pengeluaran yang
        sudah diajukan/disetujui (draft & ditolak tidak dihitung). <strong>Sisa kas operasional</strong> = pendapatan −
        komisi − pengeluaran — <strong>bukan laba-rugi lengkap</strong>: harga modal produk belum disimpan per transaksi,
        dan payroll tidak dijumlahkan karena komisi sudah menjadi komponen di dalamnya. Minggu dihitung Senin–Minggu.
      </InfoNote>
    </>
  );
}
