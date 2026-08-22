"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Write half of the daily off/leave check — "setiap hari tugas manager
// atau kasir, untuk cek list therapis yang off atau libur", user request
// 2026-08-22. See lib/data/scheduleExceptions.ts and
// 0017_therapist_gallery_booking_window_schedule.sql for the read layer
// and schema/RLS. `employees_write_staff` policy on this table uses
// `_is_outlet_staff(outlet_id)`, which explicitly covers BOTH manager
// and kasir at that outlet (not just manager) — matching the user's own
// framing ("manager atau kasir").
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export type SetScheduleExceptionInput = {
  employeeId: string;
  outletId: string;
  date: string; // "YYYY-MM-DD"
  type: "OFF" | "LEAVE";
  note?: string;
};

export async function setScheduleException(input: SetScheduleExceptionInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase
    .from("employee_schedule_exceptions")
    .upsert(
      {
        employee_id: input.employeeId,
        outlet_id: input.outletId,
        date: input.date,
        type: input.type,
        note: input.note || null,
      },
      { onConflict: "employee_id,date" }
    );

  if (error) return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak staff outlet ini." };

  revalidatePath("/manager/schedule-check");
  revalidatePath("/kasir/schedule-check");
  return { ok: true };
}

export async function clearScheduleException(employeeId: string, date: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  const { error } = await supabase
    .from("employee_schedule_exceptions")
    .delete()
    .eq("employee_id", employeeId)
    .eq("date", date);

  if (error) return { ok: false, error: "Gagal menghapus — coba lagi." };

  revalidatePath("/manager/schedule-check");
  revalidatePath("/kasir/schedule-check");
  return { ok: true };
}
