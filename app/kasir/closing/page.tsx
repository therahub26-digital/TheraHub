import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, KV, InfoNote, Field } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { PRIMARY_OUTLET, CASHIER_SHIFTS, TODAY, salesBreakdown } from "@/lib/mock";
import { rp, fmtDateTime } from "@/lib/format";

export default function ClosingPage() {
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
