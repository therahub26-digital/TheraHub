"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { checkInBooking, startSession, completeSession, type ActionResult } from "@/lib/actions/sessions";
import { payForSession, type PaymentMethod } from "@/lib/actions/transactions";

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

/**
 * Shown per booking row. Which button appears is driven by the booking's
 * current status — a guest who hasn't arrived can't have a session
 * started, and one already in session has nothing left to press here.
 */
export function BookingRowActions({ bookingId, status }: { bookingId: string; status: string }) {
  const { isPending, error, run } = useAction();

  const canCheckIn = ["BOOKED", "CONFIRMED", "ARRIVED"].includes(status);
  const canStart = ["CHECKED_IN", "ARRIVED"].includes(status);

  if (!canCheckIn && !canStart) return null;

  return (
    <div>
      <div className="row g1">
        {canCheckIn && (
          <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => run(() => checkInBooking(bookingId))}>
            <Icon name="user-check" size={13} /> Check-in
          </button>
        )}
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
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() =>
            run(async () => {
              const result = await payForSession(sessionId, method);
              if (result.ok) setPaid(true);
              return result;
            })
          }
        >
          <Icon name="shopping-cart" size={12} /> {isPending ? "Memproses…" : "Bayar"}
        </button>
      </div>
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
