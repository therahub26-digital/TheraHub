import { PageHead, Card, CardHead, Field, Switch, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import AlarmSoundSetting from "@/components/AlarmSoundSetting";
import BookingWindowSetting from "@/components/BookingWindowSetting";
import { TaxServiceEditor, DepositEditor } from "@/components/OutletSettingsEditor";
import { getCurrentOutlet } from "@/lib/data/outlets";

// ---------------------------------------------------------------------
// Outlet Settings.
//
// Until 2026-08-24 this page had two separate problems layered on each
// other: it rendered MOCK data (PRIMARY_OUTLET) rather than the outlet
// the signed-in manager actually runs, AND its "Simpan Perubahan" button
// was disabled, so nothing could be changed anyway. A Mekarwangi manager
// opening it saw Cikawao's tax rate and deposit rule presented as their
// own.
//
// Both are fixed. Everything on this page now reads the real outlet row
// (getCurrentOutlet(), the same helper the rest of the manager portal
// uses), and four cards write to it: Pajak & Service, Deposit Booking,
// Suara Alarm Sesi, and Jendela Booking Customer App.
//
// Two cards are deliberately still read-only — "Kebijakan Booking" and
// "Notifikasi Outlet". Those rows have NO columns on `outlets` at all,
// so making them savable is a migration, not a wiring job. They are left
// as read-only Switches (see components/ui.tsx) and labelled as such,
// rather than given handlers that would throw the value away.
// ---------------------------------------------------------------------

export default async function OutletSettingsPage() {
  const outlet = await getCurrentOutlet();

  return (
    <>
      <PageHead
        title="Outlet Settings"
        desc={`${outlet.name} · Jam operasional, kebijakan booking, dan preferensi outlet.`}
        /* No page-level "Simpan Perubahan": each card saves itself, so one
           global button would be ambiguous about what it covers — and its
           predecessor here was a disabled button that covered nothing. */
      />

      <MockDataNotice title="Dua kartu di halaman ini masih penanda rencana">
        Yang benar-benar tersimpan ke outlet Anda: <strong>Pajak &amp; Service</strong>,
        <strong>Deposit Booking</strong>, <strong>Suara Alarm Sesi</strong>, dan
        <strong>Jendela Booking Customer App</strong>. Yang <strong>belum</strong>:
        kartu <strong>Kebijakan Booking</strong> dan <strong>Notifikasi Outlet</strong> di bawah —
        keduanya belum punya kolom di database, jadi saklarnya masih penanda rencana, bukan
        pengaturan yang berlaku.
      </MockDataNotice>

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
          <CardHead title="Kebijakan Pajak & Service" sub="Berlaku ke setiap transaksi kasir" />
          <div className="card-body">
            <TaxServiceEditor
              outletId={outlet.id}
              taxPct={outlet.taxPct}
              taxEnabled={outlet.taxEnabled ?? true}
              serviceChargePct={outlet.serviceChargePct}
              serviceChargeEnabled={outlet.serviceChargeEnabled ?? true}
              latePolicy={outlet.latePolicy}
              gracePeriodMin={outlet.gracePeriodMin}
            />
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Deposit Booking" sub="Nominal dan kebijakan deposit khusus outlet ini" />
        <div className="card-body">
          <DepositEditor outletId={outlet.id} deposit={outlet.deposit} />
        </div>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card>
          <CardHead title="Kebijakan Booking" sub="Penanda rencana — belum tersambung ke penyimpanan" />
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
                <Switch on={row.on} label={row.label} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Notifikasi Outlet" sub="Penanda rencana — belum tersambung ke penyimpanan" />
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
                <Switch on={row.on} label={row.label} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start", marginTop: 20 }}>
        <Card>
          <CardHead title="Suara Alarm Sesi" sub="Bunyi yang terdengar terapis saat waktu sesi habis" />
          <div className="card-body">
            <AlarmSoundSetting outletId={outlet.id} currentUrl={outlet.alarmSoundUrl ?? null} />
          </div>
        </Card>

        <Card>
          <CardHead title="Jendela Booking Customer App" sub="Berapa hari ke depan tamu boleh booking sendiri" />
          <div className="card-body">
            <BookingWindowSetting outletId={outlet.id} currentDays={outlet.bookingWindowDays ?? 0} />
          </div>
        </Card>
      </div>
    </>
  );
}
