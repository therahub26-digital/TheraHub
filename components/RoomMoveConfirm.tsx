"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { moveMyActiveBookingRoom } from "@/lib/actions/roomMove";

// ---------------------------------------------------------------------
// Tombol konfirmasi pindah kamar setelah terapis scan QR pintu kamar
// (lihat lib/actions/roomMove.ts). Satu tap — konfirmasi memang
// disengaja ada (bukan auto-pindah saat halaman terbuka) supaya scan
// yang tidak sengaja tidak memindahkan tamu.
// ---------------------------------------------------------------------

export default function RoomMoveConfirm({ roomId, roomName }: { roomId: string; roomName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="stack g2">
        <div className="small bold" style={{ color: "var(--success, #2e9e5b)" }}>
          <Icon name="check" size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Tamu Anda dipindah ke kamar {done}.
        </div>
        <Link href="/therapist/session" className="m-btn m-btn-primary"><Icon name="timer" size={15} /> Ke Sesi Berjalan</Link>
      </div>
    );
  }

  return (
    <div className="stack g2">
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
      <button
        className="m-btn m-btn-primary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await moveMyActiveBookingRoom(roomId);
            if (!r.ok) { setError(r.error); return; }
            setDone(r.roomName);
            router.refresh();
          });
        }}
      >
        <Icon name="door-open" size={15} /> {isPending ? "Memindah…" : `Pindah ke ${roomName}`}
      </button>
    </div>
  );
}
