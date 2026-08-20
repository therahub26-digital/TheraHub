import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, InfoNote } from "@/components/ui";
import { PRIMARY_OUTLET, bookingsToday, NOW_HHMM } from "@/lib/mock";
import { fmtTime, toMin } from "@/lib/format";

export default function CheckinPage() {
  const outlet = PRIMARY_OUTLET;
  const NOW = toMin(NOW_HHMM);
  const bookings = bookingsToday(outlet.id).filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const upNow = bookings.filter((b) => Math.abs(toMin(b.scheduledStart) - NOW) <= 30).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const later = bookings.filter((b) => toMin(b.scheduledStart) - NOW > 30).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  return (
    <>
      <PageHead
        title="Customer Check-in"
        desc={`${outlet.name} · Pukul ${NOW_HHMM} · Verifikasi kedatangan tamu dan konfirmasi room sebelum sesi dimulai.`}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Perlu Check-in Sekarang" value={upNow.length} icon="user-check" toneKey="gold" deltaLabel="± 30 menit dari jadwal" />
        <StatCard label="Booking Selanjutnya" value={later.length} icon="calendar-clock" toneKey="sky" deltaLabel="Lebih dari 30 menit lagi" />
        <StatCard label="Sudah Check-in" value={bookings.filter((b) => b.status === "CHECKED_IN").length} icon="check-circle" toneKey="teal" deltaLabel="Menunggu mulai sesi" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <Card>
          <div className="card-body">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Cari Booking</label>
              <div className="row g2">
                <input placeholder="Nama tamu, nomor HP, atau kode booking..." style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm"><Icon name="search" size={13} /> Cari</button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Tiba Sekarang" sub="Jadwal dalam rentang ± 30 menit" />
        <div className="card-body stack g3">
          {upNow.length === 0 && <div className="small dim">Tidak ada tamu yang dijadwalkan tiba dalam waktu dekat.</div>}
          {upNow.map((b) => (
            <div key={b.id} className="between" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
              <PersonCell name={b.customerName} sub={`${b.packageName} · ${b.therapistName} · ${b.roomName}`} toneKey="teal" size={34} />
              <div className="row g3">
                <div style={{ textAlign: "right" }}>
                  <div className="small strong" style={{ color: "var(--text-1)" }}>{fmtTime(b.scheduledStart)}</div>
                  <Badge tone={b.status === "CHECKED_IN" ? "success" : b.status === "ARRIVED" ? "purple" : "info"}>{b.status.replace(/_/g, " ")}</Badge>
                </div>
                {b.status !== "CHECKED_IN" && (
                  <button className="btn btn-primary btn-sm"><Icon name="check" size={13} /> Check-in</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Booking Selanjutnya" sub="Belum perlu check-in" />
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Status</th></tr></thead>
            <tbody>
              {later.slice(0, 8).map((b) => (
                <tr key={b.id}>
                  <td className="mono small">{fmtTime(b.scheduledStart)}</td>
                  <td className="strong" style={{ color: "var(--text-1)" }}>{b.customerName}</td>
                  <td className="muted small">{b.packageName}</td>
                  <td className="muted small">{b.therapistName}</td>
                  <td><Badge tone="info">{b.status.replace(/_/g, " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <InfoNote icon="info">
        Konfirmasi identitas tamu, catatan alergi/preferensi, dan status room sebelum menekan Check-in. Sistem otomatis mengunci room yang dipilih hingga sesi selesai.
      </InfoNote>
    </>
  );
}
