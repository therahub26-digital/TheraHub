import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ROOMS as MOCK_ROOMS } from "@/lib/mock/org";
import type { Room } from "@/lib/types";

// ---------------------------------------------------------------------
// Dual-mode data-access layer for "rooms" — same pattern as
// lib/data/outlets.ts / employees.ts. Needed by the booking-creation
// flow (lib/actions/bookings.ts) to offer a real room picker and to
// conflict-check room double-booking, not just therapists.
// ---------------------------------------------------------------------

type RoomRow = {
  id: string;
  outlet_id: string;
  code: string;
  name: string;
  type: string;
  capacity: number;
  supported_services: string[] | null;
  status: string;
  cleanup_buffer_min: number;
};

function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    outletId: row.outlet_id,
    code: row.code,
    name: row.name,
    type: row.type as Room["type"],
    capacity: row.capacity,
    supportedServices: row.supported_services ?? [],
    status: row.status as Room["status"],
    cleanupBuffer: row.cleanup_buffer_min,
  };
}

async function fetchLiveRooms(): Promise<Room[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("rooms").select("*").order("code");
  if (error || !data || data.length === 0) return null;
  return (data as RoomRow[]).map(mapRoom);
}

const loadRoomsData = cache(async () => {
  const live = await fetchLiveRooms();
  if (live) return { rooms: live, live: true };
  return { rooms: MOCK_ROOMS, live: false };
});

export async function getRooms(): Promise<Room[]> {
  return (await loadRoomsData()).rooms;
}

export async function getRoomsForOutlet(outletId: string): Promise<Room[]> {
  return (await loadRoomsData()).rooms.filter((r) => r.outletId === outletId);
}

export async function isLiveRoomsData(): Promise<boolean> {
  return (await loadRoomsData()).live;
}

/**
 * Rooms actually free to walk a guest into RIGHT NOW.
 *
 * "Free" is derived, not stored: a room has no live occupancy column,
 * because occupancy changes by the minute and a stored flag would be
 * stale the moment two staff act at once. This asks the same question
 * check-in itself will ask: which of this outlet's ACTIVE (non
 * maintenance) rooms is NOT currently the room_id on a booking that has
 * arrived but not yet finished (CHECKED_IN or IN_SESSION)?
 *
 * Deliberately does not consider future bookings — a room reserved by a
 * BOOKED slot an hour from now is still free THIS MINUTE, and that is
 * exactly the flexibility this design exists for (see the header note
 * in lib/actions/bookings.ts on why rooms stopped being booked ahead).
 */
export async function getAvailableRoomsForOutlet(outletId: string): Promise<Room[]> {
  const rooms = (await getRoomsForOutlet(outletId)).filter((r) => r.status === "ACTIVE");
  if (!rooms.length) return rooms;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return rooms; // demo/mock viewer — nothing to hold a room, so all "ACTIVE" rooms count as free

  const { data: heldRows } = await supabase
    .from("bookings")
    .select("room_id")
    .eq("outlet_id", outletId)
    .in("status", ["CHECKED_IN", "IN_SESSION"])
    .not("room_id", "is", null);

  const held = new Set((heldRows ?? []).map((r) => r.room_id as string));
  return rooms.filter((r) => !held.has(r.id));
}
