import { PageHead, Card, CardHead, StatCard, Badge, PersonCell, InfoNote } from "@/components/ui";
import { CheckInControl } from "@/components/SessionActions";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getBookingsToday, getEffectiveNow } from "@/lib/data/bookings";
import { getRoomsForOutlet, getAvailableRoomsForOutlet } from "@/lib/data/rooms";
import { getActiveSessionsForOutlet } from "@/lib/data/sessions";
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
  const [bookingsRaw, nowHHMM, availableRooms, allRooms, activeSessions] = await Promise.all([
    getBookingsToday(outlet.id),
    getEffectiveNow(),
    getAvailableRoomsForOutlet(outlet.id),
    getRoomsForOutlet(outlet.id),
    getActiveSessionsForOutlet(outlet.id),
  ]);
  const rooms = availableRooms.map((r) => ({ id: r.id, name: r.name }));

  const NOW = toMin(nowHHMM);
  const bookings = bookingsRaw.filter((b) => ["BOOKED", "CONFIRMED", "ARRIVED", "CHECKED_IN"].includes(b.status));
  const upNow = bookings
    .filter((b) => b.status !== "CHECKED_IN" && Math.abs(toMin(b.scheduledStart) - NOW) <= 30)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const checkedIn = bookings.filter((b) => b.status === "CHECKED_IN");

  // User request 2026-08-23: "tampilan customer checkin di kasir berisi
  // daftar yg booking belum checkin, dan ruangan beserta statusnya
  // seperti di tampilan room role manager, jadi si kasir tahu status
  // ruangan dan terapis yang kerja dan waktunya berapa lama lagi
  // sehingga bisa menempatkan orang berikutnya untuk dilakukan checkin
  // di room berapa. booking selanjutnya tidak perlu tampil karena sudah
  // di panel today booking." Reuses the exact same live source
  // (getActiveSessionsForOutlet) /manager/rooms already reads from, so
  // "sisa Nm" here can never disagree with what the manager sees.
  const roomStatus = allRooms.map((r) => {
    const session = activeSessions.find((s) => s.roomName === r.name);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      maintenance: r.status === "MAINTENANCE",
      inactive: r.status === "INACTIVE",
      session,
    };
  });

  return (
    <>
      <PageHead
        title="Customer Check-in"
        desc={`${outlet.name} · Pukul ${nowHHMM} · Verifikasi kedatangan tamu dan pilih room yang sedang kosong.`}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Perlu Check-in Sekarang" value={upNow.length} icon="user-check" toneKey="gold" deltaLabel="± 30 menit dari jadwal" />
        <StatCard label="Sudah Check-in" value={checkedIn.length} icon="check-circle" toneKey="teal" deltaLabel="Menunggu mulai sesi" />
        <StatCard
          label="Room Tersedia"
          value={roomStatus.filter((r) => !r.maintenance && !r.inactive && !r.session).length}
          icon="door-open"
          toneKey="sky"
          deltaLabel={`dari ${roomStatus.length} room`}
        />
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
        <CardHead
          title="Status Room"
          sub="Room terpakai menampilkan terapis dan sisa waktu — pakai ini untuk menentukan room mana yang siap dipakai tamu berikutnya"
        />
        <div className="grid grid-rooms">
          {roomStatus.map((r) => {
            const status = r.maintenance ? "Maintenance" : r.session ? "Terpakai" : r.inactive ? "Nonaktif" : "Tersedia";
            const tone = r.maintenance ? "warning" : r.session ? "warning" : r.inactive ? "neutral" : "success";
            return (
              <Card key={r.id} style={{ padding: 12 }}>
                <div className="between" style={{ marginBottom: 6, alignItems: "flex-start" }}>
                  <div>
                    <div className="strong small" style={{ color: "var(--text-1)" }}>{r.name}</div>
                    <div className="tiny dim">{r.code}</div>
                  </div>
                  <Badge tone={tone as "warning" | "success" | "neutral"} dot>{status}</Badge>
                </div>
                {r.session ? (
                  <div className="tiny truncate" style={{ color: "var(--warning)" }}>
                    {r.session.therapistName} · sisa {r.session.minutesRemaining}m
                  </div>
                ) : (
                  <div className="tiny dim">Siap untuk tamu berikutnya</div>
                )}
              </Card>
            );
          })}
          {roomStatus.length === 0 && <div className="small dim">Belum ada room terdaftar di outlet ini.</div>}
        </div>
      </Card>

      <InfoNote icon="info">
        Room dipilih saat tamu check-in, bukan saat booking dibuat — daftar room di atas hanya menampilkan room yang benar-benar kosong saat ini. Konfirmasi identitas tamu dan catatan alergi/preferensi sebelum menekan Check-in.
      </InfoNote>
    </>
  );
}
