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
