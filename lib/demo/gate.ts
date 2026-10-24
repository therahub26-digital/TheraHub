// ---------------------------------------------------------------------
// Token gerbang marketing — HMAC-SHA256 via Web Crypto, sengaja tanpa
// modul "crypto" Node supaya bisa dipakai di middleware (Edge runtime)
// maupun route handler (Node). Isi token: "<exp>.<email>.<sig>".
// Tidak ada data sensitif di dalamnya; tanda tangan mencegah pemalsuan.
// ---------------------------------------------------------------------

import { DEMO_GATE_TTL_SEC } from "./config";

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signGate(email: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const secret = process.env.DEMO_GATE_SECRET;
  if (!secret) return null;
  const exp = nowSec + DEMO_GATE_TTL_SEC;
  const body = `${exp}.${b64url(enc.encode(email).buffer as ArrayBuffer)}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** true kalau token sah & belum kedaluwarsa. Secret kosong = selalu false (tertutup). */
export async function verifyGate(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.DEMO_GATE_SECRET;
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, em, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, await hmac(secret, `${exp}.${em}`));
}

/** Bandingkan kredensial marketing dengan env, waktu-konstan. */
export function checkMarketingCredentials(email: string, password: string): boolean {
  const wantEmail = (process.env.DEMO_MARKETING_EMAIL ?? "").trim().toLowerCase();
  const wantPw = process.env.DEMO_MARKETING_PASSWORD ?? "";
  if (!wantEmail || !wantPw) return false;
  const okEmail = safeEqual(email.trim().toLowerCase(), wantEmail);
  const okPw = safeEqual(password, wantPw);
  return okEmail && okPw;
}

function b64urlDecode(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * Token sah → email pemiliknya (huruf kecil); selain itu null. Dipakai untuk
 * tahu SIAPA yang sedang memakai demo (akun marketing per orang, 2026-10-24).
 */
export async function readGate(token: string | undefined | null): Promise<{ email: string } | null> {
  if (!(await verifyGate(token))) return null;
  try {
    return { email: b64urlDecode(token!.split(".")[1]).toLowerCase() };
  } catch {
    return null;
  }
}

/** Email akun utama dari env (akun Adjie) — selalu aktif, tidak ada di tabel. */
export function isMasterDemoEmail(email: string): boolean {
  const master = (process.env.DEMO_MARKETING_EMAIL ?? "").trim().toLowerCase();
  return !!master && email.trim().toLowerCase() === master;
}

/**
 * Apakah akun marketing ini masih boleh memakai demo (aktif & belum
 * kedaluwarsa)? Dipanggil middleware supaya akun yang DICABUT langsung
 * tertutup, bukan menunggu token 12 jam habis. Fetch REST biasa (bisa di
 * Edge runtime) dengan service role; gagal menghubungi database = ditolak.
 */
export async function isDemoAccessActive(email: string): Promise<boolean> {
  if (isMasterDemoEmail(email)) return true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const params = new URLSearchParams({
    select: "id",
    email: `ilike.${email.replace(/[%_,()*]/g, "")}`,
    active: "is.true",
    or: `(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`,
    limit: "1",
  });
  try {
    const res = await fetch(`${url}/rest/v1/demo_marketers?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}
