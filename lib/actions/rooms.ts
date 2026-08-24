"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Server Actions for room maintenance status.
//
// Added as part of the Bug 8 fix (Fase 16/17 test cycle, 2026-08):
// /manager/rooms was reading 100% mock data (lib/mock) and every button
// on the page (Room Baru, Edit, Maintenance/Aktifkan) was a plain
// <button> with no handler at all. This migrates the page to real data
// (lib/data/rooms.ts, already used elsewhere for booking/availability)
// and gives the "Maintenance" / "Aktifkan" toggle a real write path —
// the highest-value, lowest-risk action to wire first (a single status
// flip on an existing row, no new form/modal UI needed).
//
// 2026-08-24 (backlog 15): "Room Baru" (create) and "Edit" are no longer
// dead — createRoom()/updateRoom() below back a real inline form
// (components/RoomEditor.tsx), built on the same dropdown-panel pattern
// as StaffEditor/InventoryEditor rather than waiting on a modal
// component this codebase still does not have.
//
// There is deliberately NO deleteRoom(). A room that has ever been used
// is referenced by bookings and sessions; deleting it would break paid,
// historical records the same way deleting a sold product would (see
// lib/actions/inventory.ts, which refuses deletes for the same reason).
// Retiring a room is `status = INACTIVE` instead — it disappears from
// check-in room pickers while its history stays intact and readable.
//
// Runs as the signed-in staff user (createClient(), never service-role),
// so `rooms_write` RLS (0002_rls_policies.sql — admin/owner tenant-wide,
// manager only their own outlet) is still the real enforcement, not just
// this action refusing to call it.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sesi tidak ditemukan — silakan login ulang." as const };
  return { supabase, error: null };
}

function revalidateRooms() {
  revalidatePath("/manager/rooms");
  revalidatePath("/manager");
  revalidatePath("/admin/rooms");
}

/**
 * Flip a room between ACTIVE and MAINTENANCE. RLS (`rooms_write`) is the
 * real gate on who can do this — a manager can only touch rooms in their
 * own outlet, even if a room id from another outlet were ever passed in.
 */
export async function setRoomMaintenance(roomId: string, underMaintenance: boolean): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const { data: room, error: readErr } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("id", roomId)
    .maybeSingle();
  if (readErr || !room) return { ok: false, error: "Room tidak ditemukan." };

  // INACTIVE rooms (retired) are left alone — "Aktifkan" here is only
  // meant to bring a MAINTENANCE room back to ACTIVE, not to resurrect a
  // decommissioned one, which would need a different, more deliberate
  // action than a dashboard toggle.
  if (!underMaintenance && room.status !== "MAINTENANCE") {
    return { ok: false, error: `Room ini berstatus ${room.status}, bukan Maintenance — tidak ada yang perlu diaktifkan.` };
  }

  const nextStatus = underMaintenance ? "MAINTENANCE" : "ACTIVE";
  const { error: writeErr } = await supabase.from("rooms").update({ status: nextStatus }).eq("id", roomId);
  if (writeErr) return { ok: false, error: writeErr.message };

  revalidateRooms();
  return { ok: true };
}

// ================================================================ CREATE / EDIT

/** Mirrors lib/types.ts Room["type"]; kept here so the action validates its own input. */
const ROOM_TYPES = ["Massage", "Couple", "Reflexology Chair", "VIP", "Wet Room"] as const;
type RoomType = (typeof ROOM_TYPES)[number];

export type RoomInput = {
  outletId: string;
  code: string;
  name: string;
  type: RoomType;
  capacity: number;
  cleanupBuffer: number;
  supportedServices: string[];
};

/**
 * Shared validation for create and update.
 *
 * `code` is normalised to upper-case and trimmed because it is what
 * staff type when picking a room at check-in — "vip-1" and "VIP-1"
 * being two different rooms would be a data-entry trap, not a feature.
 */
function validate(input: Omit<RoomInput, "outletId">): { ok: true; clean: Omit<RoomInput, "outletId"> } | { ok: false; error: string } {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();

  if (!code) return { ok: false, error: "Kode room wajib diisi (mis. VIP-1)." };
  if (!name) return { ok: false, error: "Nama room wajib diisi." };
  if (!ROOM_TYPES.includes(input.type)) return { ok: false, error: "Tipe room tidak dikenal." };
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    return { ok: false, error: "Kapasitas minimal 1 orang." };
  }
  if (!Number.isInteger(input.cleanupBuffer) || input.cleanupBuffer < 0) {
    return { ok: false, error: "Buffer bersih-bersih tidak boleh negatif." };
  }

  return {
    ok: true,
    clean: {
      code,
      name,
      type: input.type,
      capacity: input.capacity,
      cleanupBuffer: input.cleanupBuffer,
      supportedServices: input.supportedServices.map((x) => x.trim()).filter(Boolean),
    },
  };
}

/**
 * Refuse a duplicate room code within the same outlet before hitting the
 * database, so the manager gets "Kode VIP-1 sudah dipakai" instead of a
 * raw unique-constraint error — or, worse, two rooms sharing a code that
 * the check-in dropdown then cannot tell apart.
 */
async function codeTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outletId: string,
  code: string,
  exceptRoomId?: string
): Promise<boolean> {
  let q = supabase.from("rooms").select("id").eq("outlet_id", outletId).eq("code", code);
  if (exceptRoomId) q = q.neq("id", exceptRoomId);
  const { data } = await q;
  return (data ?? []).length > 0;
}

export async function createRoom(input: RoomInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const v = validate(input);
  if (!v.ok) return { ok: false, error: v.error };

  if (await codeTaken(supabase, input.outletId, v.clean.code)) {
    return { ok: false, error: `Kode ${v.clean.code} sudah dipakai room lain di outlet ini.` };
  }

  const { error: writeErr } = await supabase.from("rooms").insert({
    outlet_id: input.outletId,
    code: v.clean.code,
    name: v.clean.name,
    type: v.clean.type,
    capacity: v.clean.capacity,
    cleanup_buffer_min: v.clean.cleanupBuffer,
    supported_services: v.clean.supportedServices,
    status: "ACTIVE",
  });
  // 42501 is Postgres' RLS refusal. Worth naming explicitly: the generic
  // message would send a manager hunting for a typo when the real answer
  // is that they are not this outlet's manager.
  if (writeErr) {
    if (writeErr.code === "42501") {
      return { ok: false, error: "Role kamu belum diizinkan menambah room di outlet ini. Hubungi admin/owner." };
    }
    return { ok: false, error: "Gagal menyimpan room baru — coba lagi." };
  }

  revalidateRooms();
  return { ok: true };
}

export async function updateRoom(roomId: string, input: RoomInput): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  const v = validate(input);
  if (!v.ok) return { ok: false, error: v.error };

  if (await codeTaken(supabase, input.outletId, v.clean.code, roomId)) {
    return { ok: false, error: `Kode ${v.clean.code} sudah dipakai room lain di outlet ini.` };
  }

  // outlet_id is deliberately NOT updatable here. Moving a room between
  // outlets would strand every booking and session already pointing at
  // it in the old outlet's history; that is a data migration, not an
  // edit-form checkbox.
  const { error: writeErr } = await supabase
    .from("rooms")
    .update({
      code: v.clean.code,
      name: v.clean.name,
      type: v.clean.type,
      capacity: v.clean.capacity,
      cleanup_buffer_min: v.clean.cleanupBuffer,
      supported_services: v.clean.supportedServices,
    })
    .eq("id", roomId);
  if (writeErr) {
    if (writeErr.code === "42501") {
      return { ok: false, error: "Role kamu belum diizinkan mengubah room di outlet ini. Hubungi admin/owner." };
    }
    return { ok: false, error: "Gagal menyimpan perubahan room — coba lagi." };
  }

  revalidateRooms();
  return { ok: true };
}

/**
 * Retire a room (INACTIVE) or bring a retired one back (ACTIVE).
 *
 * This is the deliberate stand-in for delete — see this file's header.
 * A room in use right now is refused rather than yanked out from under
 * a therapist and guest mid-treatment.
 */
export async function setRoomRetired(roomId: string, retired: boolean): Promise<ActionResult> {
  const { supabase, error } = await requireStaff();
  if (error) return { ok: false, error };

  if (retired) {
    // "ACTIVE" is the only running state actually stored on a session
    // row; ENDING_SOON is derived on read (no-cron convention), so it
    // would never match a filter here.
    const { data: liveSessions } = await supabase
      .from("sessions")
      .select("id")
      .eq("room_id", roomId)
      .eq("status", "ACTIVE")
      .limit(1);
    if ((liveSessions ?? []).length > 0) {
      return { ok: false, error: "Room ini sedang dipakai sesi berjalan — selesaikan sesinya dulu." };
    }
  }

  const { error: writeErr } = await supabase
    .from("rooms")
    .update({ status: retired ? "INACTIVE" : "ACTIVE" })
    .eq("id", roomId);
  if (writeErr) return { ok: false, error: "Gagal mengubah status room — coba lagi." };

  revalidateRooms();
  return { ok: true };
}
