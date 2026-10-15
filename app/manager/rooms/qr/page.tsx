import { headers } from "next/headers";
import QRCode from "qrcode";
import { PageHead, Card, CardHead, InfoNote } from "@/components/ui";
import MockDataNotice from "@/components/MockDataNotice";
import { getCurrentOutlet } from "@/lib/data/outlets";
import { getRoomsForOutlet, isLiveRoomsData } from "@/lib/data/rooms";
import PrintButton from "@/components/PrintButton";

// ---------------------------------------------------------------------
// Kartu QR per kamar — pasangan cetak dari fitur pindah-kamar terapis
// (Adjie 2026-10-15 malam: "masing2 kamar dibuatkan qr code, tinggal
// pindah kamar dan scan qr ruangan baru"). Manager mencetak halaman ini
// lalu menempel satu kartu di pintu tiap kamar; QR-nya berisi URL
// absolut /therapist/room-move?room=<id> — dipindai kamera HP terapis,
// terbuka di PWA, satu tombol konfirmasi.
//
// URL dibangun dari host request (headers), bukan hardcode domain,
// supaya benar di produksi (amethystbdg.my.id), preview Vercel, maupun
// dev lokal — QR yang dicetak dari produksi memuat domain produksi.
// SVG QR dirender server-side (paket `qrcode`), tanpa jaringan.
// Hanya kamar ACTIVE yang diberi kartu; kamar maintenance tidak
// (scan-nya toh akan ditolak action-nya).
// ---------------------------------------------------------------------

export default async function RoomQrPage() {
  const [outlet, live, h] = await Promise.all([getCurrentOutlet(), isLiveRoomsData(), headers()]);
  const rooms = (await getRoomsForOutlet(outlet.id)).filter((r) => r.status === "ACTIVE");

  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "amethystbdg.my.id";
  const origin = `${proto}://${host}`;

  const cards = await Promise.all(
    rooms.map(async (r) => ({
      room: r,
      svg: await QRCode.toString(`${origin}/therapist/room-move?room=${r.id}`, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      }),
    }))
  );

  return (
    <>
      {/* Saat dicetak: sembunyikan kerangka aplikasi, sisakan kartu QR. */}
      <style>{`@media print { aside, nav, header, .no-print { display: none !important; } body { background: #fff !important; } .qr-card { break-inside: avoid; } }`}</style>

      <div className="no-print">
        <PageHead
          title="QR Kamar"
          desc={`${outlet.name} · cetak lalu tempel satu kartu di pintu tiap kamar — terapis scan untuk memindah tamunya ke kamar itu.`}
          actions={<PrintButton />}
        />
        {!live && (
          <MockDataNotice title="Mode contoh">
            QR di bawah menunjuk kamar contoh — masuk sebagai manager sungguhan sebelum mencetak untuk outlet Anda.
          </MockDataNotice>
        )}
        <InfoNote icon="info" tone="info" title="Cara pakai">
          Terapis yang kamarnya belum siap tinggal berpindah ke kamar kosong lain dan memindai QR di pintunya
          dengan kamera HP — terbuka halaman konfirmasi di aplikasi terapis, satu tombol, selesai. Sistem menolak
          bila kamar sedang dipakai tamu lain atau sedang maintenance. QR memuat alamat {origin} — cetak ulang
          bila domain aplikasi berganti.
        </InfoNote>
      </div>

      <Card style={{ marginTop: 20 }}>
        <CardHead title={`${cards.length} kamar aktif`} sub="Satu kartu per kamar — potong mengikuti garis kartu" />
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {cards.map(({ room, svg }) => (
              <div
                key={room.id}
                className="qr-card"
                style={{
                  border: "1px dashed var(--border-2)",
                  borderRadius: 12,
                  padding: 16,
                  textAlign: "center",
                  background: "#fff",
                  color: "#111",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16 }}>{room.name}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 8 }}>{room.code} · {outlet.name}</div>
                <div style={{ width: 160, margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: svg }} />
                <div style={{ fontSize: 11, marginTop: 8 }}>Scan untuk pindah kamar ke sini</div>
              </div>
            ))}
            {cards.length === 0 && <div className="small dim">Tidak ada kamar aktif di outlet ini.</div>}
          </div>
        </div>
      </Card>
    </>
  );
}
