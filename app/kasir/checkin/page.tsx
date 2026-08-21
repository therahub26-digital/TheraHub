import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, InfoNote } from "@/components/ui";
import { CheckInControl } from "@/components/SessionActions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getBookingsToday, getEffectiveNow } from "@/lib/data/bookings";
import { getAvailableRoomsForOutlet } from "@/lib/data/rooms";
import { fmtTime, toMin } from "@/lib/format";

// ---------------------------------------------------------------------
// Migrated off lib/mock — was the last kasir-facing page still reading
// bookingsToday()/PRIMARY_OUTLET straight from mock data, which is how a
// retired therapist ("Melati Puspita") and invented guest names kept
// showing up here even after the booking calendar itself was fixed.
//
// Room picking now happens HERE, not at booking time (see
// lib/actions/bookings.ts's file header for the design decision) — each
// arriving guest gets a room select sourced from
// getAvailableRoomsForOutlet, which only lists rooms that are ACTIVE and
// not currently held by another CHECKED_IN/IN_SESSION booking. Already
// checked-in guests show whatever room they were actually assigned.
// ---------------------------------------------------------------------

export default async function CheckinPage() {
  const outlet = await getCurrentOutlet();
  const [bookingsRaw, nowHHMM, availableRooms] = await Promise.all([
    getBookingsToday(outlet.id),
    getEffectiveNow(),
    getAvailableRoomsForOutlet(outlet.id),
  ]);
  const rooms = availableRooms.map((r) => ({ id: r.id, name: r.name }));

  const NOW = toMin(nowHHMM);
  const bookings = bookingsRaw.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const upNow = bookings
    .filter((b) => b.status !== "CHECKED_IN" && Math.abs(toMin(b.scheduledStart) - NOW) <= 30)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const later = bookings
    .filter((b) => b.status !== "CHECKED_IN" && toMin(b.scheduledStart) - NOW > 30)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const checkedIn = bookings.filter((b) => b.status === "CHECKED_IN");

  return (
    <>
      <PageHead
        title="Customer Check-in"
        desc={`${outlet.name} · Pukul ${nowHHMM} · Verifikasi kedatangan tamu dan pilih room yang sedang kosong.`}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Perlu Check-in Sekarang" value={upNow.length} icon="user-check" toneKey="gold" deltaLabel="± 30 menit dari jadwal" />
        <StatCard label="Booking Selanjutnya" value={later.length} icon="calendar-clock" toneKey="sky" deltaLabel="Lebih dari 30 menit lagi" />
        <StatCard label="Sudah Check-in" value={checkedIn.length} icon="check-circle" toneKey="teal" deltaLabel="Menunggu mulai sesi" />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardHead title="Tiba Sekarang" sub="Jadwal dalam rentang ± 30 menit" />
        <div className="card-body stack g3">
          {upNow.length === 0 && <div className="small dim">Tidak ada tamu yang dijadwalkan tiba dalam waktu dekat.</div>}
          {upNow.map((b) => (
            <div key={b.id} className="between" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
              <PersonCell name={b.customerName} sub={`${b.packageName} · ${b.therapistName}`} toneKey="teal" size={34} />
              <div className="row g3">
                <div style={{ textAlign: "right" }}>
                  <div className="small strong" style={{ color: "var(--text-1)" }}>{fmtTime(b.scheduledStart)}</div>
                  <Badge tone={b.status === "ARRIVED" ? "purple" : "info"}>{b.status.replace(/_/g, " ")}</Badge>
                </div>
                <CheckInControl bookingId={b.id} rooms={rooms} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {checkedIn.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead title="Sudah Check-in" sub="Menunggu sesi dimulai" />
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Jam</th><th>Tamu</th><th>Layanan</th><th>Terapis</th><th>Room</th></tr></thead>
              <tbody>
                {checkedIn.map((b) => (
                  <tr key={b.id}>
                    <td className="mono small">{fmtTime(b.scheduledStart)}</td>
                    <td className="strong" style={{ color: "var(--text-1)" }}>{b.customerName}</td>
                    <td className="muted small">{b.packageName}</td>
                    <td className="muted small">{b.therapistName}</td>
                    <td className="muted small">{b.roomName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
              {later.length === 0 && (
                <tr>
                  <td colSpan={5} className="dim small" style={{ textAlign: "center", padding: "20px 0" }}>
                    Tidak ada booking berikutnya hari ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <InfoNote icon="info">
        Room dipilih saat tamu check-in, bukan saat booking dibuat — daftar room di atas hanya menampilkan room yang benar-benar kosong saat ini. Konfirmasi identitas tamu dan catatan alergi/preferensi sebelum menekan Check-in.
      </InfoNote>
    </>
  );
}
