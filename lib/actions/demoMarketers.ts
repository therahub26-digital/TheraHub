"use server";

import { revalidatePath } from "next/cache";
import { getPlatformAccess } from "@/lib/data/platform";
import { generatePassword, hashPassword } from "@/lib/demo/marketers";

// ---------------------------------------------------------------------
// Kelola akun marketing demo (Super Admin → Akses Demo, 2026-10-24).
// Setiap aksi memverifikasi peran super-admin lewat getPlatformAccess()
// (validasi sesi dulu, baru eskalasi ke service role). Password dibuat
// server, ditampilkan SEKALI ke admin, yang tersimpan hanya hash scrypt.
// ---------------------------------------------------------------------

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function done() {
  revalidatePath("/super-admin/demo-akses");
}

export async function createDemoMarketer(input: { name: string; email: string; expiresAt: string | null; note: string }): Promise<Result<{ password: string }>> {
  const admin = await getPlatformAccess();
  if (!admin) return { ok: false, error: "Hanya Super Admin." };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Nama wajib diisi." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Format email tidak valid." };
  if (email === (process.env.DEMO_MARKETING_EMAIL ?? "").trim().toLowerCase()) return { ok: false, error: "Email ini dipakai akun utama." };

  const password = generatePassword();
  const { error } = await admin.from("demo_marketers").insert({
    name,
    email,
    password_hash: await hashPassword(password),
    expires_at: input.expiresAt ? `${input.expiresAt}T23:59:59+07:00` : null,
    note: input.note.trim() || null,
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Email ini sudah terdaftar." : `Gagal menyimpan: ${error.message}` };
  }
  done();
  return { ok: true, password };
}

export async function setDemoMarketerActive(id: string, active: boolean): Promise<Result> {
  const admin = await getPlatformAccess();
  if (!admin) return { ok: false, error: "Hanya Super Admin." };
  const { error } = await admin.from("demo_marketers").update({ active }).eq("id", id);
  if (error) return { ok: false, error: "Gagal mengubah status." };
  done();
  return { ok: true };
}

export async function resetDemoMarketerPassword(id: string): Promise<Result<{ password: string }>> {
  const admin = await getPlatformAccess();
  if (!admin) return { ok: false, error: "Hanya Super Admin." };
  const password = generatePassword();
  const { error } = await admin.from("demo_marketers").update({ password_hash: await hashPassword(password) }).eq("id", id);
  if (error) return { ok: false, error: "Gagal mereset password." };
  done();
  return { ok: true, password };
}

export async function setDemoMarketerExpiry(id: string, expiresAt: string | null): Promise<Result> {
  const admin = await getPlatformAccess();
  if (!admin) return { ok: false, error: "Hanya Super Admin." };
  const { error } = await admin
    .from("demo_marketers")
    .update({ expires_at: expiresAt ? `${expiresAt}T23:59:59+07:00` : null })
    .eq("id", id);
  if (error) return { ok: false, error: "Gagal menyimpan masa berlaku." };
  done();
  return { ok: true };
}
