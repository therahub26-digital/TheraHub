import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionsForOutlet } from "@/lib/data/sessions";
import { getEffectiveToday } from "@/lib/data/bookings";
import type { PayableSession, PayableExtension } from "@/lib/types";

// ---------------------------------------------------------------------
// Read layer for /kasir/pos (POS Cart) — new 2026-08-23.
//
// The cashier's counter needs something no existing read layer produced:
// not just WHICH sessions are waiting to be billed (SessionRec.isPaid
// already answers that) but WHAT EACH ONE COSTS before the cashier adds
// anything to the cart. That number is the locked-in booking price plus
// every extension the cashier already approved during the session —
// exactly the same two sources lib/actions/transactions.ts bills from,
// so the total shown at the counter and the total actually charged come
// from one story rather than two that can drift apart.
//
// Deliberately NOT re-deriving the price from the current catalog: a
// booking's price is frozen at booking time (bookings.price), and a
// package repriced this afternoon must not silently restate what this
// morning's guest agreed to pay.
//
// No mock fallback. The demo "Ganti Role" viewer gets null and the page
// renders its own presentational branch — inventing a payable queue with
// fake money in it is the one thing a cashier screen must never do.
// ---------------------------------------------------------------------

// Shapes live in lib/types.ts so the client cart can import them without
// dragging this server-only module into the browser bundle — see the note
// on PayableSession there. Re-exported so server callers can keep using
// them straight from this module.
export type { PayableSession, PayableExtension } from "@/lib/types";

async function fetchPayableSessions(outletId: string): Promise<PayableSession[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // demo viewer — see header note.

  const today = await getEffectiveToday();
  const sessions = await getSessionsForOutlet(outletId, today);
  const waiting = sessions.filter((s) => s.status === "COMPLETED" && !s.isPaid);
  if (waiting.length === 0) return [];

  const bookingIds = waiting.map((s) => s.bookingId).filter(Boolean);
  const sessionIds = waiting.map((s) => s.id);

  const [{ data: bookingRows }, { data: extRequestRows }] = await Promise.all([
    bookingIds.length
      ? supabase.from("bookings").select("id, price").in("id", bookingIds)
      : Promise.resolve({ data: [] as { id: string; price: number | string }[] }),
    supabase.from("extension_requests").select("session_id, extension_id").in("session_id", sessionIds).eq("status", "APPROVED"),
  ]);

  const priceByBooking = new Map((bookingRows ?? []).map((b) => [b.id as string, Number(b.price)]));

  // Extension options are looked up in one batch rather than per session
  // — a busy evening can have several sessions each carrying extensions.
  const extensionIds = [...new Set((extRequestRows ?? []).map((r) => r.extension_id as string))];
  const { data: extensionRows } = extensionIds.length
    ? await supabase.from("extension_options").select("id, name, price").in("id", extensionIds)
    : { data: [] as { id: string; name: string; price: number | string }[] };
  const extensionById = new Map((extensionRows ?? []).map((e) => [e.id as string, e]));

  const extensionsBySession = new Map<string, PayableExtension[]>();
  for (const req of extRequestRows ?? []) {
    const option = extensionById.get(req.extension_id as string);
    if (!option) continue; // option deleted since approval — mirrors payForSession, which also skips it rather than billing an unknown price
    const list = extensionsBySession.get(req.session_id as string) ?? [];
    list.push({ name: option.name, price: Number(option.price) });
    extensionsBySession.set(req.session_id as string, list);
  }

  return waiting.map((s) => {
    const packagePrice = priceByBooking.get(s.bookingId) ?? 0;
    const extensions = extensionsBySession.get(s.id) ?? [];
    return {
      sessionId: s.id,
      bookingId: s.bookingId,
      customerName: s.customerName,
      therapistName: s.therapistName,
      roomName: s.roomName,
      packageName: s.packageName,
      packagePrice,
      extensions,
      baseTotal: packagePrice + extensions.reduce((sum, e) => sum + e.price, 0),
    };
  });
}

export const getPayableSessionsForOutlet = cache(fetchPayableSessions);
