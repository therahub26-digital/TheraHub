"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { confirmBookingStaff } from "@/lib/actions/bookings";
import { KASIR_REMINDER_LEAD_MIN, type FollowUpItem } from "@/lib/bookingRules";

// ---------------------------------------------------------------------
// Rule 2, staff side — added 2026-08-23. The guest is supposed to get an
// email at H-1 (not built: no mail provider is wired up yet, see the
// roadmap's Fase 8), but the user's description of how this actually
// works day to day is: "prakteknya kasir akan mendapatkan notifikasi
// juga dan menghubungi budi secara manual via wa". So this is the
// working half of that rule — the list of guests to chase, with the
// WhatsApp link to chase them and the button to record the outcome.
//
// Rendered on BOTH /kasir (Today/Booking) and /manager (Today Overview),
// the same way components/ExtensionRequestAlert.tsx is: the user only
// named the kasir, but the manager runs the same floor and the existing
// alert components already established that parity. The caller does the
// filtering (it needs server-side data access); this component is purely
// the presentation + the two actions, so it takes plain serializable
// props.
// ---------------------------------------------------------------------

/**
 * Indonesian mobile numbers are stored in this app in whatever shape the
 * kasir typed them ("+62 812-0000-0001", "0812 0000 0001", …), but
 * wa.me only accepts bare international digits. Local "0…" numbers are
 * rewritten to "62…"; anything already starting with 62 is left alone.
 * Returns null when there is nothing dialable, so the caller can render
 * plain text instead of a dead link.
 */
export function waLink(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("62")) return `https://wa.me/${digits}`;
  if (digits.startsWith("0")) return `https://wa.me/62${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

function ConfirmBookingButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack g1" style={{ alignItems: "flex-end" }}>
      <button
        className="btn btn-ghost btn-sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await confirmBookingStaff(id);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <Icon name="check" size={12} /> {isPending ? "Menyimpan…" : "Terkonfirmasi"}
      </button>
      {error && <span className="tiny" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}

export default function BookingFollowUpBanner({ items }: { items: FollowUpItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 20,
        padding: "14px 16px",
        borderRadius: "var(--r-md)",
        background: "var(--warning-soft)",
        border: "1px solid rgba(245,158,11,0.25)",
      }}
    >
      <div className="row g2" style={{ alignItems: "center", marginBottom: 10 }}>
        <Icon name="phone" size={15} style={{ color: "var(--warning)" }} />
        <span className="small strong" style={{ color: "var(--text-1)" }}>
          {items.length} booking perlu dikonfirmasi
        </span>
        <span className="tiny muted">
          · mulai dalam ≤{KASIR_REMINDER_LEAD_MIN} menit dan belum dikonfirmasi — hubungi tamu via WhatsApp
        </span>
      </div>
      <div className="stack g2">
        {items.map((b) => {
          const wa = waLink(b.customerPhone);
          return (
            <div
              key={b.id}
              className="row between"
              style={{ alignItems: "center", gap: 12, paddingTop: 8, borderTop: "1px solid rgba(245,158,11,0.15)" }}
            >
              <div className="row g2" style={{ alignItems: "center", minWidth: 0 }}>
                <span className="mono small nowrap" style={{ color: "var(--warning)" }}>{b.time}</span>
                <span className="small" style={{ color: "var(--text-1)" }}>{b.customerName}</span>
                <span className="tiny muted nowrap">{b.customerPhone}</span>
                <span className="tiny dim nowrap">· {b.therapistName}</span>
                <span className="tiny dim nowrap">
                  {b.minutesUntil >= 0 ? `· ${b.minutesUntil} menit lagi` : `· lewat ${Math.abs(b.minutesUntil)} menit`}
                </span>
              </div>
              <div className="row g1 nowrap" style={{ alignItems: "center" }}>
                {wa ? (
                  <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                    <Icon name="message-square" size={12} /> WhatsApp
                  </a>
                ) : (
                  <span className="tiny dim">No. HP tidak valid</span>
                )}
                <ConfirmBookingButton id={b.id} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
