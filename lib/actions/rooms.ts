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
// "Room Baru" (create) and "Edit" (rename/recapacity/etc.) still need an
// actual form UI (there is no modal/dialog component anywhere in this
// codebase yet to build one on top of) — they're intentionally left as
// disabled buttons with an explanatory tooltip rather than dead-looking
// active ones, so the UI stops lying about what it can do. See the
// TheraHub progress doc (Bug 8) for the follow-up scope.
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
