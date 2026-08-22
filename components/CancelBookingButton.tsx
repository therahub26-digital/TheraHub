"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { cancelCustomerBooking } from "@/lib/actions/customerBookings";

// Small client island for /customer/history's "Batalkan" button — kept
// separate from the (server) page component since it needs its own
// pending/error/confirm state. See lib/actions/customerBookings.ts for
// what's actually allowed to be cancelled (CANCELLABLE_STATUSES) and why.
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
