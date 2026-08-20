import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Field, Switch, InfoNote } from "@/components/ui";
import { PRIMARY_OUTLET, depositFor } from "@/lib/mock";
import { rp } from "@/lib/format";

/** Nilai transaksi contoh untuk mendemokan perhitungan deposit. */
const SIMULASI = [120_000, 200_000, 495_000];

export default function OutletSettingsPage() {
  const outlet = PRIMARY_OUTLET;
  const dep = outlet.deposit;

  return (
    <>
      <PageHead
        title="Outlet Settings"
        desc={`${outlet.name} · Jam operasional, kebijakan booking, dan preferensi outlet.`}
        actions={<button className="btn btn-primary btn-sm"><Icon name="save" size={14} /> Simpan Perubahan</button>}
      />

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title="Informasi Outlet" sub="Data dasar — dikelola bersama Admin Tenant" />
          <div className="card-body stack g4">
            <div className="grid grid-2">
              <Field label="Nama Outlet"><input defaultValue={outlet.name} readOnly /></Field>
              <Field label="Kode Outlet"><input defaultValue={outlet.code} readOnly /></Field>
              <Field label="Alamat"><input defaultValue={outlet.address} readOnly /></Field>
              <Field label="Telepon"><input defaultValue={outlet.phone} readOnly /></Field>
              <Field label="Jam Operasional"><input defaultValue={outlet.openHours} readOnly /></Field>
              <Field label="Manager"><input defaultValue={outlet.managerName} readOnly /></Field>
            </div>
            <InfoNote icon="info">
              Perubahan alamat, geofence, dan jam buka master dilakukan oleh Admin Tenant di menu Outlets.
            </InfoNote>
          </div>
        </Card>

        <Card>
          <CardHead title="Kebijakan Pajak & Service" />
          <div className="card-body stack g3">
            <Field label="Pajak (PB1)" hint="Diterapkan ke setiap transaksi"><input defaultValue={`${outlet.taxPct}%`} readOnly /></Field>
            <Field label="Service Charge" hint="Ditambahkan sebelum pajak"><input defaultValue={`${outlet.serviceChargePct}%`} readOnly /></Field>
            <Field label="Kebijakan Keterlambatan"><input defaultValue={outlet.latePolicy.replace(/_/g, " ")} readOnly /></Field>
            <Field label="Grace Period"><input defaultValue={`${outlet.gracePeriodMin} menit`} readOnly /></Field>
          </div>
        </Card>
      </div>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead
            title="Deposit Booking"
            sub="Nominal dan kebijakan deposit khusus outlet ini"
            action={<Switch on={dep.enabled} />}
          />
          <div className="card-body stack g4">
            <div className="grid grid-2">
              <Field label="Metode Perhitungan" hint="Nominal tetap atau persentase dari harga layanan">
                <select className="select" defaultValue={dep.type}>
                  <option value="FIXED">Nominal tetap (Rupiah)</option>
                  <option value="PERCENT">Persentase dari harga layanan</option>
                </select>
              </Field>
              <Field
                label={dep.type === "FIXED" ? "Nominal Deposit (Rp)" : "Persentase Deposit (%)"}
                hint={dep.type === "FIXED" ? `Saat ini ${rp(dep.value)} per booking` : `Saat ini ${dep.value}% dari harga layanan`}
              >
                <input className="input" type="number" defaultValue={dep.value} />
              </Field>
              <Field label="Minimum Total Transaksi" hint={dep.minTicket > 0 ? `Deposit hanya diminta bila total ≥ ${rp(dep.minTicket)}` : "Diisi 0 = deposit berlaku untuk semua booking"}>
                <input className="input" type="number" defaultValue={dep.minTicket} />
              </Field>
              <Field label="Batas Waktu Pembayaran (menit)" hint="Booking otomatis dibatalkan bila deposit belum dibayar">
                <input className="input" type="number" defaultValue={dep.expiryMin} />
              </Field>
            </div>

            <div>
              <label className="small bold" style={{ color: "var(--text-2)", display: "block", marginBottom: 8 }}>
                Berlaku untuk Sumber Booking
              </label>
              <div className="row g2 wrap">
                {(["Customer App", "WhatsApp", "Phone", "Walk-in", "Kasir"] as const).map((src) => (
                  <span key={src} className={`chip ${dep.appliesTo.includes(src) ? "on" : ""}`}>
                    {dep.appliesTo.includes(src) && <Icon name="check" size={12} />}
                    {src}
                  </span>
                ))}
              </div>
            </div>

            <div className="row between" style={{ paddingTop: 4 }}>
              <div style={{ minWidth: 0 }}>
                <div className="small strong" style={{ color: "var(--text-1)" }}>Deposit dapat dikembalikan</div>
                <div className="tiny dim">Bila tamu membatalkan sesuai kebijakan pembatalan outlet</div>
              </div>
              <Switch on={dep.refundable} />
            </div>

            <Field label="Catatan pada Halaman Booking" hint="Ditampilkan ke tamu sebelum konfirmasi booking">
              <textarea className="textarea" defaultValue={dep.note} />
            </Field>
          </div>
        </Card>

        <Card className="card-pad">
          <div className="row g2" style={{ marginBottom: 12 }}>
            <Icon name="hand-coins" size={16} style={{ color: "var(--accent)" }} />
            <h3>Simulasi Deposit</h3>
          </div>
          {dep.enabled ? (
            <>
              <div className="stack g3" style={{ marginBottom: 14 }}>
                {SIMULASI.map((total) => {
                  const d = depositFor(outlet.id, total);
                  return (
                    <div key={total} className="row between small" style={{ paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                      <span className="muted">Booking {rp(total, { short: true })}</span>
                      {d > 0 ? (
                        <span className="strong" style={{ color: "var(--accent)" }}>{rp(d)}</span>
                      ) : (
                        <span className="tiny dim">tanpa deposit</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <InfoNote icon="info">
                Deposit dipotong otomatis dari total tagihan saat pembayaran akhir di kasir.
              </InfoNote>
            </>
          ) : (
            <div className="stack g3">
              <div className="small dim">Deposit nonaktif untuk outlet ini — semua booking dapat dibuat tanpa pembayaran di muka.</div>
              <InfoNote tone="warning" icon="alert-triangle">
                Tanpa deposit, risiko no-show cenderung lebih tinggi. Pantau angka no-show di menu Reports.
              </InfoNote>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Kebijakan Booking" />
          <div className="card-body stack g3">
            {[
              { label: "Minimum Lead Time Booking", desc: "Jarak minimal booking dibuat sebelum jadwal", value: "30 menit", on: true },
              { label: "Auto-confirm Booking Online", desc: "Booking dari Customer App langsung terkonfirmasi", value: "", on: true },
              { label: "Izinkan Walk-in Overbook", desc: "Booking walk-in melebihi slot terjadwal", value: "", on: false },
              { label: "Reminder H-1 via WhatsApp", desc: "Kirim pengingat otomatis 1 hari sebelum jadwal", value: "", on: true },
              { label: "Konfirmasi Ulang Booking Non-Hari-Ini", desc: "Wajib dikonfirmasi ulang tamu pada hari-H, minimal 1 jam sebelum jadwal — lewat itu otomatis dianggap batal", value: "min. 1 jam", on: true },
              { label: "Batas Waktu Cancel Gratis", desc: "Cancel di bawah batas ini dikenakan biaya", value: "2 jam", on: true },
            ].map((row) => (
              <div key={row.label} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small strong" style={{ color: "var(--text-1)" }}>{row.label}</div>
                  <div className="tiny dim">{row.desc}{row.value ? ` · ${row.value}` : ""}</div>
                </div>
                <Switch on={row.on} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Notifikasi Outlet" />
          <div className="card-body stack g3">
            {[
              { label: "Alert Stok Menipis", desc: "Notifikasi saat stok di bawah minimum", on: true },
              { label: "Alert Absensi Mencurigakan", desc: "Notifikasi mock-location / luar geofence", on: true },
              { label: "Alert Sesi Akan Berakhir", desc: "Pengingat 10 menit sebelum sesi selesai", on: true },
              { label: "Ringkasan Harian ke Owner", desc: "Kirim rekap harian otomatis pukul 22:00", on: true },
              { label: "Laporan Closing Kasir", desc: "Notifikasi variance saat shift ditutup", on: false },
            ].map((row) => (
              <div key={row.label} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="small strong" style={{ color: "var(--text-1)" }}>{row.label}</div>
                  <div className="tiny dim">{row.desc}</div>
                </div>
                <Switch on={row.on} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
