"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Field, Switch, InfoNote } from "@/components/ui";
import { setOutletPolicy, setDepositPolicy } from "@/lib/actions/outlets";
import { rp } from "@/lib/format";
import type { DepositPolicy, Outlet } from "@/lib/types";
import { calcDeposit } from "@/lib/data/outlets";

// ---------------------------------------------------------------------
// The write-side of /manager/settings — new 2026-08-24 (backlog 14).
//
// This page previously rendered MOCK outlet data (PRIMARY_OUTLET) into
// editable inputs whose "Simpan Perubahan" button was disabled. Two
// separate problems in one screen: the numbers on display weren't the
// signed-in manager's outlet at all, and nothing could be changed even
// if they had been. Tax and service charge — which decide what every
// guest is billed — were database-only edits.
//
// Both cards below now read and write the real outlet row.
// ---------------------------------------------------------------------

const LATE_POLICY_LABEL: Record<Outlet["latePolicy"], string> = {
  FULL_DURATION: "Durasi penuh — sesi tetap sepanjang yang dibeli",
  FIXED_SLOT: "Slot tetap — sesi berakhir pada jam terjadwal",
  GRACE_PERIOD: "Grace period — toleransi terlambat sekian menit",
};

const BOOKING_SOURCES = ["Customer App", "WhatsApp", "Phone", "Walk-in", "Kasir"] as const;

/** Sample tickets used to show what the deposit rule actually produces. */
const SIMULASI = [120_000, 200_000, 495_000];

function SaveRow({
  dirty,
  pending,
  done,
  error,
  onSave,
  label = "Simpan",
}: {
  dirty: boolean;
  pending: boolean;
  done: boolean;
  error: string | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <>
      <div className="row g2" style={{ alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" disabled={pending || !dirty} onClick={onSave}>
          <Icon name="save" size={13} /> {pending ? "Menyimpan…" : label}
        </button>
        {dirty && !pending && <span className="tiny dim">Ada perubahan yang belum disimpan.</span>}
        {!dirty && done && (
          <span className="tiny" style={{ color: "var(--success)" }}>
            <Icon name="check" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Tersimpan.
          </span>
        )}
      </div>
      {error && (
        <div className="tiny" style={{ color: "var(--danger)" }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {error}
        </div>
      )}
    </>
  );
}

// ==================================================== PAJAK & SERVICE

export function TaxServiceEditor({
  outletId,
  taxPct,
  serviceChargePct,
  latePolicy,
  gracePeriodMin,
}: {
  outletId: string;
  taxPct: number;
  serviceChargePct: number;
  latePolicy: Outlet["latePolicy"];
  gracePeriodMin: number;
}) {
  const initial = {
    tax: String(taxPct),
    service: String(serviceChargePct),
    late: latePolicy,
    grace: String(gracePeriodMin),
  };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  function onSave() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const r = await setOutletPolicy(outletId, {
        taxPct: Number.parseFloat(v.tax),
        serviceChargePct: Number.parseFloat(v.service),
        latePolicy: v.late,
        gracePeriodMin: Number.parseInt(v.grace, 10),
      });
      if (!r.ok) { setError(r.error); return; }
      setSaved(v);
      setDone(true);
    });
  }

  return (
    <div className="stack g3">
      <Field label="Pajak / PB1 (%)" hint="Diterapkan ke setiap transaksi di kasir">
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={v.tax}
          disabled={isPending}
          onChange={(e) => setV({ ...v, tax: e.target.value })}
        />
      </Field>
      <Field label="Service Charge (%)" hint="Ditambahkan ke subtotal sebelum pajak dihitung">
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={v.service}
          disabled={isPending}
          onChange={(e) => setV({ ...v, service: e.target.value })}
        />
      </Field>
      <Field label="Kebijakan Keterlambatan">
        <select
          className="select"
          value={v.late}
          disabled={isPending}
          onChange={(e) => setV({ ...v, late: e.target.value as Outlet["latePolicy"] })}
        >
          {(Object.keys(LATE_POLICY_LABEL) as Outlet["latePolicy"][]).map((k) => (
            <option key={k} value={k}>{LATE_POLICY_LABEL[k]}</option>
          ))}
        </select>
      </Field>
      <Field label="Grace Period (menit)" hint="Dipakai bila kebijakan di atas Grace period">
        <input
          className="input"
          type="number"
          min={0}
          max={120}
          value={v.grace}
          disabled={isPending}
          onChange={(e) => setV({ ...v, grace: e.target.value })}
        />
      </Field>

      <SaveRow dirty={dirty} pending={isPending} done={done} error={error} onSave={onSave} />

      <InfoNote icon="info">
        Perubahan berlaku untuk transaksi <strong>berikutnya</strong>. Struk yang sudah terbit
        menyimpan angka hasil hitungannya sendiri, jadi tidak ikut berubah.
      </InfoNote>
    </div>
  );
}

// ============================================================= DEPOSIT

export function DepositEditor({ outletId, deposit }: { outletId: string; deposit: DepositPolicy }) {
  const initial = {
    enabled: deposit.enabled,
    type: deposit.type,
    value: String(deposit.value),
    minTicket: String(deposit.minTicket),
    expiryMin: String(deposit.expiryMin),
    refundable: deposit.refundable,
    appliesTo: deposit.appliesTo as string[],
    note: deposit.note,
  };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  // Preview uses the same pure helper the rest of the app calculates
  // with, so what a manager sees here is what a guest would be quoted —
  // not a second implementation that can drift.
  const previewPolicy: DepositPolicy = {
    enabled: v.enabled,
    type: v.type,
    value: Number.parseFloat(v.value) || 0,
    minTicket: Number.parseFloat(v.minTicket) || 0,
    expiryMin: Number.parseInt(v.expiryMin, 10) || 0,
    refundable: v.refundable,
    appliesTo: v.appliesTo as DepositPolicy["appliesTo"],
    note: v.note,
  };

  function toggleSource(src: string) {
    setV({
      ...v,
      appliesTo: v.appliesTo.includes(src) ? v.appliesTo.filter((s) => s !== src) : [...v.appliesTo, src],
    });
  }

  function onSave() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const r = await setDepositPolicy(outletId, {
        enabled: v.enabled,
        type: v.type,
        value: Number.parseFloat(v.value) || 0,
        minTicket: Number.parseFloat(v.minTicket) || 0,
        expiryMin: Number.parseInt(v.expiryMin, 10) || 0,
        refundable: v.refundable,
        appliesTo: v.appliesTo,
        note: v.note,
      });
      if (!r.ok) { setError(r.error); return; }
      setSaved(v);
      setDone(true);
    });
  }

  return (
    <div className="stack g4">
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Deposit diaktifkan</div>
          <div className="tiny dim">Matikan bila outlet ini tidak meminta pembayaran di muka</div>
        </div>
        <Switch
          on={v.enabled}
          pending={isPending}
          label="Deposit booking"
          onChange={(next) => setV({ ...v, enabled: next })}
        />
      </div>

      <div className="grid grid-2">
        <Field label="Metode Perhitungan" hint="Nominal tetap atau persentase dari harga layanan">
          <select
            className="select"
            value={v.type}
            disabled={isPending}
            onChange={(e) => setV({ ...v, type: e.target.value as DepositPolicy["type"] })}
          >
            <option value="FIXED">Nominal tetap (Rupiah)</option>
            <option value="PERCENT">Persentase dari harga layanan</option>
          </select>
        </Field>
        <Field
          label={v.type === "FIXED" ? "Nominal Deposit (Rp)" : "Persentase Deposit (%)"}
          hint={v.type === "FIXED" ? "Rupiah per booking" : "Persen dari harga layanan"}
        >
          <input
            className="input"
            type="number"
            min={0}
            value={v.value}
            disabled={isPending}
            onChange={(e) => setV({ ...v, value: e.target.value })}
          />
        </Field>
        <Field label="Minimum Total Transaksi (Rp)" hint="Diisi 0 = deposit berlaku untuk semua booking">
          <input
            className="input"
            type="number"
            min={0}
            value={v.minTicket}
            disabled={isPending}
            onChange={(e) => setV({ ...v, minTicket: e.target.value })}
          />
        </Field>
        <Field label="Batas Waktu Pembayaran (menit)" hint="Acuan staf saat menahan slot booking">
          <input
            className="input"
            type="number"
            min={0}
            value={v.expiryMin}
            disabled={isPending}
            onChange={(e) => setV({ ...v, expiryMin: e.target.value })}
          />
        </Field>
      </div>

      <div>
        <label className="small bold" style={{ color: "var(--text-2)", display: "block", marginBottom: 8 }}>
          Berlaku untuk Sumber Booking
        </label>
        <div className="row g2 wrap">
          {BOOKING_SOURCES.map((src) => {
            const on = v.appliesTo.includes(src);
            return (
              <button
                key={src}
                type="button"
                className={`chip ${on ? "on" : ""}`}
                disabled={isPending}
                aria-pressed={on}
                onClick={() => toggleSource(src)}
              >
                {on && <Icon name="check" size={12} />}
                {src}
              </button>
            );
          })}
        </div>
      </div>

      <div className="row between" style={{ paddingTop: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Deposit dapat dikembalikan</div>
          <div className="tiny dim">Bila tamu membatalkan sesuai kebijakan pembatalan outlet</div>
        </div>
        <Switch
          on={v.refundable}
          pending={isPending}
          label="Deposit dapat dikembalikan"
          onChange={(next) => setV({ ...v, refundable: next })}
        />
      </div>

      <Field label="Catatan pada Halaman Booking" hint="Ditampilkan ke tamu sebelum konfirmasi booking">
        <textarea
          className="textarea"
          value={v.note}
          disabled={isPending}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
      </Field>

      {/* Live preview of the rule being edited — a percentage rule is
          impossible to sanity-check without seeing the rupiah it lands on. */}
      <div>
        <div className="small bold" style={{ color: "var(--text-2)", marginBottom: 8 }}>Simulasi</div>
        {v.enabled ? (
          <div className="stack g2">
            {SIMULASI.map((total) => {
              const d = calcDeposit(previewPolicy, total);
              return (
                <div key={total} className="row between small" style={{ paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                  <span className="muted">Booking {rp(total, { short: true })}</span>
                  {d > 0 ? (
                    <span className="strong" style={{ color: "var(--accent)" }}>{rp(d)}</span>
                  ) : (
                    <span className="tiny dim">tanpa deposit</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="small dim">
            Deposit nonaktif — semua booking dapat dibuat tanpa pembayaran di muka.
          </div>
        )}
      </div>

      <SaveRow dirty={dirty} pending={isPending} done={done} error={error} onSave={onSave} label="Simpan Deposit" />

      <InfoNote tone="warning" icon="alert-triangle">
        Aplikasi <strong>belum bisa menagih deposit secara online</strong> — payment gateway belum
        terpasang. Pengaturan ini menentukan apa yang diberitahukan ke tamu dan dipakai staf sebagai
        acuan; uangnya tetap diterima langsung di outlet.
      </InfoNote>
    </div>
  );
}
