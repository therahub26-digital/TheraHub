import { getPlatformAccess } from "@/lib/data/platform";

// Data halaman Super Admin → Akses Demo (2026-10-24). Service role, hanya
// setelah peran super-admin terverifikasi.

export type DemoMarketerRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  logins30d: number;
  ips7d: number;
  cities7d: string[];
  fails24h: number;
  lastActivity: string | null;
  warnings: string[];
};

export type DemoLogRow = {
  id: number;
  at: string;
  who: string;
  email: string | null;
  event: string;
  role: string | null;
  ip: string | null;
  place: string;
  device: string;
  detail: string | null;
};

type LogRaw = {
  id: number; at: string; marketer_id: string | null; email: string | null; event: string; role: string | null;
  ip: string | null; city: string | null; country: string | null; user_agent: string | null; detail: string | null;
};

function device(ua: string | null): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Lainnya";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser lain";
  return `${browser} · ${os}`;
}

export async function getDemoAccessOverview(filterMarketerId?: string): Promise<{
  marketers: DemoMarketerRow[];
  logs: DemoLogRow[];
  masterEmail: string;
  stats: { logins7d: number; fails7d: number; activeAccounts: number; uniqueIps7d: number };
} | null> {
  const admin = await getPlatformAccess();
  if (!admin) return null;

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: marketers }, { data: logs30 }] = await Promise.all([
    admin.from("demo_marketers").select("id, name, email, active, expires_at, note, created_at, last_login_at").order("created_at", { ascending: false }),
    admin.from("demo_access_log").select("*").gte("at", since30).order("at", { ascending: false }).limit(5000),
  ]);
  const log = (logs30 ?? []) as LogRaw[];
  const masterEmail = (process.env.DEMO_MARKETING_EMAIL ?? "").trim().toLowerCase();
  const now = Date.now();
  const within = (iso: string, days: number) => now - new Date(iso).getTime() <= days * 864e5;

  const nameById = new Map((marketers ?? []).map((m) => [m.id as string, m.name as string]));
  const rows: DemoMarketerRow[] = (marketers ?? []).map((m) => {
    const mine = log.filter((l) => l.marketer_id === m.id || (!l.marketer_id && l.email === String(m.email).toLowerCase()));
    const week = mine.filter((l) => within(l.at, 7));
    const ips = new Set(week.filter((l) => l.event === "LOGIN_OK" && l.ip).map((l) => l.ip!));
    const cities = [...new Set(week.filter((l) => l.event === "LOGIN_OK" && l.city).map((l) => l.city!))];
    const fails24h = mine.filter((l) => (l.event === "LOGIN_FAIL" || l.event === "LOGIN_BLOCKED") && within(l.at, 1)).length;
    const warnings: string[] = [];
    if (ips.size >= 4) warnings.push(`Dipakai dari ${ips.size} alamat IP berbeda dalam 7 hari`);
    if (cities.length >= 3) warnings.push(`Login dari ${cities.length} kota: ${cities.join(", ")}`);
    if (fails24h >= 3) warnings.push(`${fails24h} kali gagal login dalam 24 jam`);
    const night = week.filter((l) => l.event === "LOGIN_OK" && (() => { const h = new Date(new Date(l.at).getTime() + 7 * 3600e3).getUTCHours(); return h < 6 || h >= 23; })()).length;
    if (night) warnings.push(`${night} login di luar jam wajar (23.00–06.00)`);
    if (mine.some((l) => l.event === "DENIED" && within(l.at, 7))) warnings.push("Mencoba masuk setelah akses dicabut/kedaluwarsa");
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      active: m.active,
      expiresAt: m.expires_at,
      note: m.note,
      createdAt: m.created_at,
      lastLoginAt: m.last_login_at,
      logins30d: mine.filter((l) => l.event === "LOGIN_OK").length,
      ips7d: ips.size,
      cities7d: cities,
      fails24h,
      lastActivity: mine[0]?.at ?? null,
      warnings,
    };
  });

  const week = log.filter((l) => within(l.at, 7));
  const logs = log
    .filter((l) => !filterMarketerId || l.marketer_id === filterMarketerId)
    .slice(0, 300)
    .map((l): DemoLogRow => ({
      id: l.id,
      at: l.at,
      who: l.marketer_id ? nameById.get(l.marketer_id) ?? "(akun dihapus)" : l.email && l.email === masterEmail ? "Akun utama" : "Tidak dikenal",
      email: l.email,
      event: l.event,
      role: l.role,
      ip: l.ip,
      place: [l.city, l.country].filter(Boolean).join(", ") || "—",
      device: device(l.user_agent),
      detail: l.detail,
    }));

  return {
    marketers: rows,
    logs,
    masterEmail,
    stats: {
      logins7d: week.filter((l) => l.event === "LOGIN_OK").length,
      fails7d: week.filter((l) => l.event === "LOGIN_FAIL" || l.event === "LOGIN_BLOCKED").length,
      activeAccounts: rows.filter((r) => r.active && (!r.expiresAt || new Date(r.expiresAt).getTime() > now)).length,
      uniqueIps7d: new Set(week.filter((l) => l.event === "LOGIN_OK" && l.ip).map((l) => l.ip)).size,
    },
  };
}
