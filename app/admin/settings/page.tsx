import Link from "next/link";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Field, Switch, Badge } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getOutlets, formatDepositLabel } from "@/lib/data/outlets";
import { rp } from "@/lib/format";

export default async function TenantSettingsPage() {
  const OUTLETS = await getOutlets();
  const o = OUTLETS[0];
  return (
    <>
      <PageHead
        title="Tenant Settings"
        desc="Pengaturan default tenant: kebijakan booking, pajak, printer, dan notifikasi."
        actions={<button className="btn btn-primary btn-sm" disabled title="Belum tersedia — belum ada jalur simpan, perubahan di halaman ini tidak tersimpan."><Icon name="save" size={14} /> Simpan</button>}
      />

      <MockDataNotice title="Isian di halaman ini belum bisa disimpan">
        Tombol <strong>Simpan</strong> belum tersambung, dan semua saklar di halaman ini hanya
        gambar status. <strong>Tapi jangan mengubahnya lewat database.</strong> Pajak, service
        charge, deposit booking, dan jendela booking sudah punya jalur simpan yang benar dan
        tervalidasi di <strong>Manager → Outlet Settings</strong>, per outlet — halaman inilah yang
        belum disambungkan ke sana, bukan fiturnya yang belum ada. (Kartu Deposit Booking per Outlet
        di bawah menampilkan data outlet yang asli, tapi baca-saja.)
      </MockDataNotice>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Kebijakan Booking Default" sub="Dapat ditimpa Manager per outlet jika permission mengizinkan" />
          <div className="card-body stack g4">
            <Field label="Booking Lead Time Minimum" hint="Jarak minimum antara booking dan waktu treatment">
              <select className="select" defaultValue="30">
                <option value="0">Tidak ada batas</option>
                <option value="30">30 menit</option>
                <option value="60">1 jam</option>
                <option value="1440">1 hari</option>
              </select>
            </Field>
            <Field label="Kebijakan Keterlambatan Tamu">
              <select className="select" defaultValue={o.latePolicy}>
                <option value="FULL_DURATION">Full Duration — geser expected_end</option>
                <option value="FIXED_SLOT">Fixed Slot — durasi berkurang</option>
                <option value="GRACE_PERIOD">Grace Period — toleransi lalu ikuti rule outlet</option>
              </select>
            </Field>
            <Field label="Grace Period (menit)">
              <input className="input" type="number" defaultValue={o.gracePeriodMin} />
            </Field>
            <div className="row between">
              <span className="small">Aktifkan waiting list otomatis</span>
              <Switch on />
            </div>
            <div className="row between">
              <span className="small">Wajibkan deposit untuk booking online</span>
              <Switch on />
            </div>
            <span className="hint">
              Nominal deposit ditentukan per outlet — lihat kartu &ldquo;Deposit Booking per Outlet&rdquo;.
            </span>
          </div>
        </Card>

        <Card>
          <CardHead
            title="Deposit Booking per Outlet"
            sub="Setiap outlet menentukan sendiri nominal dan kebijakan depositnya"
            action={<Link href="/admin/outlets" className="btn btn-quiet btn-sm">Kelola outlet</Link>}
          />
          <div className="card-body stack g3">
            {OUTLETS.map((out) => (
              <div key={out.id} className="stack g2" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <span className="small strong" style={{ color: "var(--text-1)" }}>
                    {out.name.replace("Amethyst — ", "")}
                  </span>
                  {out.deposit.enabled ? (
                    <Badge tone="accent" dot>{formatDepositLabel(out.deposit)}</Badge>
                  ) : (
                    <Badge tone="neutral" dot>Nonaktif</Badge>
                  )}
                </div>
                {out.deposit.enabled ? (
                  <div className="tiny dim">
                    {out.deposit.minTicket > 0
                      ? `Berlaku bila total ≥ ${rp(out.deposit.minTicket)}`
                      : "Berlaku untuk semua booking"}
                    {" · "}bayar maks. {out.deposit.expiryMin} menit
                    {" · "}{out.deposit.refundable ? "refundable" : "non-refundable"}
                  </div>
                ) : (
                  <div className="tiny dim">{out.deposit.note}</div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Pajak & Biaya Layanan" sub="Diterapkan pada transaksi POS" />
          <div className="card-body stack g4">
            <Field label="Tax (%)"><input className="input" type="number" defaultValue={o.taxPct} /></Field>
            <Field label="Service Charge (%)"><input className="input" type="number" defaultValue={o.serviceChargePct} /></Field>
            <Field label="Format Nomor Struk"><input className="input" defaultValue={`${o.receiptPrefix}/2608/0001`} /></Field>
            <div className="row between">
              <span className="small">Tampilkan rincian diskon di struk</span>
              <Switch on />
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Printer Default" sub="Konfigurasi thermal printer tenant" />
          <div className="card-body stack g4">
            <Field label="Ukuran Kertas">
              <select className="select" defaultValue="80">
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
              </select>
            </Field>
            <Field label="Koneksi Default">
              <select className="select" defaultValue="lan">
                <option value="lan">LAN/Wi-Fi ESC/POS</option>
                <option value="bt">Bluetooth thermal</option>
                <option value="browser">Browser print fallback</option>
              </select>
            </Field>
            <div className="row between">
              <span className="small">Catat print job untuk audit reprint</span>
              <Switch on />
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Notifikasi" sub="Channel default per tipe notifikasi" />
          <div className="card-body stack g3">
            {[
              ["Booking Created", "WA + Email"],
              ["Session Ending Soon", "Push + In-app"],
              ["Payment Receipt", "WA + Email"],
              ["Low Stock Alert", "In-app"],
              ["Payroll Published", "In-app + Push"],
            ].map(([label, ch]) => (
              <div key={label} className="row between small">
                <span className="muted">{label}</span>
                <span style={{ color: "var(--text-1)" }}>{ch}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
