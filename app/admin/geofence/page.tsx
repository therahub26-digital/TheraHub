import { PageHead, Card, CardHead, Badge, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getOutlets } from "@/lib/data/outlets";
import GeofenceEditor from "@/components/GeofenceEditor";

export default async function GeofencePage() {
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  return (
    <>
      <PageHead title="Geofence & Attendance" desc="Latitude/longitude, radius, dan accuracy threshold untuk absensi GPS." />

      <MockDataNotice title="Sebagian halaman ini sudah bisa disimpan">
        <strong>Koordinat, radius, dan accuracy threshold sekarang tersimpan sungguhan</strong> lewat
        tombol Simpan Geofence di bawah peta. Yang <strong>belum</strong>: lima kebijakan absensi di
        kartu kanan — itu belum punya kolom di database, jadi centangannya masih penanda rencana saja.
        Peta yang ditampilkan juga bukan peta asli, melainkan gambar skematis; lingkarannya mengikuti
        slider radius, tapi posisinya tidak mencerminkan lokasi geografis sungguhan.
      </MockDataNotice>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title={`Peta Geofence — ${outlet.name}`} sub="Radius menentukan area valid check-in" />
          <GeofenceEditor
            outletId={outlet.id}
            outletName={outlet.name}
            lat={outlet.lat}
            lng={outlet.lng}
            radius={outlet.geofenceRadius}
            accuracy={outlet.accuracyThreshold}
          />
        </Card>

        <div className="stack g5">
          <Card className="card-pad">
            <h4 style={{ marginBottom: 10 }}>Kebijakan Absensi</h4>
            {/* Left unwired on purpose: none of these five have a column
                on `outlets`, so there is nothing to save them to without a
                migration. Rendered disabled with an explanatory title
                rather than as live-looking checkboxes. */}
            <div className="stack g3">
              {[
                { label: "Wajib berada dalam radius geofence", on: true },
                { label: "Check-out hanya di dalam area", on: true },
                { label: "Toleransi keterlambatan 15 menit", on: true },
                { label: "Deteksi mock location / jailbreak", on: true },
                { label: "Wajib device binding (Android wrapper)", on: false },
              ].map((c) => (
                <label
                  key={c.label}
                  className="row g2 small"
                  title="Belum bisa diubah — kebijakan ini belum punya kolom di database."
                  style={{ cursor: "not-allowed" }}
                >
                  <input type="checkbox" checked={c.on} disabled readOnly /> {c.label}
                </label>
              ))}
            </div>
            <div className="tiny dim" style={{ marginTop: 8 }}>
              Penanda rencana — belum tersambung ke penyimpanan.
            </div>
          </Card>

          <InfoNote tone="warning" icon="shield-check" title="Batas Teknis">
            Tidak ada mekanisme GPS yang dapat dijamin 100% anti-fake pada semua perangkat. Target desain adalah
            risk reduction berlapis. Gunakan Android wrapper/native untuk anti-fraud lebih kuat.
          </InfoNote>
        </div>
      </div>

      <Card>
        <CardHead title="Geofence per Outlet" />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Outlet</th><th>Koordinat</th><th>Radius</th><th>Accuracy Threshold</th><th>Late Policy</th></tr></thead>
            <tbody>
              {OUTLETS.map((o) => (
                <tr key={o.id}>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{o.name}</td>
                  <td className="mono small muted">{o.lat.toFixed(4)}, {o.lng.toFixed(4)}</td>
                  <td className="num">{o.geofenceRadius} m</td>
                  <td className="num">{o.accuracyThreshold} m</td>
                  <td><Badge tone="info">{o.latePolicy.replace("_", " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
