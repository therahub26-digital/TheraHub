import Link from "next/link";
import Icon from "@/components/Icon";
import MobileShell from "@/components/MobileShell";
import RoomMoveConfirm from "@/components/RoomMoveConfirm";
import { getSignedInTherapist } from "@/lib/data/commissions";
import { getCurrentOutlet, getRoomsForOutlet } from "@/lib/data/outlets";
import { getBookingsForOutlet, getEffectiveToday } from "@/lib/data/bookings";
import { getTenantTheme } from "@/lib/data/tenant";
import { fmtTime } from "@/lib/format";

// ---------------------------------------------------------------------
// Halaman tujuan QR pintu kamar (Adjie 2026-10-15 malam): terapis yang
// kamarnya ternyata belum siap tinggal jalan ke kamar lain dan scan QR
// di pintunya — kamera HP membuka URL ini (?room=<id>) di PWA, halaman
// menunjukkan tamu aktifnya + kamar lama → kamar baru, lalu satu tombol
// konfirmasi (RoomMoveConfirm → lib/actions/roomMove.ts, yang
// memvalidasi ulang kamar persis seperti check-in kasir).
//
// QR-nya sendiri dicetak manager dari /manager/rooms/qr.
// Mode demo "Ganti Role": tidak ada sesi → tidak ada yang bisa
// dipindah; halaman berkata jujur alih-alih pura-pura.
// ---------------------------------------------------------------------

const MOVABLE_STATUSES = ["CHECKED_IN", "IN_SESSION"];

export default async function RoomMovePage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const [sp, theme, signedIn] = await Promise.all([searchParams, getTenantTheme(), getSignedInTherapist()]);
  const roomId = sp.room ?? "";

  if (!signedIn) {
    return (
      <MobileShell role="therapist" brandKey={theme.brandKey} bgKey={theme.bgKey} title="Pindah Kamar" subtitle="Scan QR kamar" avatarName="Terapis" avatarTone="teal">
        <div className="m-card">
          <div className="small bold" style={{ color: "var(--text-1)", marginBottom: 6 }}>Masuk dulu sebagai terapis</div>
          <div className="tiny dim">
            Pindah kamar lewat QR hanya berlaku untuk terapis yang login sungguhan dan sedang menangani tamu.
          </div>
        </div>
      </MobileShell>
    );
  }

  const [outlet, today] = await Promise.all([getCurrentOutlet(), getEffectiveToday()]);
  const [rooms, todaysBookings] = await Promise.all([
    getRoomsForOutlet(outlet.id),
    getBookingsForOutlet(outlet.id, today),
  ]);

  const targetRoom = rooms.find((r) => r.id === roomId);
  const active = todaysBookings.find((b) => b.therapistId === signedIn.id && MOVABLE_STATUSES.includes(b.status));
  const currentRoom = active?.roomId ? rooms.find((r) => r.id === active.roomId) : undefined;

  return (
    <MobileShell role="therapist" brandKey={theme.brandKey} bgKey={theme.bgKey} title="Pindah Kamar" subtitle={outlet.name} avatarName={signedIn.name} avatarUrl={signedIn.photoUrl} avatarTone="teal">
      <div className="stack g4">
        {!targetRoom ? (
          <div className="m-card">
            <div className="small bold" style={{ color: "var(--danger)", marginBottom: 6 }}>QR tidak dikenali</div>
            <div className="tiny dim">
              Kamar yang dituju tidak ditemukan di outlet Anda. Pastikan Anda memindai QR kamar milik {outlet.name}.
            </div>
          </div>
        ) : !active ? (
          <div className="m-card">
            <div className="row g2" style={{ marginBottom: 6 }}>
              <Icon name="door-open" size={16} style={{ color: "var(--text-3)" }} />
              <span className="small bold" style={{ color: "var(--text-1)" }}>Kamar {targetRoom.name}</span>
            </div>
            <div className="tiny dim">
              Tidak ada tamu yang sedang Anda tangani (check-in atau sesi berjalan), jadi tidak ada yang perlu
              dipindah ke kamar ini. Kalau tamu Anda belum check-in, kasir yang memilih kamarnya saat check-in.
            </div>
            <Link href="/therapist" className="m-btn m-btn-ghost" style={{ marginTop: 10 }}>Kembali ke Beranda</Link>
          </div>
        ) : (
          <div className="m-card">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="door-open" size={16} style={{ color: "var(--accent)" }} />
              <span className="small bold" style={{ color: "var(--text-1)" }}>Pindah ke Kamar {targetRoom.name}?</span>
            </div>
            <div className="stack g1" style={{ marginBottom: 12 }}>
              <div className="tiny dim">Tamu: <span className="bold" style={{ color: "var(--text-1)" }}>{active.customerName}</span> · {active.packageName}</div>
              <div className="tiny dim">Jadwal {fmtTime(active.scheduledStart)} · status {active.status.replace(/_/g, " ")}</div>
              <div className="tiny dim">
                Kamar sekarang: <span className="bold" style={{ color: "var(--text-1)" }}>{currentRoom?.name ?? "—"}</span>
                {" → "}
                <span className="bold" style={{ color: "var(--accent)" }}>{targetRoom.name}</span>
              </div>
            </div>
            <RoomMoveConfirm roomId={targetRoom.id} roomName={targetRoom.name} />
            <div className="tiny dim" style={{ marginTop: 10 }}>
              Kamar lama otomatis bebas untuk tamu berikutnya. Kalau kamar tujuan baru saja dipakai tamu lain,
              perpindahan ditolak — pindai kamar lain.
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
