import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Read side of room_alerts (0014_room_alerts.sql) — OPEN "call for
// help" alerts a manager/kasir needs to see. Manual multi-query lookups
// rather than a nested PostgREST select, matching the existing
// lib/data/bookings.ts convention in this codebase.
//
// No mock fallback here on purpose: an alert banner showing FAKE
// emergencies would be actively dangerous (staff could learn to ignore
// it, or worse, chase a guest problem that doesn't exist). If there's no
// signed-in session, this returns empty rather than inventing data —
// same rule lib/data/sessions.ts already applies to extension requests.
// ---------------------------------------------------------------------

export type OpenRoomAlert = {
  id: string;
  roomId: string;
  roomName: string;
  customerName: string;
  therapistName: string;
  createdAt: string;
};

export async function getOpenRoomAlerts(outletId: string): Promise<OpenRoomAlert[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: alerts, error } = await supabase
    .from("room_alerts")
    .select("id, room_id, booking_id, therapist_id, created_at")
    .eq("outlet_id", outletId)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });
  if (error || !alerts || alerts.length === 0) return [];

  const roomIds = [...new Set(alerts.map((a) => a.room_id))];
  const bookingIds = [...new Set(alerts.map((a) => a.booking_id))];
  const therapistIds = [...new Set(alerts.map((a) => a.therapist_id))];

  const [{ data: rooms }, { data: bookings }, { data: employees }] = await Promise.all([
    supabase.from("rooms").select("id, name").in("id", roomIds),
    supabase.from("bookings").select("id, customer_id").in("id", bookingIds),
    supabase.from("employees").select("id, name").in("id", therapistIds),
  ]);

  const customerIds = [...new Set((bookings ?? []).map((b) => b.customer_id))];
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name").in("id", customerIds)
    : { data: [] as { id: string; name: string }[] };

  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b.customer_id]));
  const customerMap = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const therapistMap = new Map((employees ?? []).map((e) => [e.id, e.name]));

  return alerts.map((a) => ({
    id: a.id,
    roomId: a.room_id,
    roomName: roomMap.get(a.room_id) ?? "Room?",
    customerName: customerMap.get(bookingMap.get(a.booking_id) ?? "") ?? "Tamu?",
    therapistName: therapistMap.get(a.therapist_id) ?? "Terapis?",
    createdAt: a.created_at,
  }));
}
