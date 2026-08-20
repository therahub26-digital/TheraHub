// ============================================================
// Formatting helpers — Indonesian locale, deterministic output
// ============================================================

export function rp(n: number, opts: { short?: boolean; sign?: boolean } = {}): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  let out: string;

  if (opts.short) {
    if (abs >= 1_000_000_000) out = `Rp${trim(abs / 1_000_000_000)}M`;
    else if (abs >= 1_000_000) out = `Rp${trim(abs / 1_000_000)}jt`;
    else if (abs >= 1_000) out = `Rp${trim(abs / 1_000)}rb`;
    else out = `Rp${abs}`;
  } else {
    out = "Rp" + group(Math.round(abs));
  }

  if (neg) return "-" + out;
  if (opts.sign && n > 0) return "+" + out;
  return out;
}

function trim(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r).replace(".", ",");
}

export function group(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function num(n: number, decimals = 0): string {
  const fixed = n.toFixed(decimals);
  const [i, d] = fixed.split(".");
  const gi = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d ? `${gi},${d}` : gi;
}

export function pct(n: number, decimals = 1): string {
  return `${num(n, decimals)}%`;
}

export function minutesToHm(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}j`;
  return `${h}j ${mm}m`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Parse an ISO-ish "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" without timezone drift. */
export function parseLocal(s: string): Date {
  const [datePart, timePart] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!timePart) return new Date(y, m - 1, d);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function fmtDate(s: string): string {
  const d = parseLocal(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateShort(s: string): string {
  const d = parseLocal(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateLong(s: string): string {
  const d = parseLocal(s);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDayShort(s: string): string {
  const d = parseLocal(s);
  return DAYS_SHORT[d.getDay()];
}

export function fmtTime(s: string): string {
  if (!s) return "—";
  const t = s.includes("T") ? s.split("T")[1] : s;
  return t.slice(0, 5);
}

export function fmtDateTime(s: string): string {
  return `${fmtDateShort(s)} · ${fmtTime(s)}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TONES: Record<string, string> = {
  teal: "linear-gradient(135deg,#2dd4bf,#0d9488)",
  emerald: "linear-gradient(135deg,#34d399,#059669)",
  gold: "linear-gradient(135deg,#fbbf24,#d97706)",
  violet: "linear-gradient(135deg,#c4b5fd,#7c3aed)",
  rose: "linear-gradient(135deg,#fda4af,#e11d48)",
  sky: "linear-gradient(135deg,#7dd3fc,#0284c7)",
  amber: "linear-gradient(135deg,#fcd34d,#b45309)",
  lime: "linear-gradient(135deg,#bef264,#4d7c0f)",
  indigo: "linear-gradient(135deg,#a5b4fc,#4338ca)",
  cyan: "linear-gradient(135deg,#67e8f9,#0e7490)",
};

export function tone(key: string): string {
  return TONES[key] ?? TONES.teal;
}

export const TONE_KEYS = Object.keys(TONES);

export function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONE_KEYS[h % TONE_KEYS.length];
}

/** Add minutes to a "HH:mm" string. */
export function addMin(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMin(total: number): string {
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
