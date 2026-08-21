"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import {
  savePayrollSettings,
  runPayroll,
  addPayrollAdjustment,
  deletePayrollAdjustment,
  addBulkAdjustment,
  deleteAdjustmentBatch,
  withdrawSavings,
  type BulkTarget,
} from "@/lib/actions/payroll";
import { PAYROLL_COMPONENTS, type PayrollComponent } from "@/lib/payroll";
import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// Payroll setup + run controls.
//
// Every component is selectable. Each one says where its number comes
// from — three fill themselves from existing data, the rest are entered
// by the manager per period — so an admin ticking "Tabungan" knows they
// are agreeing to type a figure each month, not switching on something
// automatic.
// ---------------------------------------------------------------------

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

export function PayrollSettingsForm({
  outletId,
  initial,
  initialNote,
}: {
  outletId: string;
  initial: PayrollComponent[];
  initialNote: string;
}) {
  const [selected, setSelected] = useState<Set<PayrollComponent>>(new Set(initial));
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PayrollComponent) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="stack g3">
      <div className="stack g2">
        {PAYROLL_COMPONENTS.map((c) => {
          const auto = c.source !== "MANUAL";
          return (
            <label
              key={c.key}
              className="row g3"
              style={{
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "var(--bg-deep)",
                cursor: "pointer",
                alignItems: "flex-start",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.key)}
                disabled={isPending}
                onChange={() => toggle(c.key)}
                style={{ marginTop: 3 }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="small strong" style={{ color: "var(--text-1)" }}>
                  {c.label}{" "}
                  <span className="tiny dim">
                    ({c.kind === "earning" ? "pendapatan" : "potongan"})
                  </span>
                  {auto && (
                    <span className="tiny" style={{ color: "var(--accent)", marginLeft: 6 }}>otomatis</span>
                  )}
                </div>
                <div className="tiny dim">{c.hint}</div>
              </div>
            </label>
          );
        })}
      </div>

      <label className="stack g1">
        <span className="tiny dim">Catatan kebijakan (opsional)</span>
        <input
          className="input"
          value={note}
          disabled={isPending}
          placeholder="mis. Terapis berstatus lepas — penghasilan murni komisi."
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        />
      </label>

      <ErrorNote error={error} />
      {saved && <div className="tiny dim">Tersimpan.</div>}

      <div>
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await savePayrollSettings(outletId, [...selected], note);
              if (result.ok) setSaved(true);
              else setError(result.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan Struktur Payroll"}
        </button>
      </div>
    </div>
  );
}

export function RunPayrollButton({ outletId, period }: { outletId: string; period: string }) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ employeeCount: number; totalNet: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <button
        className="btn btn-primary btn-sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setResult(null);
          startTransition(async () => {
            const r = await runPayroll(outletId, period);
            if (r.ok) setResult({ employeeCount: r.employeeCount, totalNet: r.totalNet });
            else setError(r.error);
          });
        }}
      >
        <Icon name="wallet" size={13} /> {isPending ? "Menghitung…" : "Hitung Payroll"}
      </button>
      {result && (
        <div className="tiny dim" style={{ marginTop: 6 }}>
          {result.employeeCount} payslip · total {rp(result.totalNet)}
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Adjustment lines: the flexible half of a payslip.
//
// A payroll built only from fixed columns cannot express "rok navy
// 100.000" or "latihan 250.000" — real lines from Amethyst's actual
// payslips. So the manager types a label and an amount, and that label
// is what the employee later reads on their slip. Anything unnamed would
// be money taken with no explanation attached.
// ---------------------------------------------------------------------

const COMPONENT_OPTIONS: { value: PayrollComponent | ""; label: string; kind: "EARNING" | "DEDUCTION" }[] = [
  { value: "BONUS", label: "Bonus", kind: "EARNING" },
  { value: "THR", label: "THR", kind: "EARNING" },
  { value: "SAVINGS", label: "Tabungan", kind: "DEDUCTION" },
  { value: "LOAN", label: "Cicilan / Pinjaman", kind: "DEDUCTION" },
  { value: "LATE_PENALTY", label: "Potongan Terlambat", kind: "DEDUCTION" },
  { value: "ABSENCE_PENALTY", label: "Potongan Absen", kind: "DEDUCTION" },
  { value: "TAX", label: "Pajak (PPh 21)", kind: "DEDUCTION" },
  { value: "OTHER_DEDUCTIONS", label: "Potongan Lain", kind: "DEDUCTION" },
];

export function AddAdjustmentForm({
  employeeId,
  outletId,
  period,
}: {
  employeeId: string;
  outletId: string;
  period: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [component, setComponent] = useState<PayrollComponent | "">("OTHER_DEDUCTIONS");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const kind = COMPONENT_OPTIONS.find((o) => o.value === component)?.kind ?? "DEDUCTION";

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Icon name="plus" size={12} /> Tambah baris
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 260 }}>
      <input
        className="input"
        placeholder="Keterangan, mis. Seragam navy"
        value={label}
        disabled={isPending}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="row g2">
        <select
          className="select"
          value={component}
          disabled={isPending}
          onChange={(e) => setComponent(e.target.value as PayrollComponent | "")}
          style={{ flex: 1 }}
        >
          {COMPONENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Nominal"
          value={amount}
          disabled={isPending}
          onChange={(e) => setAmount(e.target.value)}
          style={{ maxWidth: 120 }}
        />
      </div>
      <div className="tiny dim">
        {kind === "DEDUCTION" ? "Mengurangi" : "Menambah"} take-home pay periode ini saja.
      </div>
      <ErrorNote error={error} />
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await addPayrollAdjustment({
                employeeId, outletId, period,
                label, kind, amount: Number(amount),
                component: component || null,
              });
              if (result.ok) {
                setLabel(""); setAmount(""); setOpen(false);
              } else setError(result.error);
            });
          }}
        >
          <Icon name="check" size={12} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </div>
  );
}

export function DeleteAdjustmentButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <span>
      <button
        className="btn btn-ghost btn-sm"
        disabled={isPending}
        title="Hapus baris"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await deletePayrollAdjustment(id);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <Icon name="x" size={12} />
      </button>
      <ErrorNote error={error} />
    </span>
  );
}

// ---------------------------------------------------------------------
// Potongan massal.
//
// One decision — "seragam baru, semua terapis, Rp100.000, tiga bulan" —
// entered once. The preview line under the form spells out exactly how
// many rows are about to be written, because the difference between one
// period and twelve is the difference between Rp100.000 and Rp1,2 juta
// taken from each person, and that difference should not hide inside a
// number input.
// ---------------------------------------------------------------------

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

export function BulkAdjustmentForm({
  outletId,
  period,
  therapistCount,
  staffCount,
}: {
  outletId: string;
  period: string;
  therapistCount: number;
  staffCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [component, setComponent] = useState<PayrollComponent | "">("OTHER_DEDUCTIONS");
  const [target, setTarget] = useState<BulkTarget>("THERAPISTS");
  const [periodCount, setPeriodCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const kind = COMPONENT_OPTIONS.find((o) => o.value === component)?.kind ?? "DEDUCTION";
  const people = target === "THERAPISTS" ? therapistCount : staffCount;
  const rows = people * periodCount;
  const perPerson = (Number(amount) || 0) * periodCount;
  const lastPeriod = shiftPeriod(period, periodCount - 1);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setDone(null); }}>
        <Icon name="users" size={13} /> Potongan Massal
      </button>
    );
  }

  return (
    <div className="stack g3" style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
      <div className="small strong" style={{ color: "var(--text-1)" }}>
        Terapkan ke banyak karyawan sekaligus
      </div>

      <input
        className="input"
        placeholder="Keterangan, mis. Seragam baru 2026"
        value={label}
        disabled={isPending}
        onChange={(e) => setLabel(e.target.value)}
      />

      <div className="row g2 wrap">
        <select className="select" value={target} disabled={isPending}
          onChange={(e) => setTarget(e.target.value as BulkTarget)} style={{ flex: 1, minWidth: 150 }}>
          <option value="THERAPISTS">Semua terapis ({therapistCount})</option>
          <option value="ALL_STAFF">Semua karyawan ({staffCount})</option>
        </select>
        <select className="select" value={component} disabled={isPending}
          onChange={(e) => setComponent(e.target.value as PayrollComponent | "")} style={{ flex: 1, minWidth: 150 }}>
          {COMPONENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="row g2 wrap">
        <input className="input" type="number" min={0} placeholder="Nominal per bulan"
          value={amount} disabled={isPending}
          onChange={(e) => setAmount(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        <select className="select" value={periodCount} disabled={isPending}
          onChange={(e) => setPeriodCount(Number(e.target.value))} style={{ flex: 1, minWidth: 130 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} bulan</option>
          ))}
        </select>
      </div>

      {/* The whole point of this preview: make the total visible BEFORE
          it is committed, not after twelve rows already exist. */}
      <div className="tiny" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
        {rows} baris akan dibuat — {people} orang × {periodCount} bulan
        {periodCount > 1 && <> ({periodLabel(period)} s/d {periodLabel(lastPeriod)})</>}.
        {perPerson > 0 && (
          <> Total {kind === "DEDUCTION" ? "dipotong" : "ditambahkan"} <strong>{rp(perPerson)}</strong> per orang.</>
        )}
      </div>

      {periodCount > 1 && (
        <div className="tiny" style={{ color: "var(--warning)", lineHeight: 1.5 }}>
          <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          Baris untuk bulan-bulan berikutnya dibuat sekarang dan tidak berhenti sendiri.
          Kalau ada yang lunas lebih cepat atau berhenti kerja, hapus barisnya lewat tombol Batalkan batch.
        </div>
      )}

      <ErrorNote error={error} />
      {done && <div className="tiny" style={{ color: "var(--success)" }}>{done}</div>}

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null); setDone(null);
            startTransition(async () => {
              const r = await addBulkAdjustment({
                outletId, startPeriod: period, periodCount, target,
                label, kind, amount: Number(amount),
                component: component || null,
              });
              if (r.ok) {
                setDone(
                  `${r.rowsCreated} baris dibuat untuk ${r.employeeCount} orang` +
                  (r.skipped ? ` · ${r.skipped} dilewati (sudah punya baris "${label}")` : "")
                );
                setLabel(""); setAmount("");
              } else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={12} /> {isPending ? "Menerapkan…" : `Terapkan ke ${people} orang`}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Tutup</button>
      </div>
    </div>
  );
}

export function DeleteBatchButton({ batchId, label, rowCount }: { batchId: string; label: string; rowCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
        <Icon name="x" size={12} /> Batalkan batch
      </button>
    );
  }

  return (
    <span className="row g2">
      <span className="tiny" style={{ color: "var(--danger)" }}>Hapus {rowCount} baris &quot;{label}&quot;?</span>
      <button
        className="btn btn-danger btn-sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await deleteAdjustmentBatch(batchId);
            if (!r.ok) { setError(r.error); setConfirming(false); }
          });
        }}
      >
        {isPending ? "Menghapus…" : "Ya, hapus"}
      </button>
      <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setConfirming(false)}>Batal</button>
      <ErrorNote error={error} />
    </span>
  );
}

// ---------------------------------------------------------------------
// Pencairan tabungan.
//
// Defaults to the full balance because that is what a Lebaran payout
// normally is, but stays editable for a partial one. The balance is
// shown right on the button so nobody has to go look it up in another
// screen to know whether the number they typed is sane — and the server
// refuses anything above it regardless of what the form allowed.
// ---------------------------------------------------------------------

export function WithdrawSavingsButton({
  employeeId,
  outletId,
  period,
  balance,
}: {
  employeeId: string;
  outletId: string;
  period: string;
  balance: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (balance <= 0) return null;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setAmount(String(balance)); }}>
        <Icon name="wallet" size={12} /> Cairkan
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 220 }}>
      <div className="tiny dim">Saldo tabungan {rp(balance)}</div>
      <input
        className="input"
        type="number"
        min={0}
        max={balance}
        value={amount}
        disabled={isPending}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="tiny dim">
        Masuk sebagai penghasilan di slip {periodLabel(period)} dan mengurangi saldo tabungan.
      </div>
      <ErrorNote error={error} />
      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await withdrawSavings({
                employeeId, outletId, period, amount: Number(amount),
              });
              if (r.ok) setOpen(false);
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={12} /> {isPending ? "Memproses…" : "Cairkan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Batal</button>
      </div>
    </div>
  );
}
