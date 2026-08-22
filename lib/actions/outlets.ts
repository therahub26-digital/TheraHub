"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// The one outlet-level write this file has for now: which alarm sound
// plays on the therapist session page when a session's time runs out
// (see 0015_alarm_sound.sql's header for the full feature background).
//
// The actual file upload happens client-side, straight from the browser
// to Supabase Storage (components/AlarmSoundSetting.tsx uses
// lib/supabase/client.ts + storage RLS to authorize it) — this action
// only persists the resulting public URL onto the outlet row afterward.
// RLS (outlets_update_manager / outlets_write_admin, already existing
// since 0002) is what actually enforces "only this outlet's manager, or
// admin/owner, can set this" — passing a foreign outletId here just gets
// silently refused by the database, not a UI-only check.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setAlarmSoundUrl(outletId: string, url: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase.from("outlets").update({ alarm_sound_url: url }).eq("id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan suara alarm — coba lagi." };

  revalidatePath("/manager/settings");
  revalidatePath("/therapist/session");
  return { ok: true };
}

// ---------------------------------------------------------------------
// "booking bisa diatur admin H minus berapa, maksimal 3 hari kedepan,
// defaultnya hanya bisa dipesan hari H" — user request 2026-08-22. See
// 0017_therapist_gallery_booking_window_schedule.sql's header for the
// full rationale and the check constraint enforcing 0-3 at the DB level
// (this validates the same range client-visibly first, so a manager gets
// a readable message instead of a raw constraint-violation error).
// ---------------------------------------------------------------------

export async function setBookingWindowDays(outletId: string, days: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  if (!Number.isInteger(days) || days < 0 || days > 3) {
    return { ok: false, error: "Jendela booking harus antara 0 (hari-H saja) dan 3 hari." };
  }

  const { error } = await supabase.from("outlets").update({ booking_window_days: days }).eq("id", outletId);
  if (error) return { ok: false, error: "Gagal menyimpan — coba lagi." };

  revalidatePath("/manager/settings");
  revalidatePath("/customer/book");
  return { ok: true };
}
