import type { Booking, BookingStatus, SessionRec, ExtensionRequest } from "../types";
import { makeRng, int, pick, chance, TODAY, NOW_HHMM } from "./rng";
import { addMin, toMin, fromMin, addDays } from "../format";
import { OUTLETS, roomsOf } from "./org";
import { therapistsOf } from "./people";
import { packagesOf } from "./catalog";
import { CUSTOMERS } from "./people";

const SOURCES: Booking["source"][] = ["Walk-in", "Customer App", "Kasir", "WhatsApp", "Phone"];
const NOW = toMin(NOW_HHMM);

const DAYS = Array.from({ length: 15 }, (_, i) => addDays(TODAY, i - 7));

let seq = 4200;

function statusFor(date: string, startMin: number, endMin: number, r: () => number): BookingStatus {
  if (date < TODAY) {
    const roll = r();
    if (roll < 0.055) return "CANCELLED";
    if (roll < 0.085) return "NO_SHOW";
    return "PAID";
  }
  if (date > TODAY) {
    const roll = r();
    if (roll < 0.06) return "CANCELLED";
    if (roll < 0.55) return "CONFIRMED";
    return "BOOKED";
  }
  // today
  if (endMin <= NOW - 20) {
    const roll = r();
    if (roll < 0.05) return "NO_SHOW";
    if (roll < 0.09) return "CANCELLED";
    return roll < 0.82 ? "PAID" : "COMPLETED";
  }
  if (startMin <= NOW && endMin > NOW) return "IN_SESSION";
  if (startMin - NOW <= 25) return chance(r, 0.55) ? "CHECKED_IN" : "ARRIVED";
  if (startMin - NOW <= 90) return chance(r, 0.6) ? "CONFIRMED" : "BOOKED";
  return "BOOKED";
}

const bookings: Booking[] = [];

DAYS.forEach((date, di) => {
  OUTLETS.forEach((outlet, oi) => {
    const rooms = roomsOf(outlet.id).filter((rm) => rm.status === "ACTIVE");
    const therapists = therapistsOf(outlet.id);
    const pkgs = packagesOf(outlet.id).filter((p) => p.status === "ACTIVE");

    therapists.forEach((t, ti) => {
      const r = makeRng(11_000 + di * 331 + oi * 97 + ti * 17);
      if (chance(r, 0.14)) return; // day off
      const openMin = toMin(outlet.openHours.split("· ")[1].split("–")[0]);
      const closeMin = toMin(outlet.openHours.split("· ")[1].split("–")[1]);
      let cursor = openMin + int(r, 0, 5) * 15;
      const count = int(r, 3, 6);

      for (let b = 0; b < count; b++) {
        const eligible = pkgs.filter((p) => t.skills.includes(p.requiredSkill));
        const pkg = eligible.length ? pick(r, eligible) : pick(r, pkgs);
        const start = cursor;
        const end = start + pkg.durationMin;
        if (end + pkg.bufferAfter > closeMin) break;

        const matching = rooms.filter((rm) => rm.type === pkg.roomType);
        const room = matching.length ? matching[(ti + b) % matching.length] : rooms[(ti + b) % rooms.length];
        const cust = CUSTOMERS[(di * 37 + oi * 13 + ti * 7 + b * 3) % CUSTOMERS.length];
        const status = statusFor(date, start, end, r);
        const weekend = [0, 6].includes(new Date(date).getDay());

        seq += 1;
        bookings.push({
          id: `BKG-${seq}`,
          code: `${outlet.receiptPrefix}-${seq}`,
          outletId: outlet.id,
          customerId: cust.id,
          customerName: cust.name,
          customerPhone: cust.phone,
          therapistId: t.id,
          therapistName: t.name,
          roomId: room.id,
          roomName: room.name,
          packageId: pkg.id,
          packageName: pkg.name,
          durationMin: pkg.durationMin,
          price: weekend ? pkg.weekendPrice : cust.membership !== "None" ? pkg.memberPrice : pkg.listPrice,
          date,
          scheduledStart: fromMin(start),
          scheduledEnd: fromMin(end),
          status,
          source: pick(r, SOURCES),
          addOns: chance(r, 0.22) ? [pick(r, ["Hot Stone Add-on", "Aromatherapy Upgrade", "Hot Compress", "Scalp Massage 15"])] : [],
          notes: chance(r, 0.16) ? pick(r, ["Minta tekanan sedang", "Alergi minyak kelapa", "Request terapis wanita", "Ulang tahun — siapkan teh jahe"]) : undefined,
          createdAt: `${addDays(date, -int(r, 0, 6))}T${fromMin(int(r, 8 * 60, 21 * 60))}`,
        });

        cursor = end + pkg.bufferAfter + int(r, 0, 4) * 15;
      }
    });
  });
});

export const BOOKINGS: Booking[] = bookings.sort((a, b) =>
  a.date === b.date ? a.scheduledStart.localeCompare(b.scheduledStart) : a.date.localeCompare(b.date),
);

export const bookingsOf = (outletId: string, date?: string) =>
  BOOKINGS.filter((b) => b.outletId === outletId && (!date || b.date === date));

export const bookingsToday = (outletId: string) => bookingsOf(outletId, TODAY);

export const bookingByCode = (code: string) => BOOKINGS.find((b) => b.code === code);

// ------------------------------------------------------------------ sessions
export const SESSIONS: SessionRec[] = BOOKINGS.filter(
  (b) => b.date === TODAY && ["IN_SESSION", "COMPLETED", "PAID"].includes(b.status),
).map((b, i) => {
  const r = makeRng(31_000 + i * 29);
  const schedStart = toMin(b.scheduledStart);
  const actualStart = schedStart + int(r, 0, 8);
  const extension = chance(r, 0.16) ? pick(r, [15, 30, 60]) : 0;
  const expectedEnd = actualStart + b.durationMin + extension;
  const active = b.status === "IN_SESSION";
  const remaining = Math.max(expectedEnd - NOW, 0);
  const status: SessionRec["status"] = active
    ? remaining <= 10
      ? "ENDING_SOON"
      : "ACTIVE"
    : "COMPLETED";

  return {
    id: `SES-${b.id.slice(4)}`,
    bookingId: b.id,
    bookingCode: b.code,
    outletId: b.outletId,
    customerName: b.customerName,
    therapistId: b.therapistId,
    therapistName: b.therapistName,
    roomName: b.roomName,
    packageName: b.packageName,
    purchasedDurationMin: b.durationMin,
    date: b.date,
    actualStart: fromMin(actualStart),
    expectedEnd: fromMin(expectedEnd),
    actualEnd: active ? null : fromMin(expectedEnd + int(r, -3, 6)),
    extensionMinutes: extension,
    isPaid: b.status === "PAID",
    status,
    minutesRemaining: active ? remaining : 0,
    // Mirrors lib/data/sessions.ts's real computation for consistency,
    // though the demo clock rarely runs a session this late.
    overdueMin: active ? Math.max(NOW - expectedEnd, 0) : 0,
    progressPct: active
      ? Math.min(100, Math.round(((NOW - actualStart) / (expectedEnd - actualStart)) * 100))
      : 100,
  };
});

export const sessionsOf = (outletId: string) => SESSIONS.filter((s) => s.outletId === outletId);
export const activeSessions = (outletId: string) =>
  sessionsOf(outletId).filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");

// --------------------------------------------------------- extension requests
export const EXTENSION_REQUESTS: ExtensionRequest[] = (() => {
  const r = makeRng(444_777);
  const pool = SESSIONS.filter((s) => s.status === "ACTIVE" || s.status === "ENDING_SOON");
  const opts = [
    { id: "EXT-15", name: "Extension +15", dur: 15, price: 40_000 },
    { id: "EXT-30", name: "Extension +30", dur: 30, price: 70_000 },
    { id: "EXT-60", name: "Extension +60", dur: 60, price: 120_000 },
  ];
  return pool.slice(0, 7).map((s, i) => {
    const o = pick(r, opts);
    const conflict = i === 1 ? "ROOM_CONFLICT" : i === 4 ? "THERAPIST_CONFLICT" : "CLEAR";
    return {
      id: `EXR-${900 + i}`,
      sessionId: s.id,
      bookingCode: s.bookingCode,
      therapistName: s.therapistName,
      customerName: s.customerName,
      roomName: s.roomName,
      extensionId: o.id,
      extensionName: o.name,
      durationMin: o.dur,
      price: o.price,
      requestedAt: addMin(NOW_HHMM, -int(r, 1, 24)),
      status: i < 3 ? "PENDING" : i < 5 ? "APPROVED" : "REJECTED",
      conflictCheck: conflict as ExtensionRequest["conflictCheck"],
      reason:
        conflict === "ROOM_CONFLICT"
          ? "Booking berikutnya di room yang sama pukul 16:05"
          : conflict === "THERAPIST_CONFLICT"
            ? "Terapis punya booking berikutnya pukul 16:15"
            : undefined,
    };
  });
})();

// --------------------------------------------------------------- day helpers
export const DAY_RANGE = DAYS;

export function bookingKpi(outletId: string, date = TODAY) {
  const list = bookingsOf(outletId, date);
  const paid = list.filter((b) => b.status === "PAID");
  const revenue = paid.reduce((s, b) => s + b.price, 0);
  const noShow = list.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = list.filter((b) => b.status === "CANCELLED").length;
  return {
    total: list.length,
    paid: paid.length,
    revenue,
    noShow,
    cancelled,
    noShowRate: list.length ? (noShow / list.length) * 100 : 0,
    guests: new Set(paid.map((b) => b.customerId)).size,
    avgTicket: paid.length ? revenue / paid.length : 0,
    sessions: list.filter((b) => ["PAID", "COMPLETED", "IN_SESSION"].includes(b.status)).length,
  };
}

export function revenueSeries(outletId: string) {
  return DAYS.slice(0, 8).map((d) => {
    const k = bookingKpi(outletId, d);
    return { date: d, label: d.slice(8), revenue: k.revenue, guests: k.guests, sessions: k.sessions };
  });
}
