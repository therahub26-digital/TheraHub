"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------
// Customer self-service writes.
//
// Added 2026-08-24. app/customer/profile/page.tsx carried a note saying
// `marketing_consent` was the one setting on that screen with a real
// column behind it, and that the only thing stopping it from being
// editable was the shared <Switch> having no onChange — so it was shown
// read-only rather than faked. That blocker is gone (see components/
// ui.tsx), so this is the save path it was waiting for.
//
// The other three toggles on that page (push notifications, booking
// reminders, email newsletter) still have no columns and stay read-only.
// Wiring them means a migration plus an actual delivery channel to
// honour the preference — promising a guest they can turn off a
// notification the app cannot send yet would be worse than saying it is
// not available.
//
// RLS (`customers_update_self`, 0002) is the real gate: a customer may
// only update the row whose auth_user_id is their own.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setMarketingConsent(consent: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };

  // Scoped by auth_user_id rather than taking an id from the client:
  // the RLS policy would refuse a foreign row anyway, but not accepting
  // the id in the first place means there is no request to refuse.
  const { error } = await supabase
    .from("customers")
    .update({ marketing_consent: consent })
    .eq("auth_user_id", user.id);
  if (error) return { ok: false, error: "Gagal menyimpan preferensi — coba lagi." };

  revalidatePath("/customer/profile");
  return { ok: true };
}
