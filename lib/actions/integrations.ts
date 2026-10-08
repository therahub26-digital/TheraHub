"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFonnte } from "@/lib/integrations/fonnte";
import { normalizePhone } from "@/lib/reminders";

// ---------------------------------------------------------------------
// Pengaturan integrasi WhatsApp (Fonnte) — Admin > Integrations.
// Spesifikasi: project doc "therahub-spec-reminder-wa".
//
// device_token adalah RAHASIA. Migrasi 0035 sengaja mencabut hak baca
// kolom itu dari klien, jadi ia hanya bisa ditulis lewat service role.
// Polanya "validasi dulu, baru eskalasi" (sama dengan lib/data/platform.ts):
// pemanggil diperiksa dengan klien biasa (login + peran admin/owner +
// tenant-nya), baru createAdminClient() dipakai untuk menyentuh token.
// Token tidak pernah dikembalikan ke browser; layar hanya menerima 4
// karakter terakhir.
// ---------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak ditemukan — silakan login ulang." };
  const { data: me } = await supabase.from("app_users").select("tenant_id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!me?.tenant_id) return { ok: false, error: "Akun ini tidak terhubung ke tenant manapun — hubungi admin." };
  if (me.role !== "admin" && me.role !== "owner") {
    return { ok: false, error: "Hanya Admin/Owner yang bisa mengubah integrasi." };
  }
  return { ok: true, tenantId: me.tenant_id as string };
}

export async function saveFonnteToken(rawToken: string): Promise<ActionResult> {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const token = rawToken.trim();
  if (token.length < 8 || /\s/.test(token)) {
    return { ok: false, error: "Token tidak valid — salin utuh dari dashboard Fonnte, tanpa spasi." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_integrations").upsert(
    {
      tenant_id: access.tenantId,
      provider: "fonnte",
      device_token: token,
      device_token_last4: token.slice(-4),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider" },
  );
  if (error) return { ok: false, error: "Gagal menyimpan token — pastikan migrasi 0035 sudah diterapkan." };
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function setReminderSwitch(which: "customer" | "therapist", on: boolean): Promise<ActionResult> {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const supabase = await createClient();
  const column = which === "customer" ? "reminder_customer" : "reminder_therapist";

  // Menyalakan tanpa token = saklar yang tampak hidup tetapi tidak mengirim apa pun.
  if (on) {
    const { data: row } = await supabase
      .from("tenant_integrations")
      .select("device_token_last4")
      .eq("tenant_id", access.tenantId)
      .eq("provider", "fonnte")
      .maybeSingle();
    if (!row?.device_token_last4) return { ok: false, error: "Isi token Fonnte dulu sebelum menyalakan reminder." };
  }

  const { data, error } = await supabase
    .from("tenant_integrations")
    .update({ [column]: on, updated_at: new Date().toISOString() })
    .eq("tenant_id", access.tenantId)
    .eq("provider", "fonnte")
    .select("tenant_id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Gagal menyimpan — pastikan akun Anda punya hak ubah integrasi." };
  }
  revalidatePath("/admin/integrations");
  return { ok: true };
}

/** Pesan uji ke nomor yang diketik admin sendiri — satu-satunya cara memastikan token benar. */
export async function sendTestMessage(rawPhone: string): Promise<ActionResult> {
  const access = await requireAdmin();
  if (!access.ok) return access;
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Nomor tidak valid — contoh: 0812 3456 7890." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("tenant_integrations")
    .select("device_token")
    .eq("tenant_id", access.tenantId)
    .eq("provider", "fonnte")
    .maybeSingle();
  if (!row?.device_token) return { ok: false, error: "Isi token Fonnte dulu." };

  const r = await sendFonnte({
    token: row.device_token as string,
    target: phone,
    message: "Pesan uji dari TheraHub: koneksi WhatsApp berhasil. Pesan ini tidak perlu dibalas.",
  });
  return r.ok ? { ok: true } : { ok: false, error: `Fonnte: ${r.error}` };
}
