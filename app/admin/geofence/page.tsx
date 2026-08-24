import { PageHead, Card, CardHead, Field, Badge, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getOutlets } from "@/lib/data/outlets";

export default async function GeofencePage() {
  const OUTLETS = await getOutlets();
  const outlet = OUTLETS[0];
  return (
    <>
      <PageHead title="Geofence & Attendance" desc="Latitude/longitude, radius, dan accuracy threshold untuk absensi GPS." />

      <MockDataNotice title="Perubahan di halaman ini tidak tersimpan">
        Koordinat dan radius di tabel bawah adalah data outlet yang <strong>asli</strong> dan berguna
        untuk verifikasi — tapi halaman ini tidak punya tombol simpan sama sekali. Menggeser slider
        radius, mengubah koordinat, atau mencentang kebijakan absensi tidak menyimpan apa pun.
        Peta yang ditampilkan juga bukan peta asli, melainkan gambar buatan sendiri.
      </MockDataNotice>

      <div className="grid grid-3" style={{ alignItems: "start", marginBottom: 20 }}>
        <Card style={{ gridColumn: "span 2" }}>
          <CardHead title={`Peta Geofence — ${outlet.name}`} sub="Radius menentukan area valid check-in" />
          <div style={{ position: "relative", height: 340, margin: "0 20px 20px", borderRadius: "var(--r-md)", overflow: "hidden", background: "linear-gradient(135deg,#0d1b2a,#132a33)" }}>
            <svg width="100%" height="100%" viewBox="0 0 400 340" style={{ position: "absolute", inset: 0 }}>
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="400" height="340" fill="url(#grid)" />
              <circle cx="200" cy="170" r="110" fill="var(--accent)" opacity="0.09" />
              <circle cx="200" cy="170" r="110" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
              <circle cx="200" cy="170" r="7" fill="var(--accent)" stroke="#04140f" strokeWidth="2" />
            </svg>
            <div style={{ position: "absolute", left: 14, bottom: 14, background: "rgba(10,15,24,0.75)", padding: "8px 12px", borderRadius: "var(--r-sm)", backdropFilter: "blur(8px)" }}>
              <div className="tiny bold" style={{ color: "var(--text-1)" }}>{outlet.name}</div>
              <div className="tiny dim">{outlet.lat.toFixed(4)}, {outlet.lng.toFixed(4)}</div>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div className="grid grid-2">
              <Field label="Latitude"><input className="input mono" defaultValue={outlet.lat} /></Field>
              <Field label="Longitude"><input className="input mono" defaultValue={outlet.lng} /></Field>
              <Field label="Radius Geofence (meter)" hint="Area valid untuk check-in absensi">
                <input className="input" type="range" min={40} max={300} defaultValue={outlet.geofenceRadius} />
              </Field>
              <Field label="Accuracy Threshold (meter)" hint="Akurasi GPS device maksimum yang diterima">
                <input className="input" type="number" defaultValue={outlet.accuracyThreshold} />
              </Field>
            </div>
          </div>
        </Card>

        <div className="stack g5">
          <Card className="card-pad">
            <h4 style={{ marginBottom: 10 }}>Kebijakan Absensi</h4>
            <div className="stack g3">
              <label className="row g2 small"><input type="checkbox" defaultChecked /> Wajib berada dalam radius geofence</label>
              <label className="row g2 small"><input type="checkbox" defaultChecked /> Check-out hanya di dalam area</label>
              <label className="row g2 small"><input type="checkbox" defaultChecked /> Toleransi keterlambatan 15 menit</label>
              <label className="row g2 small"><input type="checkbox" defaultChecked /> Deteksi mock location / jailbreak</label>
              <label className="row g2 small"><input type="checkbox" /> Wajib device binding (Android wrapper)</label>
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
