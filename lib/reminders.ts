import { plusMinutes, toHHMM } from "@/lib/wallclock";

// ---------------------------------------------------------------------
// Fungsi MURNI untuk reminder WhatsApp (tanpa basis data, tanpa jaringan)
// supaya bisa diuji sendiri: scripts/test-reminders.mjs.
// Spesifikasi: project doc "therahub-spec-reminder-wa".
//
// Semua waktu di sini memakai konvensi wall-clock-as-UTC (lib/wallclock.ts).
// `now` HARUS berasal dari nowIso(), bukan Date.now() mentah.
// ---------------------------------------------------------------------

/** Pesan dikirim jika jam mulai berada di antara now+5 dan now+15 menit. */
export const WINDOW_MIN_MINUTES = 5;
export const WINDOW_MAX_MINUTES = 15;
/** Batas pesan per panggilan cron (fungsi serverless Hobby = 10 detik). */
export const MAX_PER_TICK = 4;
/** Percobaan ulang maksimum untuk satu pesan. */
export const MAX_ATTEMPTS = 2;
/** Baris PENDING yang lebih tua dari ini dianggap macet dan boleh diklaim ulang. */
export const STALE_PENDING_MS = 3 * 60_000;

export type ReminderKind = "REMINDER_CUSTOMER" | "REMINDER_THERAPIST";

/** Batas bawah/atas `scheduled_start` yang berhak diingatkan pada tick ini. */
export function reminderWindow(nowWall: string): { from: string; to: string } {
  return { from: plusMinutes(nowWall, WINDOW_MIN_MINUTES), to: plusMinutes(nowWall, WINDOW_MAX_MINUTES) };
}

/**
 * "0812-3456-7890" / "+62 812 3456 7890" / "6281234567890" -> "6281234567890".
 * Mengembalikan null bila bukan nomor seluler Indonesia yang masuk akal —
 * lebih baik melewati satu pesan daripada mengirim ke nomor ngawur.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

export interface ReminderContext {
  brand: string;
  outletName: string;
  outletPhone?: string | null;
  customerName: string;
  therapistName: string;
  packageName: string;
  durationMin: number;
  /** scheduled_start apa adanya dari basis data (ISO wall-clock). */
  scheduledStart: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function customerMessage(c: ReminderContext): string {
  const contact = normalizePhone(c.outletPhone) ?? "";
  const tail = contact ? ` Bila berhalangan, mohon hubungi ${c.outletPhone!.trim()}.` : "";
  return clean(
    `Halo ${c.customerName}, pengingat dari ${c.brand} ${c.outletName}: booking ${c.packageName} Anda hari ini pukul ${toHHMM(c.scheduledStart)} bersama ${c.therapistName}. Kami tunggu ya.${tail} Pesan otomatis.`,
  );
}

export function therapistMessage(c: ReminderContext): string {
  return clean(
    `Halo ${c.therapistName}, 15 menit lagi ada tamu: ${c.customerName} pukul ${toHHMM(c.scheduledStart)}, ${c.packageName} ${c.durationMin} menit. Mohon bersiap. ${c.brand}`,
  );
}

/** Boleh diklaim (dikirim/dicoba ulang) berdasarkan baris log yang ada? */
export function canClaim(
  row: { status: string; attempts: number; created_at: string } | null,
  nowMs: number,
): boolean {
  if (!row) return true;
  if (row.status === "FAILED") return row.attempts < MAX_ATTEMPTS;
  if (row.status === "PENDING") return nowMs - new Date(row.created_at).getTime() > STALE_PENDING_MS;
  return false; // SENT / SKIPPED: final
}
