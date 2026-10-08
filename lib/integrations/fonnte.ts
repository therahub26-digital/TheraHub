// ---------------------------------------------------------------------
// Klien tipis Fonnte (gerbang WhatsApp tidak resmi).
//
// !! Bentuk permintaan/respons di bawah ditulis dari ingatan dokumentasi
// Fonnte dan BELUM diuji terhadap API sungguhan. Cek ulang di
// docs.fonnte.com sebelum menyalakan fitur ini (parameter: target,
// message, countryCode, delay; respons: { status, reason, id, ... }).
//
// Fungsi ini TIDAK PERNAH melempar: kegagalan jaringan, timeout, dan
// penolakan Fonnte semuanya dikembalikan sebagai { ok:false, error } —
// kegagalan kirim pesan tidak boleh merusak apa pun di sekitarnya.
// ---------------------------------------------------------------------

const FONNTE_URL = "https://api.fonnte.com/send";
const TIMEOUT_MS = 4000;

export type FonnteResult =
  | { ok: true; response: unknown }
  | { ok: false; error: string; response?: unknown };

export async function sendFonnte(params: {
  token: string;
  target: string; // sudah dinormalkan: 62xxxxxxxxxx
  message: string;
  /** Jeda acak (detik) antar pesan, diurus Fonnte — bentuk "2-5". */
  delay?: string;
}): Promise<FonnteResult> {
  if (process.env.FONNTE_DRY_RUN === "1") {
    console.log(`[fonnte:dry-run] -> ${params.target}: ${params.message}`);
    return { ok: true, response: { dryRun: true } };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      target: params.target,
      message: params.message,
      countryCode: "62",
      delay: params.delay ?? "2-5",
    });
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: { Authorization: params.token },
      body,
      signal: ctrl.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* respons bukan JSON */
    }
    const j = json as { status?: boolean; reason?: string } | null;
    if (!res.ok) return { ok: false, error: `Fonnte HTTP ${res.status}`, response: json };
    if (!j || j.status !== true) return { ok: false, error: j?.reason || "Fonnte menolak pesan.", response: json };
    return { ok: true, response: json };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "Fonnte tidak menjawab (timeout)." : "Gagal menghubungi Fonnte." };
  } finally {
    clearTimeout(timer);
  }
}
