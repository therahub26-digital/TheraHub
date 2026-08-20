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
