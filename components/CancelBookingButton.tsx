"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { cancelCustomerBooking } from "@/lib/actions/customerBookings";
import { GUEST_CHANGE_CUTOFF_MIN, guestCanStillChange } from "@/lib/bookingRules";

// Small client island for /customer/history's "Batalkan" button — kept
// separate from the (server) page component since it needs its own
// pending/error/confirm state. See lib/actions/customerBookings.ts for
// what's actually allowed to be cancelled (CANCELLABLE_STATUSES) and why.
//
// UPDATE 2026-08-23 — rule 2: "budi bisa minta ganti jadwal atau
// therapis minimal 1 jam sebelumnya ... kalau tidak maka akan
// dibatalkan oleh kasir secara manual". Inside that last hour the
// booking stops being self-service, so the button is replaced by a
// pointer to the outlet rather than silently failing on submit.
//
// `initiallyLocked` is computed on the server so the first paint is
// already correct (no flash of a button the guest can't use), then the
// component keeps its own clock so the state flips live if they leave
// the page open across the cutoff.
export default function CancelBookingButton({
  bookingId,
  startIso,
  initiallyLocked,
}: {
  bookingId: string;
  startIso: string;
  initiallyLocked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(initiallyLocked);

  useEffect(() => {
    const tick = () => setLocked(!guestCanStillChange(startIso));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [startIso]);

  if (locked) {
    return (
      <div className="row g2" style={{ alignItems: "flex-start", flex: 1 }}>
        <Icon name="info" size={13} style={{ color: "var(--info)", flexShrink: 0, marginTop: 1 }} />
        <span className="tiny muted" style={{ lineHeight: 1.6 }}>
          Ganti jadwal, ganti terapis, atau batal lewat aplikasi hanya bisa sampai {GUEST_CHANGE_CUTOFF_MIN} menit sebelum jadwal.
          Hubungi outlet untuk perubahan sekarang.
        </span>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="m-btn m-btn-danger" style={{ height: 36, fontSize: 12.5, flex: 1 }} onClick={() => setConfirming(true)}>
        Batalkan
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ flex: 1 }}>
      <div className="tiny muted">Yakin batalkan booking ini?</div>
      {error && (
        <div className="row g1" style={{ color: "var(--danger)" }}>
          <Icon name="triangle-alert" size={12} />
          <span className="tiny">{error}</span>
        </div>
      )}
      <div className="row g2">
        <button
          type="button"
          className="m-btn m-btn-danger"
          style={{ height: 36, fontSize: 12.5, flex: 1 }}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelCustomerBooking(bookingId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            })
          }
        >
          {isPending ? "Membatalkan…" : "Ya, Batalkan"}
        </button>
        <button type="button" className="m-btn m-btn-ghost" style={{ height: 36, fontSize: 12.5, flex: 1 }} disabled={isPending} onClick={() => setConfirming(false)}>
          Tidak
        </button>
      </div>
    </div>
  );
}
