// ---------------------------------------------------------------------
// The app's timestamp convention, in ONE place.
//
// READ THIS BEFORE WRITING ANY timestamptz COLUMN.
//
// TheraHub has no real timezone handling yet. Rather than half-implement
// it (which is how you get bookings that silently shift by 7 hours), the
// whole app uses one deliberately simple convention:
//
//   *** Wall-clock time is stored as if it were UTC. ***
//
// A booking the kasir types as "10:00" is written to Postgres as
// "2026-08-20T10:00:00+00:00", and read back for display by literally
// slicing the "10:00" out of that string again. The digits the staff
// typed are the digits they see. Nothing is converted, so nothing can
// drift.
//
// The trade-off, stated plainly: the stored instant is NOT the true UTC
// instant of that appointment. Amethyst is UTC+7 (WIB), so a 10:00 WIB
// booking is stored as 10:00Z, which is really 03:00 WIB. That is fine
// while every reader is this app (which applies the same convention on
// the way out) and every outlet is in one timezone. It becomes wrong the
// moment something else reads these columns — an external calendar sync,
// a reporting tool, a second timezone, or Postgres date math like
// `age(now(), scheduled_start)`. Fixing it later means a data migration
// (shift every stored timestamp by the outlet's offset) plus storing an
// outlet timezone; it is NOT a display-layer-only change. Flagged in the
// roadmap under Fase 9 (QC) — don't let it reach a second timezone first.
//
// The one rule that keeps this coherent: never mix conventions. Anything
// compared against a stored timestamp must be produced by this module
// too, or the comparison is off by the UTC offset. That is exactly why
// `nowIso()` below deliberately does NOT return `new Date().toISOString()`
// — the real UTC instant would be 7 hours adrift from every value the
// booking form has ever written, so "is this session over yet?" would
// answer wrongly by 7 hours.
// ---------------------------------------------------------------------

/** Local wall-clock date as "YYYY-MM-DD". */
export function todayIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local wall-clock time of day as "HH:mm". */
export function nowHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Build a storable timestamp from a wall-clock date + time.
 * `("2026-08-20", "10:00")` -> `"2026-08-20T10:00:00+00:00"`.
 */
export function wallClockIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+00:00`;
}

/**
 * "Now", in the same frame as everything this module stores. Use this —
 * NOT `new Date().toISOString()` — whenever the value will be written to
 * a timestamptz column or compared against one. See the header comment.
 */
export function nowIso(d: Date = new Date()): string {
  return wallClockIso(todayIsoDate(d), nowHHMM(d));
}

/**
 * "2026-08-20T10:00:00+00:00" -> "10:00". A plain "10:00" passes through
 * unchanged, so this is safe to call on mock data (which stores bare
 * "HH:mm" strings) and live rows alike.
 *
 * Note this is a string slice, not a timezone conversion — that is the
 * point of the convention above, and it is what keeps `toMin()` in
 * lib/format.ts working (it only parses "HH:mm" and would return NaN on a
 * full ISO timestamp, silently breaking the booking calendar's layout).
 */
export function toHHMM(timestamptzOrHHMM: string | null | undefined): string {
  if (!timestamptzOrHHMM) return "";
  if (!timestamptzOrHHMM.includes("T")) return timestamptzOrHHMM;
  return timestamptzOrHHMM.split("T")[1].slice(0, 5);
}

/**
 * Shift a stored timestamp by N minutes, staying inside this module's
 * frame. Re-serializes from the UTC getters on purpose: the input's
 * wall-clock digits live in the UTC slot (that's the convention), so
 * reading them back with local getters would re-apply the machine's
 * offset and shift the value. Handles crossing midnight, so a 23:30
 * booking with a 90-minute package correctly ends 01:00 the next day.
 */
export function plusMinutes(iso: string, mins: number): string {
  const d = new Date(new Date(iso).getTime() + mins * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+00:00`;
}

/**
 * Minutes between two stored timestamps (b - a). Both arguments must come
 * from this module's convention, or the result is off by the UTC offset.
 * Uses real Date parsing rather than "HH:mm" arithmetic so that a session
 * running across midnight still measures correctly.
 */
export function minutesBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000;
}
