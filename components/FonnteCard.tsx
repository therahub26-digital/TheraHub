"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Badge, Card, Switch } from "@/components/ui";
import { saveFonnteToken, sendTestMessage, setReminderSwitch } from "@/lib/actions/integrations";
import type { FonnteStatus } from "@/lib/data/integrations";

// Kartu WhatsApp (Fonnte) di Admin > Integrations. Satu-satunya kartu di
// halaman itu yang benar-benar tersambung ke sesuatu.

export default function FonnteCard({ status }: { status: FonnteStatus }) {
  const [token, setToken] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [cust, setCust] = useState(status.reminderCustomer);
  const [ther, setTher] = useState(status.reminderTherapist);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string, onFail?: () => void) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (r.ok) setNote({ tone: "ok", text: okText });
      else {
        onFail?.();
        setNote({ tone: "err", text: r.error });
      }
    });

  const connected = Boolean(status.tokenLast4);

  return (
    <Card className="card-pad" style={{ marginBottom: "var(--s-4)" }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="row g3">
          <span className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Icon name="message-square" size={19} />
          </span>
          <div>
            <div className="strong" style={{ color: "var(--text-1)" }}>WhatsApp — Fonnte</div>
            <div className="tiny dim">Reminder otomatis 15 menit sebelum booking</div>
          </div>
        </div>
        <Badge tone={connected ? "success" : "neutral"} dot>
          {connected ? `Token …${status.tokenLast4}` : "Belum terhubung"}
        </Badge>
      </div>

      {!status.available ? (
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          Tabel integrasi belum ada di database — jalankan migrasi <code>0035_whatsapp_reminders.sql</code> dulu.
        </p>
      ) : (
        <div className="stack g3" style={{ marginTop: 14 }}>
          <div className="stack g1">
            <label className="tiny dim" htmlFor="fonnte-token">Token perangkat Fonnte</label>
            <div className="row g2">
              <input
                id="fonnte-token"
                className="input"
                type="password"
                autoComplete="off"
                placeholder={connected ? "Tempel token baru untuk mengganti" : "Tempel token dari dashboard Fonnte"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || token.trim().length === 0}
                onClick={() => run(() => saveFonnteToken(token), "Token tersimpan.", undefined)}
              >
                Simpan token
              </button>
            </div>
            <span className="tiny dim">Token tidak pernah ditampilkan kembali setelah disimpan.</span>
          </div>

          <div className="row between">
            <div>
              <div className="small strong">Reminder ke tamu</div>
              <div className="tiny dim">Semua tamu yang booking, tanpa pengecualian.</div>
            </div>
            <Switch
              on={cust}
              pending={pending}
              label="Reminder ke tamu"
              onChange={(next) => {
                const prev = cust;
                setCust(next);
                run(() => setReminderSwitch("customer", next), next ? "Reminder tamu menyala." : "Reminder tamu mati.", () => setCust(prev));
              }}
            />
          </div>

          <div className="row between">
            <div>
              <div className="small strong">Reminder ke terapis</div>
              <div className="tiny dim" style={{ color: "var(--warning)" }}>
                Nyalakan hanya setelah nomor seluruh terapis diganti nomor asli.
              </div>
            </div>
            <Switch
              on={ther}
              pending={pending}
              label="Reminder ke terapis"
              onChange={(next) => {
                const prev = ther;
                setTher(next);
                run(() => setReminderSwitch("therapist", next), next ? "Reminder terapis menyala." : "Reminder terapis mati.", () => setTher(prev));
              }}
            />
          </div>

          <div className="stack g1" style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <label className="tiny dim" htmlFor="fonnte-test">Kirim pesan uji ke nomor Anda</label>
            <div className="row g2">
              <input
                id="fonnte-test"
                className="input"
                inputMode="tel"
                placeholder="0812 3456 7890"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending || !connected || testPhone.trim().length === 0}
                onClick={() => run(() => sendTestMessage(testPhone), "Pesan uji terkirim — cek WhatsApp Anda.")}
              >
                Kirim uji
              </button>
            </div>
          </div>

          <div className="tiny dim">
            24 jam terakhir: {status.last24h.sent} terkirim · {status.last24h.failed} gagal · {status.last24h.skipped} dilewati
          </div>

          {note && (
            <span className="tiny" style={{ color: note.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
              {note.text}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
