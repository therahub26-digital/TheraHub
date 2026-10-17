// ---------------------------------------------------------------------
// Periode laporan keuangan — fungsi murni, tanpa DB, tanpa jam host.
//
// Permintaan Adjie 2026-10-15: "Laporan keuangan bisa cek per hari /
// minggu / bulan, grafik, dan tampilan pemilik lintas cabang". Dipakai
// /manager/finance (satu outlet) dan /owner/revenue + /owner (lintas
// cabang) supaya ketiganya memotong waktu dengan cara yang PERSIS sama.
//
// Semua tanggal "YYYY-MM-DD" kalender WIB (frame wallclock, lihat
// lib/wallclock.ts). Rentang selalu setengah-terbuka [start, endExcl).
// Minggu = Senin–Minggu (kebiasaan kerja Indonesia, ISO-8601).
// ---------------------------------------------------------------------

export type FinanceGranularity = "day" | "week" | "month";

export const GRANULARITY_LABEL: Record<FinanceGranularity, string> = {
  day: "Harian",
  week: "Mingguan",
  month: "Bulanan",
};

/** Berapa ember yang digambar di grafik tren untuk tiap mode. */
export const TREND_BUCKETS: Record<FinanceGranularity, number> = { day: 14, week: 12, month: 12 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const p2 = (n: number) => String(n).padStart(2, "0");

function toUtc(date: string): Date {
  return new Date(date + "T00:00:00Z");
}
function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
function addDaysIso(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}
function addMonthsIso(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${p2((total % 12) + 1)}-01`;
}

export function isGranularity(v: unknown): v is FinanceGranularity {
  return v === "day" || v === "week" || v === "month";
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return fromUtc(toUtc(v)) === v; // menolak 2026-02-30 dsb.
}

/** Awal ember yang memuat `date`: hari itu / Senin minggu itu / tanggal 1 bulan itu. */
export function bucketStart(gran: FinanceGranularity, date: string): string {
  if (gran === "day") return date;
  if (gran === "month") return `${date.slice(0, 7)}-01`;
  const dow = toUtc(date).getUTCDay(); // 0 = Minggu
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysIso(date, -back);
}

/** Geser awal ember sebanyak n ember (negatif = mundur). */
export function shiftBucket(gran: FinanceGranularity, start: string, n: number): string {
  if (gran === "day") return addDaysIso(start, n);
  if (gran === "week") return addDaysIso(start, 7 * n);
  return addMonthsIso(start, n);
}

export type FinanceBucket = {
  /** Awal ember, juga kunci unik. */
  key: string;
  start: string;
  endExcl: string;
  /** Label pendek untuk sumbu grafik. */
  short: string;
  /** Label lengkap untuk judul & tabel. */
  long: string;
};

export function makeBucket(gran: FinanceGranularity, anyDateInside: string): FinanceBucket {
  const start = bucketStart(gran, anyDateInside);
  const endExcl = shiftBucket(gran, start, 1);
  const d = toUtc(start);
  const day = d.getUTCDate();
  const mon = d.getUTCMonth();
  const yr = d.getUTCFullYear();
  if (gran === "day") {
    return {
      key: start, start, endExcl,
      short: `${day} ${MONTHS[mon]}`,
      long: `${DAYS_SHORT[d.getUTCDay()]}, ${day} ${MONTHS_LONG[mon]} ${yr}`,
    };
  }
  if (gran === "month") {
    return { key: start, start, endExcl, short: `${MONTHS[mon]} ${String(yr).slice(2)}`, long: `${MONTHS_LONG[mon]} ${yr}` };
  }
  const last = toUtc(addDaysIso(start, 6));
  const lDay = last.getUTCDate();
  const lMon = last.getUTCMonth();
  const lYr = last.getUTCFullYear();
  const long =
    lYr !== yr
      ? `${day} ${MONTHS[mon]} ${yr} – ${lDay} ${MONTHS[lMon]} ${lYr}`
      : lMon !== mon
        ? `${day} ${MONTHS[mon]} – ${lDay} ${MONTHS[lMon]} ${yr}`
        : `${day}–${lDay} ${MONTHS[mon]} ${yr}`;
  return { key: start, start, endExcl, short: `${day} ${MONTHS[mon]}`, long };
}

/**
 * Ember-ember tren yang BERAKHIR pada ember terpilih (inklusif),
 * urut lama → baru. Contoh: Harian, 15 Okt → 2–15 Okt (14 hari).
 */
export function trendBuckets(gran: FinanceGranularity, selectedDate: string, count = TREND_BUCKETS[gran]): FinanceBucket[] {
  const last = bucketStart(gran, selectedDate);
  const out: FinanceBucket[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(makeBucket(gran, shiftBucket(gran, last, -i)));
  return out;
}

/** Kunci ember tempat sebuah tanggal "YYYY-MM-DD" jatuh. */
export function bucketKeyOf(gran: FinanceGranularity, date: string): string {
  return bucketStart(gran, date);
}

/** Parsing aman parameter URL ?g=&d= dengan fallback ke Harian/hari ini; tanggal masa depan dijepit ke hari ini. */
export function parseFinanceParams(
  sp: { g?: string; d?: string },
  today: string,
  fallback: FinanceGranularity = "day"
): { gran: FinanceGranularity; date: string } {
  const gran = isGranularity(sp.g) ? sp.g : fallback;
  const raw = isIsoDate(sp.d) ? sp.d : today;
  return { gran, date: raw > today ? today : raw };
}

/**
 * Akhir (eksklusif) rentang pembanding yang adil untuk periode berjalan.
 *
 * UAT 18 Okt 2026: dashboard Owner menulis "Pendapatan ▼52,4% vs bulan
 * sebelumnya" pada 18 Oktober — 18 hari Oktober dibanding 30 hari September.
 * Bila periode terpilih masih berjalan (hari ini di dalamnya), periode
 * sebelumnya dipotong ke jumlah hari yang sama (1–18 Sep). Periode yang
 * sudah lewat dibanding penuh seperti biasa.
 */
export function comparablePreviousEnd(
  previous: { start: string; endExcl: string },
  selected: { start: string; endExcl: string },
  today: string
): { endExcl: string; partial: boolean } {
  const isCurrent = selected.start <= today && today < selected.endExcl;
  if (!isCurrent) return { endExcl: previous.endExcl, partial: false };
  const day = 86_400_000;
  const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${selected.start}T00:00:00Z`)) / day) + 1;
  const cut = new Date(Date.parse(`${previous.start}T00:00:00Z`) + elapsed * day).toISOString().slice(0, 10);
  return cut < previous.endExcl ? { endExcl: cut, partial: true } : { endExcl: previous.endExcl, partial: false };
}
