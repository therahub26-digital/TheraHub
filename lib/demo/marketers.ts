import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------
// Akun marketing demo per orang + log aktivitas (2026-10-24).
// Tabel: demo_marketers, demo_access_log (migrasi 0046) — hanya service
// role. Dipakai route /api/demo/* (deploy demo) dan aksi Super Admin
// (portal produksi → Akses Demo).
// ---------------------------------------------------------------------

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Password acak mudah dibaca (tanpa 0/O/1/l), 10 karakter. */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export type DemoMarketer = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string;
  last_login_at: string | null;
};

export async function findMarketerByEmail(email: string): Promise<DemoMarketer | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("demo_marketers").select("*").ilike("email", email.trim().replace(/[%_]/g, "")).maybeSingle();
  return (data as DemoMarketer | null) ?? null;
}

export function isMarketerUsable(m: DemoMarketer): boolean {
  return m.active && (!m.expires_at || new Date(m.expires_at).getTime() > Date.now());
}

export type DemoEvent = "LOGIN_OK" | "LOGIN_FAIL" | "LOGIN_BLOCKED" | "SWITCH" | "RESET" | "LOGOUT" | "DENIED";

/** Header Vercel → IP, kota, negara, perangkat. */
function requestInfo(headers: Headers) {
  const city = headers.get("x-vercel-ip-city");
  return {
    ip: (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || null,
    city: city ? decodeURIComponent(city) : null,
    country: headers.get("x-vercel-ip-country"),
    user_agent: (headers.get("user-agent") ?? "").slice(0, 300) || null,
  };
}

export async function logDemoEvent(
  headers: Headers,
  entry: { event: DemoEvent; email?: string | null; marketerId?: string | null; role?: string | null; detail?: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("demo_access_log").insert({
      event: entry.event,
      email: entry.email?.toLowerCase() ?? null,
      marketer_id: entry.marketerId ?? null,
      role: entry.role ?? null,
      detail: entry.detail ?? null,
      ...requestInfo(headers),
    });
  } catch (err) {
    // Log gagal tidak boleh membuat demo ikut gagal.
    console.error("[demo/log] gagal mencatat", err);
  }
}

/** Jumlah login gagal untuk email ATAU IP ini dalam 15 menit terakhir (penahan tebak password). */
export async function recentFailures(email: string, headers: Headers): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const ip = requestInfo(headers).ip;
  const [byEmail, byIp] = await Promise.all([
    admin.from("demo_access_log").select("id", { count: "exact", head: true })
      .eq("event", "LOGIN_FAIL").ilike("email", email.trim().replace(/[%_]/g, "")).gte("at", since),
    ip
      ? admin.from("demo_access_log").select("id", { count: "exact", head: true }).eq("event", "LOGIN_FAIL").eq("ip", ip).gte("at", since)
      : Promise.resolve({ count: 0 }),
  ]);
  return Math.max(byEmail.count ?? 0, byIp.count ?? 0);
}

/** Siapa pemilik token gerbang ini — nama untuk ditampilkan, id untuk log. */
export async function describeGateOwner(email: string): Promise<{ id: string | null; name: string }> {
  const master = (process.env.DEMO_MARKETING_EMAIL ?? "").trim().toLowerCase();
  if (email === master) return { id: null, name: "Akun utama" };
  const m = await findMarketerByEmail(email);
  return { id: m?.id ?? null, name: m?.name ?? email };
}
