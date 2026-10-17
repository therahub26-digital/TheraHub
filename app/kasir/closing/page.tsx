import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, KV, InfoNote, Field } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { OpenShiftForm, CloseShiftForm } from "@/components/CashierShiftPanel";
import { PRIMARY_OUTLET, CASHIER_SHIFTS, TODAY, salesBreakdown } from "@/lib/mock";
import { rp, fmtDateTime, fmtDateShort } from "@/lib/format";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getCashierShiftState, type CashierShift } from "@/lib/data/cashierShifts";

// ---------------------------------------------------------------------
// Tutup Kasir — UAT 18 Okt 2026: halaman ini dulu 100% data contoh.
// Sekarang sesi kasir asli memakai tabel cashier_shifts (migrasi 0042):
// buka shift dengan modal awal → penjualan tunai/non-tunai dihitung dari
// transaksi lunas sejak shift dibuka → tutup shift dengan kas hitung
// fisik; SETIAP selisih wajib beralasan (keputusan Adjie 18 Okt 2026).
// Jumlah shift per hari (1/2) diatur manager di Pengaturan Outlet.
// Mode demo "Ganti Role" (tanpa sesi) tetap menampilkan contoh lama.
// ---------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  const outlet = await getCurrentOutlet();
  const state = await getCashierShiftState(outlet.id);
  if (!state.live) return <DemoClosing />;

  if (state.migrationMissing) {
    return (
      <>
        <PageHead title="Tutup Kasir" desc={`${outlet.name} · Rekonsiliasi kas dan penutupan shift kasir.`} />
        <InfoNote tone="warning" icon="alert-triangle" title="Modul shift belum aktif">
          Database belum diperbarui (migrasi <code>0042_cashier_shifts.sql</code>). Hubungi admin; sementara itu catat
          penutupan kas secara manual.
        </InfoNote>
      </>
    );
  }

  const { openShift, openSummary, canOpen, history, shiftsPerDay, outsideShiftToday } = state;
  const shiftLabel = (s: { shiftNo: number }) => (shiftsPerDay === 2 || s.shiftNo === 2 ? ` ${s.shiftNo}` : "");

  return (
    <>
      <PageHead
        title="Tutup Kasir"
        desc={`${outlet.name} · ${shiftsPerDay === 2 ? "2 shift per hari" : "1 shift per hari"} · Rekonsiliasi kas dan penutupan shift.`}
      />

      {outsideShiftToday.count > 0 && (
        <div style={{ marginBottom: 16 }}>
          <InfoNote tone="warning" icon="alert-triangle" title="Ada transaksi di luar shift">
            {outsideShiftToday.count} transaksi lunas hari ini ({rp(outsideShiftToday.total)}) dibayar saat tidak ada shift
            terbuka, jadi tidak masuk rekonsiliasi kas mana pun. Biasakan buka shift sebelum transaksi pertama.
          </InfoNote>
        </div>
      )}

      {openShift && openSummary ? (
        <>
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <StatCard label="Modal Awal" value={rp(openShift.openingFloat, { short: true })} icon="wallet" toneKey="teal" deltaLabel={`Dibuka ${fmtDateTime(openShift.openedAt)}`} />
            <StatCard label="Penjualan Tunai" value={rp(openSummary.cashSales, { short: true })} icon="banknote" toneKey="sky" deltaLabel="Sejak shift dibuka" />
            <StatCard label="Ekspektasi Kas" value={rp(openSummary.expectedCash, { short: true })} icon="calculator" toneKey="gold" deltaLabel="Modal + penjualan tunai" />
            <StatCard label="Transaksi" value={openSummary.transactionCount} icon="receipt" toneKey="violet" deltaLabel={rp(openSummary.totalSales, { short: true })} />
          </div>

          <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
            <Card style={{ gridColumn: "span 2" }}>
              <CardHead
                title={`Tutup Shift${shiftLabel(openShift)}`}
                sub={`Dibuka ${openShift.openedByName} · ${fmtDateTime(openShift.openedAt)}`}
                action={<Badge tone="accent" dot>OPEN</Badge>}
              />
              <div className="card-body">
                <div className="grid grid-2" style={{ marginBottom: 16 }}>
                  <Field label="Modal Awal"><input defaultValue={rp(openShift.openingFloat)} readOnly /></Field>
                  <Field label="Ekspektasi Kas Sistem"><input value={rp(openSummary.expectedCash)} readOnly /></Field>
                </div>
                <CloseShiftForm shiftId={openShift.id} expected={openSummary.expectedCash} />
              </div>
            </Card>

            <Card className="card-pad">
              <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Rincian Metode Bayar</div>
              <KV
                items={[
                  ["Cash", rp(openSummary.cashSales)],
                  ...Object.entries(openSummary.nonCash).map(([k, v]) => [k, rp(v)] as [string, string]),
                  ["Total", <strong key="t">{rp(openSummary.totalSales)}</strong>],
                ]}
              />
              <div className="tiny dim" style={{ marginTop: 10 }}>
                Hanya uang tunai yang harus ada di laci. QRIS/kartu/transfer dicocokkan dengan mutasi bank.
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card style={{ marginBottom: 20, maxWidth: 520 }}>
          <CardHead title={canOpen.ok ? `Buka Shift${shiftsPerDay === 2 ? ` ${canOpen.shiftNo}` : ""}` : "Shift"} sub={state.today} />
          <div className="card-body">
            {canOpen.ok ? (
              <OpenShiftForm outletId={outlet.id} shiftNo={canOpen.shiftNo} shiftsPerDay={shiftsPerDay} />
            ) : (
              <InfoNote icon="info">{canOpen.reason}</InfoNote>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Riwayat Shift" sub={history.length ? `${history.length} shift terakhir` : "Belum ada shift yang ditutup"} />
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tanggal</th><th>Shift</th><th>Kasir</th><th>Modal</th><th>Tunai</th><th>Non-tunai</th>
                <th>Ekspektasi</th><th>Terhitung</th><th>Selisih</th><th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={10} className="muted small" style={{ textAlign: "center", padding: 20 }}>Belum ada riwayat.</td></tr>
              )}
              {history.map((s) => <HistoryRow key={s.id} s={s} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function HistoryRow({ s }: { s: CashierShift }) {
  const nonCash = Object.values(s.nonCash ?? {}).reduce((a, v) => a + Number(v), 0);
  const v = s.variance ?? 0;
  return (
    <tr>
      <td className="small">{fmtDateShort(s.businessDate)}</td>
      <td className="small">{s.shiftNo}</td>
      <td className="small" style={{ color: "var(--text-1)" }}>
        {s.openedByName}
        {s.closedByName && s.closedByName !== s.openedByName ? <span className="dim"> → {s.closedByName}</span> : null}
        <div className="tiny dim">{s.closedAt ? `tutup ${fmtDateTime(s.closedAt)}` : ""}</div>
      </td>
      <td className="num small muted">{rp(s.openingFloat)}</td>
      <td className="num small muted">{rp(s.cashSales ?? 0)}</td>
      <td className="num small muted">{rp(nonCash)}</td>
      <td className="num small muted">{rp(s.expectedCash ?? 0)}</td>
      <td className="num small muted">{rp(s.countedCash ?? 0)}</td>
      <td className="num small strong" style={{ color: v < 0 ? "var(--danger)" : v > 0 ? "var(--warning)" : "var(--success)" }}>
        {v === 0 ? "Cocok" : rp(v, { sign: true })}
      </td>
      <td className="small muted" style={{ maxWidth: 220 }}>{s.varianceNote ?? "—"}</td>
    </tr>
  );
}

function DemoClosing() {
  const outlet = PRIMARY_OUTLET;
  const shift = CASHIER_SHIFTS.find((s) => s.outletId === outlet.id && s.status === "OPEN") ?? CASHIER_SHIFTS[0];
  const history = CASHIER_SHIFTS.filter((s) => s.outletId === outlet.id);
  const breakdown = salesBreakdown(outlet.id, TODAY);
  const cashSales = breakdown.byMethod["Cash"] ?? 0;
  const expectedCash = shift.openingFloat + cashSales;

  return (
    <>
      <PageHead
        title="Shift Closing"
        desc={`${outlet.name} · Rekonsiliasi kas dan penutupan shift kasir.`}
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — rekonsiliasi kas & tutup shift belum dibangun. Catat manual di luar aplikasi."><Icon name="lock" size={14} /> Tutup Shift</button>}
      />

      <MockDataNotice title="Data contoh — jangan pakai untuk rekonsiliasi kas">
        Modal Awal, Penjualan Cash, Ekspektasi Kas, dan Riwayat Shift di halaman ini adalah angka
        karangan — <strong>bukan kas outlet Anda</strong>. Kotak &quot;Kas Hasil Hitung Fisik&quot;
        bisa diketik tapi tidak tersimpan ke mana pun, dan tombol Tutup Shift belum berfungsi.
        Sampai modulnya dibangun, catat penutupan kas manual di luar aplikasi.
      </MockDataNotice>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Modal Awal" value={rp(shift.openingFloat, { short: true })} icon="wallet" toneKey="teal" deltaLabel={`Dibuka ${fmtDateTime(shift.openedAt)}`} />
        <StatCard label="Penjualan Cash" value={rp(cashSales, { short: true })} icon="banknote" toneKey="sky" deltaLabel="Dari transaksi hari ini" />
        <StatCard label="Ekspektasi Kas" value={rp(expectedCash, { short: true })} icon="calculator" toneKey="gold" deltaLabel="Modal + penjualan cash" />
        <StatCard label="Total Transaksi" value={breakdown.count} icon="receipt" toneKey="violet" deltaLabel={rp(breakdown.total, { short: true })} />
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Rekonsiliasi Kas" sub={shift.status === "OPEN" ? "Shift sedang berjalan" : "Shift terakhir"} action={<Badge tone={shift.status === "OPEN" ? "accent" : "neutral"} dot>{shift.status}</Badge>} />
          <div className="card-body">
            <div className="grid grid-2" style={{ marginBottom: 16 }}>
              <Field label="Modal Awal (Opening Float)"><input defaultValue={rp(shift.openingFloat)} readOnly /></Field>
              <Field label="Ekspektasi Kas Sistem"><input defaultValue={rp(shift.expectedCash)} readOnly /></Field>
              {/* Field ini satu-satunya di kartu ini yang dulu tidak `readOnly`,
                  jadi kasir bisa mengetik angka hitung kas sungguhan ke sana
                  dan mengira sudah tercatat — padahal tidak ada state yang
                  membacanya (halaman ini Server Component murni). Satu-satunya
                  pengaman adalah banner di atas, dan banner tidak selalu dibaca
                  orang yang sedang buru-buru menutup shift. */}
              <Field label="Kas Hasil Hitung Fisik" hint="Belum bisa diisi — modul tutup shift belum dibangun">
                <input placeholder="Belum tersedia" readOnly title="Belum tersedia — rekonsiliasi kas belum dibangun; catat manual di luar aplikasi." />
              </Field>
              <Field label="Selisih (Variance)"><input defaultValue={shift.variance !== null ? rp(shift.variance, { sign: true }) : "—"} readOnly /></Field>
            </div>
            <InfoNote tone={shift.variance && shift.variance < 0 ? "warning" : "info"} icon="info">
              Selisih di atas Rp20.000 memerlukan catatan alasan dan akan direview oleh Manager Outlet.
            </InfoNote>
          </div>
        </Card>

        <Card className="card-pad">
          <div className="tiny dim uppercase" style={{ marginBottom: 10 }}>Breakdown Metode Bayar</div>
          <KV items={Object.entries(breakdown.byMethod).map(([k, v]) => [k, rp(v, { short: true })])} />
        </Card>
      </div>

      <Card>
        <CardHead title="Riwayat Shift" sub={`${history.length} shift tercatat`} />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Kasir</th><th>Dibuka</th><th>Ditutup</th><th>Modal Awal</th><th>Ekspektasi</th><th>Terhitung</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{s.cashier}</td>
                  <td className="muted small">{fmtDateTime(s.openedAt)}</td>
                  <td className="muted small">{s.closedAt ? fmtDateTime(s.closedAt) : "—"}</td>
                  <td className="num small muted">{rp(s.openingFloat)}</td>
                  <td className="num small muted">{rp(s.expectedCash)}</td>
                  <td className="num small muted">{s.countedCash !== null ? rp(s.countedCash) : "—"}</td>
                  <td className="num small" style={{ color: s.variance && s.variance < 0 ? "var(--danger)" : s.variance && s.variance > 0 ? "var(--success)" : "var(--text-3)" }}>
                    {s.variance !== null ? rp(s.variance, { sign: true }) : "—"}
                  </td>
                  <td><Badge tone={s.status === "OPEN" ? "accent" : "neutral"} dot>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}