import { createClient } from "@/lib/supabase/server";

// Pembacaan status integrasi WhatsApp untuk Admin > Integrations.
// Hanya kolom non-rahasia — device_token tidak bisa dibaca klien (0035).

export interface FonnteStatus {
  /** false = migrasi 0035 belum diterapkan, atau tabel tidak terbaca. */
  available: boolean;
  tokenLast4: string | null;
  reminderCustomer: boolean;
  reminderTherapist: boolean;
  /** Ringkasan message_log 24 jam terakhir. */
  last24h: { sent: number; failed: number; skipped: number };
}

export async function getFonnteStatus(): Promise<FonnteStatus> {
  const supabase = await createClient();
  const empty: FonnteStatus = {
    available: false,
    tokenLast4: null,
    reminderCustomer: false,
    reminderTherapist: false,
    last24h: { sent: 0, failed: 0, skipped: 0 },
  };

  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("device_token_last4, reminder_customer, reminder_therapist")
    .eq("provider", "fonnte")
    .maybeSingle();
  if (error) return empty; // paling sering: tabel belum ada

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: logs } = await supabase.from("message_log").select("status").gte("created_at", since);
  const count = (s: string) => (logs ?? []).filter((l) => l.status === s).length;

  return {
    available: true,
    tokenLast4: (data?.device_token_last4 as string | null) ?? null,
    reminderCustomer: Boolean(data?.reminder_customer),
    reminderTherapist: Boolean(data?.reminder_therapist),
    last24h: { sent: count("SENT"), failed: count("FAILED"), skipped: count("SKIPPED") },
  };
}
