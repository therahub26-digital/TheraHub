"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import {
  checkInBooking,
  startSession,
  completeSession,
  requestExtension,
  approveExtension,
  rejectExtension,
  type ActionResult,
} from "@/lib/actions/sessions";
import { payForSession, type PaymentMethod } from "@/lib/actions/transactions";
import { triggerRoomAlert } from "@/lib/actions/alerts";

// ---------------------------------------------------------------------
// The buttons that actually move a booking through its lifecycle:
// check-in -> start session -> complete. Thin client wrappers around the
// Server Actions in lib/actions/sessions.ts — all the rules (allowed
// status transitions, duplicate-session guard, RLS scoping) live there,
// on the server, so these can't be bypassed by a crafted request. This
// file only handles pending state and surfacing the error text.
// ---------------------------------------------------------------------

function useAction() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }

  return { isPending, error, run };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 4, maxWidth: 260 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

export type RoomOption = { id: string; name: string };

/**
 * The room-picker + Check-in button, factored out so both the booking
 * table (BookingRowActions below) and the dedicated /kasir/checkin page
 * can use the same control. `rooms` is the outlet's currently-free room
 * list (getAvailableRoomsForOutlet) — a snapshot at page render, which is
 * why checkInBooking re-validates availability server-side before
 * committing (see that action's comment).
 */
export function CheckInControl({ bookingId, rooms }: { bookingId: string; rooms: RoomOption[] }) {
  const { isPending, error, run } = useAction();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");

  if (rooms.length === 0) {
    return (
      <div>
        <div className="tiny dim">Semua room sedang terpakai</div>
        <ErrorNote error={error} />
      </div>
    );
  }

  return (
    <div>
      <div className="row g1">
        <select className="select" value={roomId} disabled={isPending} onChange={(e) => setRoomId(e.target.value)} style={{ maxWidth: 130 }}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={isPending || !roomId} onClick={() => run(() => checkInBooking(bookingId, roomId))}>
          <Icon name="user-check" size={13} /> {isPending ? "Menyimpan…" : "Check-in"}
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

/**
 * Shown per booking row. Which button appears is driven by the booking's
 * current status — a guest who hasn't arrived can't have a session
 * started, and one already in session has nothing left to press here.
 *
 * `rooms` is only needed for the check-in step (room is picked live, not
 * at booking time — see lib/actions/bookings.ts's file header) and is
 * ignored once the booking has already moved past CHECKED_IN.
 */
export function BookingRowActions({ bookingId, status, rooms }: { bookingId: string; status: string; rooms: RoomOption[] }) {
  const { isPending, error, run } = useAction();

  const canCheckIn = ["BOOKED", "CONFIRMED", "ARRIVED"].includes(status);
  const canStart = ["CHECKED_IN", "ARRIVED"].includes(status);

  if (!canCheckIn && !canStart) return null;

  return (
    <div>
      <div className="row g1">
        {canCheckIn && <CheckInControl bookingId={bookingId} rooms={rooms} />}
        {canStart && (
          <button className="btn btn-primary btn-sm" disabled={isPending} onClick={() => run(() => startSession(bookingId))}>
            <Icon name="play" size={13} /> Mulai Sesi
          </button>
        )}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "QRIS", "Debit Card", "Credit Card", "Transfer", "E-Wallet"];

/**
 * Bills a single COMPLETED session as one transaction (the service package
 * only — see lib/actions/transactions.ts header for why the full
 * multi-item cart is out of scope for this round). Shown next to each
 * "ready to bill" session in /kasir/sessions.
 */
export function PaySessionButton({ sessionId }: { sessionId: string }) {
  const { isPending, error, run } = useAction();
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [promoCode, setPromoCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);
  const [paid, setPaid] = useState(false);

  if (paid) {
    return (
      <span className="tiny" style={{ color: "var(--success, #2e9e5b)" }}>
        <Icon name="check-circle" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} />
        Dibayar
      </span>
    );
  }

  return (
    <div>
      <div className="row g1">
        <select
          className="select"
          value={method}
          disabled={isPending}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          style={{ maxWidth: 120 }}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {!showPromo && (
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setShowPromo(true)}>
            <Icon name="ticket" size={12} /> Kode Promo
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await payForSession(sessionId, method, promoCode.trim() || undefined);
              if (result.ok) setPaid(true);
              return result;
            })
          }
        >
          <Icon name="shopping-cart" size={12} /> {isPending ? "Memproses…" : "Bayar"}
        </button>
      </div>
      {/* Optional — kode promo/voucher (mis. "AJAKTEMAN30") divalidasi
          server-side saat Bayar ditekan (lib/actions/transactions.ts):
          aktif/tidak, periode berlaku, kuota, dan "pelanggan baru saja"
          kalau promonya memang dibatasi begitu. */}
      {showPromo && (
        <div className="row g1" style={{ marginTop: 6 }}>
          <input
            className="input"
            placeholder="Kode promo (opsional)"
            value={promoCode}
            disabled={isPending}
            onChange={(e) => setPromoCode(e.target.value)}
            style={{ maxWidth: 160 }}
          />
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

/** Therapist begins a treatment once the guest has checked in. */
export function StartSessionButton({ bookingId }: { bookingId: string }) {
  const { isPending, error, run } = useAction();
  return (
    <div>
      <button className="m-btn m-btn-primary" disabled={isPending} onClick={() => run(() => startSession(bookingId))}>
        <Icon name="play" size={15} /> {isPending ? "Memulai…" : "Mulai Sesi"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

const DEFAULT_EXTENSION_REASONS = ["Tamu minta tambahan waktu", "Treatment belum tuntas", "Lainnya"];

/**
 * Therapist's "Ajukan Extension" — one pending request at a time (see
 * requestExtension()'s own guard). `extensions` is the outlet's active
 * extension_options (usually just the one real Rp50.000/30-menit option
 * today, but the picker is built for more than one).
 */
export function RequestExtensionButton({
  sessionId,
  extensions,
}: {
  sessionId: string;
  extensions: { id: string; name: string; durationMin: number; price: number }[];
}) {
  const { isPending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [extensionId, setExtensionId] = useState(extensions[0]?.id ?? "");
  const [reason, setReason] = useState(DEFAULT_EXTENSION_REASONS[0]);
  const [sent, setSent] = useState(false);

  if (extensions.length === 0) return null;

  if (sent) {
    return (
      <div className="tiny" style={{ color: "var(--success, #2e9e5b)" }}>
        <Icon name="check-circle" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} />
        Permintaan extension terkirim — menunggu persetujuan kasir.
      </div>
    );
  }

  if (!open) {
    return (
      <button className="m-btn m-btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="hourglass" size={15} /> Ajukan Extension
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
      <select className="select" value={extensionId} disabled={isPending} onChange={(e) => setExtensionId(e.target.value)}>
        {extensions.map((e) => (
          <option key={e.id} value={e.id}>{e.name} ({e.durationMin} menit)</option>
        ))}
      </select>
      <select className="select" value={reason} disabled={isPending} onChange={(e) => setReason(e.target.value)}>
        {DEFAULT_EXTENSION_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending || !extensionId}
          onClick={() =>
            run(async () => {
              const result = await requestExtension(sessionId, extensionId, reason);
              if (result.ok) setSent(true);
              return result;
            })
          }
        >
          <Icon name="check" size={13} /> {isPending ? "Mengirim…" : "Kirim Permintaan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

/**
 * Kasir/manager "Setujui"/"Tolak" for a pending extension request. Shown
 * next to each PENDING row in /kasir/sessions and /manager/sessions —
 * both can decide (see requestExtension()'s RLS: extension_requests_
 * staff covers manager AND kasir at that outlet), matching the user's
 * "kasir approve saat sesi" decision without locking managers out.
 */
export function ExtensionDecisionButtons({ requestId }: { requestId: string }) {
  const { isPending, error, run } = useAction();
  const [decided, setDecided] = useState<"APPROVED" | "REJECTED" | null>(null);

  if (decided) {
    return (
      <span className="tiny" style={{ color: decided === "APPROVED" ? "var(--success, #2e9e5b)" : "var(--danger)" }}>
        {decided === "APPROVED" ? "Disetujui" : "Ditolak"}
      </span>
    );
  }

  return (
    <div>
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await approveExtension(requestId);
              if (result.ok) setDecided("APPROVED");
              return result;
            })
          }
        >
          <Icon name="check" size={13} /> Setujui
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await rejectExtension(requestId);
              if (result.ok) setDecided("REJECTED");
              return result;
            })
          }
        >
          <Icon name="x" size={13} /> Tolak
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

/**
 * "Panggil Bantuan" — therapist calls for help mid-session (guest being
 * disruptive, needs someone to step in). Pushes an OPEN row to
 * room_alerts; manager + kasir at this outlet see it within a second via
 * Supabase Realtime (components/RoomAlertBanner.tsx), not on next
 * refresh. Turns into a confirmed "Terkirim" state rather than
 * resetting, so a therapist mid-crisis isn't left wondering whether a
 * second tap is needed.
 */
export function EmergencyAlertButton({ bookingId }: { bookingId: string }) {
  const { isPending, error, run } = useAction();
  const [sent, setSent] = useState(false);

  function press() {
    run(async () => {
      const result = await triggerRoomAlert(bookingId);
      if (result.ok) setSent(true);
      return result;
    });
  }

  return (
    <div>
      <button
        className={`m-btn ${sent ? "m-btn-ghost" : "m-btn-danger"}`}
        disabled={isPending || sent}
        onClick={press}
      >
        <Icon name="hand" size={15} /> {isPending ? "Mengirim…" : sent ? "Bantuan Diminta — Terkirim" : "Panggil Bantuan"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

/** Ends a running treatment and hands the booking to the POS to be billed. */
export function CompleteSessionButton({ sessionId, block }: { sessionId: string; block?: boolean }) {
  const { isPending, error, run } = useAction();

  return (
    <div style={block ? undefined : { display: "inline-block" }}>
      <button
        className={`btn btn-primary btn-sm${block ? " btn-block" : ""}`}
        disabled={isPending}
        onClick={() => run(() => completeSession(sessionId))}
      >
        <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Selesaikan Sesi"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}
